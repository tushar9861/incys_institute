import { z } from "zod";
import { rows, one, transaction, audit, emit } from "./db";
import { type User, has, allow } from "./auth";
import { requireThat } from "./errors";
const uuid = z.string().uuid();
export async function bookAppointment(user: User, input: unknown) {
  const data = z
    .object({
      serviceId: uuid,
      practitionerId: uuid,
      startsAt: z.iso.datetime({ offset: true }),
      mode: z.enum(["in_person", "online"]),
      consent: z.literal(true),
    })
    .parse(input);
  requireThat(
    new Date(data.startsAt).getTime() > Date.now(),
    400,
    "Choose a future appointment.",
  );
  return transaction(async (db) => {
    const service = await one(
      "SELECT s.* FROM services s JOIN practitioner_services p ON s.id=p.service_id JOIN users u ON u.id=p.practitioner_id WHERE s.id=$1 AND p.practitioner_id=$2 AND s.active AND u.active",
      [data.serviceId, data.practitionerId],
      db,
    );
    requireThat(service, 404, "This service or practitioner is unavailable.");
    const end = new Date(
      new Date(data.startsAt).getTime() + service.duration_minutes * 60000,
    ).toISOString();
    requireThat(
      await one(
        "SELECT id FROM availability WHERE practitioner_id=$1 AND starts_at<=$2 AND ends_at>=$3",
        [data.practitionerId, data.startsAt, end],
        db,
      ),
      409,
      "Choose a time within the practitioner’s availability.",
    );
    const appointment = await one(
      `INSERT INTO appointments(patient_id,practitioner_id,service_id,starts_at,ends_at,mode,price_paise) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        user.id,
        data.practitionerId,
        data.serviceId,
        data.startsAt,
        end,
        data.mode,
        service.price_paise,
      ],
      db,
    );
    await db.query(
      "INSERT INTO consents(user_id,purpose,version,granted) VALUES($1,$2,'1',true)",
      [user.id, data.mode === "online" ? "teleconsultation" : "appointment"],
    );
    await audit(db, user.id, "appointment.created", appointment!.id);
    await emit(db, "AppointmentBooked", appointment!.id, user.id);
    await db.query(
      "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
      [
        user.id,
        "Appointment confirmed",
        "Your booking is confirmed. View your appointments for details.",
      ],
    );
    return appointment;
  });
}
export async function appointments(user: User) {
  const scope = has(user, "admin", "reception")
    ? "true"
    : has(user, "clinician")
      ? "a.practitioner_id=$1"
      : "a.patient_id=$1";
  return rows(
    `SELECT a.id,a.patient_id,a.practitioner_id,a.service_id,a.starts_at,a.ends_at,a.mode,a.status,a.price_paise,a.payment_status,a.created_at,s.name AS service_name,p.name AS practitioner_name,u.name AS patient_name
    FROM appointments a JOIN services s ON s.id=a.service_id JOIN users p ON p.id=a.practitioner_id JOIN users u ON u.id=a.patient_id
    WHERE ${scope} ORDER BY a.starts_at DESC LIMIT 200`,
    scope === "true" ? [] : [user.id],
  );
}
export async function changeAppointment(
  user: User,
  id: string,
  input: unknown,
) {
  const data = z
    .object({ status: z.enum(["cancelled", "completed", "no_show"]) })
    .parse(input);
  return transaction(async (db) => {
    const a = await one(
      "SELECT * FROM appointments WHERE id=$1 FOR UPDATE",
      [id],
      db,
    );
    requireThat(a, 404, "Appointment not found.");
    const staff =
      has(user, "admin", "reception") ||
      (has(user, "clinician") && a.practitioner_id === user.id);
    requireThat(
      staff || a.patient_id === user.id,
      403,
      "You cannot change this appointment.",
    );
    requireThat(
      staff || data.status === "cancelled",
      403,
      "Only staff can record attendance.",
    );
    requireThat(
      a.status === "confirmed",
      409,
      "This appointment has already been closed.",
    );
    if (!staff)
      requireThat(
        new Date(a.starts_at).getTime() > Date.now(),
        409,
        "Contact reception to change an appointment that has started.",
      );
    const result = await one(
      "UPDATE appointments SET status=$1 WHERE id=$2 RETURNING *",
      [data.status, id],
      db,
    );
    await audit(db, user.id, `appointment.${data.status}`, id);
    await emit(db, "AppointmentChanged", id, a.patient_id);
    return result;
  });
}
export async function setAppointmentMeeting(
  user: User,
  id: string,
  input: unknown,
) {
  const d = z.object({ meetingUrl: z.string().url().max(2000) }).parse(input);
  requireThat(
    new URL(d.meetingUrl).protocol === "https:",
    400,
    "Meeting links must use HTTPS.",
  );
  return transaction(async (db) => {
    const a = await one(
      "SELECT * FROM appointments WHERE id=$1 FOR UPDATE",
      [id],
      db,
    );
    requireThat(
      a &&
        (has(user, "admin", "reception") ||
          (has(user, "clinician") && a.practitioner_id === user.id)),
      403,
      "Only the assigned practitioner or reception can arrange this meeting.",
    );
    requireThat(
      a.mode === "online" && a.status === "confirmed",
      409,
      "An active online appointment is required.",
    );
    await db.query("UPDATE appointments SET meeting_url=$1 WHERE id=$2", [
      d.meetingUrl,
      id,
    ]);
    await audit(db, user.id, "appointment.meeting_set", id);
    return { saved: true };
  });
}
export async function joinAppointment(user: User, id: string) {
  return transaction(async (db) => {
    const a = await one("SELECT * FROM appointments WHERE id=$1", [id], db);
    requireThat(
      a &&
        (a.patient_id === user.id ||
          (has(user, "clinician") && a.practitioner_id === user.id)),
      403,
      "Only the patient and assigned practitioner can join.",
    );
    requireThat(
      a.mode === "online" && a.status === "confirmed",
      409,
      "This online appointment is unavailable.",
    );
    requireThat(
      a.patient_id !== user.id ||
        a.price_paise === 0 ||
        a.payment_status === "paid",
      403,
      "Clear the consultation fee before joining.",
    );
    const now = Date.now();
    requireThat(
      now >= new Date(a.starts_at).getTime() - 15 * 60000 &&
        now <= new Date(a.ends_at).getTime() + 15 * 60000,
      409,
      "Joining is available from 15 minutes before the appointment until 15 minutes after.",
    );
    requireThat(
      a.meeting_url,
      409,
      "The practitioner has not added the meeting yet.",
    );
    await audit(db, user.id, "appointment.joined", id);
    return { url: a.meeting_url };
  });
}
export async function clinicalRecords(user: User, appointmentId: string) {
  const a = await one("SELECT * FROM appointments WHERE id=$1", [
    appointmentId,
  ]);
  requireThat(
    a &&
      (a.patient_id === user.id ||
        (has(user, "clinician") && a.practitioner_id === user.id)),
    403,
    "Clinical records are restricted to the patient and assigned practitioner.",
  );
  return transaction(async (db) => {
    await audit(db, user.id, "clinical_record.viewed", appointmentId);
    return rows(
      "SELECT n.*,u.name AS author_name FROM clinical_notes n JOIN users u ON u.id=n.author_id WHERE appointment_id=$1 ORDER BY created_at",
      [appointmentId],
      db,
    );
  });
}
export async function addClinicalNote(
  user: User,
  appointmentId: string,
  input: unknown,
) {
  allow(user, "clinician");
  const d = z
    .object({
      body: z.string().trim().min(5).max(15000),
      supersedesId: uuid.optional(),
    })
    .parse(input);
  return transaction(async (db) => {
    requireThat(
      await one(
        "SELECT id FROM appointments WHERE id=$1 AND practitioner_id=$2",
        [appointmentId, user.id],
        db,
      ),
      403,
      "Only the assigned practitioner can write this record.",
    );
    if (d.supersedesId)
      requireThat(
        await one(
          "SELECT id FROM clinical_notes WHERE id=$1 AND appointment_id=$2",
          [d.supersedesId, appointmentId],
          db,
        ),
        400,
        "Amendments must reference a note in this encounter.",
      );
    const note = await one(
      "INSERT INTO clinical_notes(appointment_id,author_id,body,supersedes_id) VALUES($1,$2,$3,$4) RETURNING *",
      [appointmentId, user.id, d.body, d.supersedesId || null],
      db,
    );
    await audit(db, user.id, "clinical_note.created", note!.id);
    return note;
  });
}
export async function createPlan(user: User, input: unknown) {
  allow(user, "clinician");
  const d = z
    .object({
      patientId: uuid,
      title: z.string().min(3).max(160),
      instructions: z.string().min(5).max(10000),
      sessionsTotal: z.number().int().min(1).max(100),
    })
    .parse(input);
  return transaction(async (db) => {
    requireThat(
      await one(
        "SELECT id FROM appointments WHERE patient_id=$1 AND practitioner_id=$2",
        [d.patientId, user.id],
        db,
      ),
      403,
      "You can only create plans for your assigned patients.",
    );
    const p = await one(
      "INSERT INTO treatment_plans(patient_id,practitioner_id,title,instructions,sessions_total) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [d.patientId, user.id, d.title, d.instructions, d.sessionsTotal],
      db,
    );
    await audit(db, user.id, "treatment_plan.created", p!.id);
    return p;
  });
}
export async function recordTreatment(user: User, id: string, input: unknown) {
  allow(user, "clinician");
  const { note } = z
    .object({ note: z.string().min(3).max(10000) })
    .parse(input);
  return transaction(async (db) => {
    const plan = await one(
      "SELECT * FROM treatment_plans WHERE id=$1 AND practitioner_id=$2 FOR UPDATE",
      [id, user.id],
      db,
    );
    requireThat(
      plan && plan.status === "active",
      403,
      "No active plan assigned to you.",
    );
    const count = await one(
      "SELECT count(*)::int AS n FROM treatment_sessions WHERE plan_id=$1",
      [id],
      db,
    );
    requireThat(
      count!.n < plan.sessions_total,
      409,
      "All sessions have been recorded.",
    );
    const result = await one(
      "INSERT INTO treatment_sessions(plan_id,author_id,note) VALUES($1,$2,$3) RETURNING *",
      [id, user.id, note],
      db,
    );
    if (count!.n + 1 === plan.sessions_total)
      await db.query(
        "UPDATE treatment_plans SET status='completed' WHERE id=$1",
        [id],
      );
    await audit(db, user.id, "treatment_session.recorded", result!.id);
    return result;
  });
}
