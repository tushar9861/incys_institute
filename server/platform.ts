import { z } from "zod";
import { rows, one, pool, transaction, audit, type DB } from "./db";
import { type User, has, allow } from "./auth";
import { requireThat } from "./errors";
import { appointments } from "./clinic";
import { enrolments, cohortAccess } from "./learning";
import { orderList } from "./commerce";
const uuid = z.string().uuid(),
  text = z.string().trim().min(1).max(300),
  content = z.string().trim().min(3).max(15000);
export async function catalog() {
  const [
    services,
    practitioners,
    availability,
    courses,
    cohorts,
    products,
    announcements,
  ] = await Promise.all([
    rows("SELECT * FROM services WHERE active ORDER BY category,name"),
    rows(
      "SELECT u.id,u.name,array_agg(p.service_id) AS service_ids FROM users u JOIN practitioner_services p ON p.practitioner_id=u.id WHERE u.active GROUP BY u.id ORDER BY u.name",
    ),
    rows(
      "SELECT * FROM availability WHERE starts_at>now() ORDER BY starts_at LIMIT 300",
    ),
    rows("SELECT * FROM courses WHERE published ORDER BY title"),
    rows(`SELECT h.id,h.name,h.starts_at,h.capacity,v.course_id,u.name AS trainer_name,
      (SELECT count(*)::int FROM enrolments e WHERE e.cohort_id=h.id AND e.status<>'withdrawn') AS enrolled
      FROM cohorts h JOIN course_versions v ON v.id=h.version_id JOIN courses c ON c.id=v.course_id JOIN users u ON u.id=h.trainer_id WHERE c.published ORDER BY h.starts_at`),
    rows(
      "SELECT p.*,v.name AS vendor_name FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.status='approved' AND v.status='approved' AND (p.expires_on IS NULL OR p.expires_on>current_date) ORDER BY p.name",
    ),
    rows(
      "SELECT id,title,body,created_at FROM announcements WHERE published AND audience='public' ORDER BY created_at DESC LIMIT 10",
    ),
  ]);
  return {
    services,
    practitioners,
    availability,
    courses,
    cohorts,
    products,
    announcements,
  };
}
export async function workspace(user: User) {
  const data: Record<string, any> = { user };
  data.notices = await rows(
    "SELECT id,title,body,created_at FROM announcements WHERE published AND (audience='public' OR (audience='student' AND $1) OR (audience='staff' AND $2)) ORDER BY created_at DESC LIMIT 20",
    [
      has(user, "student"),
      has(user, "admin", "trainer", "clinician", "reception", "finance"),
    ],
  );
  data.documents = await rows(
    `SELECT d.id,d.owner_id,d.filename,d.mime_type,d.size_bytes,d.purpose,d.state,d.created_at,u.name AS owner_name
    FROM documents d JOIN users u ON u.id=d.owner_id
    WHERE (d.owner_id=$1 AND d.state<>'deleted') OR (d.state='clean' AND (
      ($2 AND d.purpose='admission_document')
      OR ($3 AND d.purpose='patient_report' AND EXISTS(SELECT 1 FROM appointments a WHERE a.patient_id=d.owner_id AND a.practitioner_id=$1 AND a.status IN ('confirmed','completed')))
      OR (d.purpose='assignment_attachment' AND EXISTS(SELECT 1 FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN cohorts h ON h.id=a.cohort_id WHERE s.document_id=d.id AND ($2 OR ($4 AND h.trainer_id=$1))))))
    ORDER BY d.created_at DESC LIMIT 200`,
    [user.id, has(user, "admin"), has(user, "clinician"), has(user, "trainer")],
  );
  const [a, e, o, n, t] = await Promise.all([
    appointments(user),
    enrolments(user),
    orderList(user),
    rows(
      "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [user.id],
    ),
    rows(
      `SELECT t.*,u.name AS user_name FROM support_tickets t JOIN users u ON u.id=t.user_id ${has(user, "admin") ? "" : "WHERE t.user_id=$1"} ORDER BY created_at DESC LIMIT 100`,
      has(user, "admin") ? [] : [user.id],
    ),
  ]);
  Object.assign(data, {
    appointments: a,
    enrolments: e,
    orders: o,
    notifications: n,
    tickets: t,
  });
  data.payments = await rows(
    `SELECT p.*,u.name AS user_name FROM payments p JOIN users u ON u.id=p.user_id ${has(user, "admin", "finance") ? "" : "WHERE p.user_id=$1"} ORDER BY created_at DESC LIMIT 200`,
    has(user, "admin", "finance") ? [] : [user.id],
  );
  data.refunds = await rows(
    `SELECT r.*,p.amount_paise,p.user_id,u.name AS customer_name FROM refund_requests r JOIN payments p ON p.id=r.payment_id JOIN users u ON u.id=p.user_id ${has(user, "admin", "finance") ? "" : "WHERE p.user_id=$1"} ORDER BY r.created_at DESC LIMIT 100`,
    has(user, "admin", "finance") ? [] : [user.id],
  );
  data.privacyRequests = await rows(
    `SELECT p.*,u.name AS user_name FROM privacy_requests p JOIN users u ON u.id=p.user_id ${has(user, "admin") ? "" : "WHERE p.user_id=$1"} ORDER BY p.created_at DESC LIMIT 100`,
    has(user, "admin") ? [] : [user.id],
  );
  data.plans = await rows(
    `SELECT p.*,u.name AS patient_name,(SELECT count(*)::int FROM treatment_sessions s WHERE s.plan_id=p.id) AS sessions_completed FROM treatment_plans p JOIN users u ON u.id=p.patient_id WHERE ${has(user, "clinician") ? "practitioner_id" : "patient_id"}=$1 ORDER BY p.created_at DESC`,
    [user.id],
  );
  if (has(user, "admin", "reception"))
    data.enquiries = await rows(
      "SELECT e.*,u.name AS owner_name FROM enquiries e LEFT JOIN users u ON u.id=e.assigned_to ORDER BY e.created_at DESC LIMIT 200",
    );
  if (has(user, "admin", "trainer")) {
    data.cohorts = await rows(
      `SELECT h.*,c.title AS course_title,u.name AS trainer_name FROM cohorts h JOIN course_versions v ON v.id=h.version_id JOIN courses c ON c.id=v.course_id JOIN users u ON u.id=h.trainer_id ${has(user, "admin") ? "" : "WHERE h.trainer_id=$1"} ORDER BY h.starts_at`,
      has(user, "admin") ? [] : [user.id],
    );
    const ids = data.cohorts.map((c: any) => c.id);
    data.classes = await rows(
      "SELECT id,cohort_id,title,starts_at,duration_minutes,status FROM class_sessions WHERE cohort_id=ANY($1::uuid[]) ORDER BY starts_at",
      [ids],
    );
    data.assignments = await rows(
      "SELECT * FROM assignments WHERE cohort_id=ANY($1::uuid[]) ORDER BY due_at",
      [ids],
    );
    data.quizzes = await rows(
      "SELECT id,cohort_id,title,duration_minutes,pass_percent,max_attempts,published FROM quizzes WHERE cohort_id=ANY($1::uuid[]) ORDER BY created_at DESC",
      [ids],
    );
    data.submissions = await rows(
      "SELECT s.*,d.filename AS document_filename,a.title AS assignment_title,a.max_score,u.name AS student_name FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN users u ON u.id=s.student_id LEFT JOIN documents d ON d.id=s.document_id WHERE a.cohort_id=ANY($1::uuid[]) ORDER BY s.submitted_at DESC",
      [ids],
    );
    data.versions = await rows(
      `SELECT DISTINCT v.*,c.title FROM course_versions v JOIN courses c ON c.id=v.course_id ${has(user, "admin") ? "" : "JOIN cohorts h ON h.version_id=v.id WHERE h.trainer_id=$1"} ORDER BY c.title`,
      has(user, "admin") ? [] : [user.id],
    );
  }
  if (has(user, "admin")) {
    data.users = await rows(
      "SELECT id,name,email,roles,active,created_at FROM users ORDER BY created_at DESC LIMIT 300",
    );
    data.vendors = await rows(
      "SELECT v.*,u.name AS owner_name FROM vendors v JOIN users u ON u.id=v.owner_id ORDER BY created_at",
    );
    data.products = await rows(
      "SELECT p.*,v.name AS vendor_name FROM products p JOIN vendors v ON v.id=p.vendor_id ORDER BY p.created_at DESC",
    );
    data.courses = await rows("SELECT * FROM courses ORDER BY created_at DESC");
    data.announcements = await rows(
      "SELECT * FROM announcements ORDER BY created_at DESC",
    );
    data.audit = await rows(
      "SELECT a.id,a.action,a.resource_id,a.created_at,u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100",
    );
  }
  if (has(user, "vendor")) {
    data.vendor = await one("SELECT * FROM vendors WHERE owner_id=$1", [
      user.id,
    ]);
    data.vendorProducts = await rows(
      "SELECT p.* FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE v.owner_id=$1 ORDER BY p.created_at DESC",
      [user.id],
    );
    data.vendorLedger = await rows(
      "SELECT l.* FROM ledger_entries l JOIN vendors v ON (l.account=concat('vendor_payable:',v.id) OR l.account=concat('refund:vendor_payable:',v.id)) WHERE v.owner_id=$1 ORDER BY l.created_at DESC",
      [user.id],
    );
  }
  return data;
}
export async function createResource(user: User, kind: string, input: unknown) {
  return transaction(async (db) => {
    let result: Record<string, any> | undefined;
    if (kind === "services") {
      allow(user, "admin");
      const d = z
        .object({
          name: text,
          category: text,
          description: content,
          durationMinutes: z.number().int().min(15).max(240),
          pricePaise: z.number().int().min(0).max(10000000),
          practitionerId: uuid,
        })
        .parse(input);
      requireThat(
        await one(
          "SELECT id FROM users WHERE id=$1 AND 'clinician'=ANY(roles) AND active",
          [d.practitionerId],
          db,
        ),
        400,
        "Select an active clinician.",
      );
      result = await one(
        "INSERT INTO services(name,category,description,duration_minutes,price_paise) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [d.name, d.category, d.description, d.durationMinutes, d.pricePaise],
        db,
      );
      await db.query(
        "INSERT INTO practitioner_services(practitioner_id,service_id) VALUES($1,$2)",
        [d.practitionerId, result!.id],
      );
    } else if (kind === "availability") {
      allow(user, "admin", "reception", "clinician");
      const d = z
        .object({
          practitionerId: uuid,
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        })
        .parse(input);
      requireThat(
        has(user, "admin", "reception") || d.practitionerId === user.id,
        403,
        "You may only set your own availability.",
      );
      requireThat(
        new Date(d.endsAt) > new Date(d.startsAt),
        400,
        "End time must be after start time.",
      );
      result = await one(
        "INSERT INTO availability(practitioner_id,starts_at,ends_at) VALUES($1,$2,$3) RETURNING *",
        [d.practitionerId, d.startsAt, d.endsAt],
        db,
      );
    } else if (kind === "courses") {
      allow(user, "admin");
      const d = z
        .object({
          title: text,
          category: text,
          description: content,
          duration: text,
          feePaise: z.number().int().min(0).max(100000000),
          published: z.boolean(),
          syllabus: content,
        })
        .parse(input);
      result = await one(
        "INSERT INTO courses(title,category,description,duration,fee_paise,published) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          d.title,
          d.category,
          d.description,
          d.duration,
          d.feePaise,
          d.published,
        ],
        db,
      );
      await db.query(
        "INSERT INTO course_versions(course_id,syllabus) VALUES($1,$2)",
        [result!.id, d.syllabus],
      );
    } else if (kind === "course-versions") {
      allow(user, "admin");
      const d = z.object({ courseId: uuid, syllabus: content }).parse(input);
      requireThat(
        await one(
          "SELECT id FROM courses WHERE id=$1 FOR UPDATE",
          [d.courseId],
          db,
        ),
        404,
        "Course not found.",
      );
      result = await one(
        "INSERT INTO course_versions(course_id,version,syllabus) SELECT $1,COALESCE(max(version),0)+1,$2 FROM course_versions WHERE course_id=$1 RETURNING *",
        [d.courseId, d.syllabus],
        db,
      );
    } else if (kind === "cohorts") {
      allow(user, "admin");
      const d = z
        .object({
          versionId: uuid,
          name: text,
          trainerId: uuid,
          capacity: z.number().int().min(1).max(1000),
          startsAt: z.iso.datetime({ offset: true }),
          attendanceRequired: z.number().int().min(0).max(100),
        })
        .parse(input);
      requireThat(
        await one(
          "SELECT id FROM users WHERE id=$1 AND 'trainer'=ANY(roles) AND active",
          [d.trainerId],
          db,
        ),
        400,
        "Select an active trainer.",
      );
      result = await one(
        "INSERT INTO cohorts(version_id,name,trainer_id,capacity,starts_at,attendance_required) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          d.versionId,
          d.name,
          d.trainerId,
          d.capacity,
          d.startsAt,
          d.attendanceRequired,
        ],
        db,
      );
    } else if (kind === "lessons") {
      allow(user, "admin", "trainer");
      const d = z
        .object({
          versionId: uuid,
          title: text,
          content: content,
          resourceUrl: z.string().url().optional(),
          position: z.number().int().min(0).max(10000),
        })
        .parse(input);
      if (!has(user, "admin"))
        requireThat(
          await one(
            "SELECT id FROM cohorts WHERE version_id=$1 AND trainer_id=$2",
            [d.versionId, user.id],
            db,
          ),
          403,
          "Course is not assigned to you.",
        );
      requireThat(
        !(await one(
          "SELECT h.id FROM cohorts h JOIN enrolments e ON e.cohort_id=h.id WHERE h.version_id=$1 AND e.status IN ('active','completed') LIMIT 1",
          [d.versionId],
          db,
        )),
        409,
        "This course version has active learners. Create a new version before changing its curriculum.",
      );
      if (d.resourceUrl)
        requireThat(
          new URL(d.resourceUrl).protocol === "https:",
          400,
          "Resources must use HTTPS.",
        );
      result = await one(
        "INSERT INTO lessons(version_id,title,content,resource_url,position) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [d.versionId, d.title, d.content, d.resourceUrl || null, d.position],
        db,
      );
    } else if (kind === "classes") {
      const d = z
        .object({
          cohortId: uuid,
          title: text,
          startsAt: z.iso.datetime({ offset: true }),
          durationMinutes: z.number().int().min(10).max(480),
          meetingUrl: z.string().url().optional(),
        })
        .parse(input);
      await cohortAccess(user, d.cohortId, db);
      if (d.meetingUrl)
        requireThat(
          new URL(d.meetingUrl).protocol === "https:",
          400,
          "Meeting links must use HTTPS.",
        );
      result = await one(
        "INSERT INTO class_sessions(cohort_id,title,starts_at,duration_minutes,meeting_url) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          d.cohortId,
          d.title,
          d.startsAt,
          d.durationMinutes,
          d.meetingUrl || null,
        ],
        db,
      );
    } else if (kind === "assignments") {
      const d = z
        .object({
          cohortId: uuid,
          title: text,
          instructions: content,
          dueAt: z.iso.datetime({ offset: true }),
          maxScore: z.number().int().min(1).max(1000),
          passScore: z.number().int().min(0).max(1000),
        })
        .parse(input);
      await cohortAccess(user, d.cohortId, db);
      requireThat(
        d.passScore <= d.maxScore,
        400,
        "Pass mark must not exceed maximum marks.",
      );
      result = await one(
        "INSERT INTO assignments(cohort_id,title,instructions,due_at,max_score,pass_score) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [d.cohortId, d.title, d.instructions, d.dueAt, d.maxScore, d.passScore],
        db,
      );
    } else if (kind === "vendors") {
      const d = z.object({ name: text, description: content }).parse(input);
      requireThat(
        !(await one("SELECT id FROM vendors WHERE owner_id=$1", [user.id], db)),
        409,
        "You already have a vendor application.",
      );
      result = await one(
        "INSERT INTO vendors(owner_id,name,description) VALUES($1,$2,$3) RETURNING *",
        [user.id, d.name, d.description],
        db,
      );
      await db.query(
        "UPDATE users SET roles=array_append(roles,'vendor') WHERE id=$1 AND NOT ('vendor'=ANY(roles))",
        [user.id],
      );
    } else if (kind === "products") {
      allow(user, "vendor");
      const d = z
        .object({
          name: text,
          category: text,
          description: content,
          pricePaise: z.number().int().min(100).max(10000000),
          stock: z.number().int().min(0).max(100000),
          regulated: z.boolean(),
          licenceReference: z.string().max(300).optional(),
          batch: z.string().max(100).optional(),
          expiresOn: z.iso.date().optional(),
        })
        .parse(input);
      const v = await one(
        "SELECT * FROM vendors WHERE owner_id=$1 AND status='approved'",
        [user.id],
        db,
      );
      requireThat(v, 403, "Your vendor account must be approved first.");
      requireThat(
        !d.regulated || (d.licenceReference && d.batch && d.expiresOn),
        400,
        "Regulated products require licence, batch and expiry details.",
      );
      result = await one(
        "INSERT INTO products(vendor_id,name,category,description,price_paise,stock,regulated,licence_reference,batch,expires_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          v.id,
          d.name,
          d.category,
          d.description,
          d.pricePaise,
          d.stock,
          d.regulated,
          d.licenceReference || null,
          d.batch || null,
          d.expiresOn || null,
        ],
        db,
      );
    } else if (kind === "tickets") {
      const d = z.object({ subject: text, message: content }).parse(input);
      result = await one(
        "INSERT INTO support_tickets(user_id,subject,message) VALUES($1,$2,$3) RETURNING *",
        [user.id, d.subject, d.message],
        db,
      );
    } else if (kind === "announcements") {
      allow(user, "admin");
      const d = z
        .object({
          title: text,
          body: content,
          published: z.boolean(),
          audience: z.enum(["public", "student", "staff"]),
        })
        .parse(input);
      result = await one(
        "INSERT INTO announcements(title,body,published,audience,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [d.title, d.body, d.published, d.audience, user.id],
        db,
      );
    } else requireThat(false, 404, "Unknown resource.");
    await audit(db, user.id, `${kind}.created`, result!.id);
    return result;
  });
}
export async function updateResource(
  user: User,
  kind: string,
  id: string,
  input: unknown,
) {
  return transaction(async (db) => {
    let result;
    if (kind === "vendors") {
      allow(user, "admin");
      const d = z
        .object({
          status: z.enum(["approved", "suspended"]),
          commissionBps: z.number().int().min(0).max(10000).default(500),
        })
        .parse(input);
      result = await one(
        "UPDATE vendors SET status=$1,commission_bps=$2 WHERE id=$3 RETURNING *",
        [d.status, d.commissionBps, id],
        db,
      );
    } else if (kind === "products") {
      if (has(user, "admin")) {
        const d = z
          .object({ status: z.enum(["approved", "rejected", "archived"]) })
          .parse(input);
        const p = await one(
          "SELECT p.*,v.status AS vendor_status FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.id=$1",
          [id],
          db,
        );
        requireThat(p, 404, "Product not found.");
        requireThat(
          d.status !== "approved" ||
            (p.vendor_status === "approved" &&
              (!p.regulated ||
                (p.licence_reference && p.batch && p.expires_on))),
          409,
          "Vendor approval and product evidence are required.",
        );
        result = await one(
          "UPDATE products SET status=$1 WHERE id=$2 RETURNING *",
          [d.status, id],
          db,
        );
      } else {
        allow(user, "vendor");
        const d = z
          .object({ addStock: z.number().int().min(1).max(10000) })
          .parse(input);
        result = await one(
          "UPDATE products SET stock=stock+$1 WHERE id=$2 AND vendor_id IN(SELECT id FROM vendors WHERE owner_id=$3) RETURNING *",
          [d.addStock, id, user.id],
          db,
        );
      }
    } else if (kind === "announcements") {
      allow(user, "admin");
      const d = z.object({ published: z.boolean() }).parse(input);
      result = await one(
        "UPDATE announcements SET published=$1 WHERE id=$2 RETURNING *",
        [d.published, id],
        db,
      );
    } else if (kind === "courses") {
      allow(user, "admin");
      const d = z.object({ published: z.boolean() }).parse(input);
      result = await one(
        "UPDATE courses SET published=$1 WHERE id=$2 RETURNING *",
        [d.published, id],
        db,
      );
    } else if (kind === "enquiries") {
      allow(user, "admin", "reception");
      const d = z
        .object({
          status: z.enum(["new", "contacted", "resolved", "closed"]),
          assignedTo: uuid.optional(),
          followUpAt: z.iso.datetime({ offset: true }).optional(),
        })
        .parse(input);
      result = await one(
        "UPDATE enquiries SET status=$1,assigned_to=COALESCE($2,assigned_to),follow_up_at=COALESCE($3,follow_up_at) WHERE id=$4 RETURNING *",
        [d.status, d.assignedTo || null, d.followUpAt || null, id],
        db,
      );
    } else if (kind === "tickets") {
      allow(user, "admin");
      const d = z
        .object({
          status: z.enum(["open", "in_progress", "resolved"]),
          response: content,
        })
        .parse(input);
      result = await one(
        "UPDATE support_tickets SET status=$1,response=$2 WHERE id=$3 RETURNING *",
        [d.status, d.response, id],
        db,
      );
    } else if (kind === "classes") {
      const d = z
        .object({
          status: z.enum(["completed", "cancelled"]).optional(),
          meetingUrl: z.string().url().max(2000).optional(),
        })
        .refine((x) => x.status || x.meetingUrl)
        .parse(input);
      const c = await one("SELECT * FROM class_sessions WHERE id=$1", [id], db);
      requireThat(c, 404, "Class not found.");
      await cohortAccess(user, c.cohort_id, db);
      if (d.meetingUrl)
        requireThat(
          new URL(d.meetingUrl).protocol === "https:",
          400,
          "Meeting links must use HTTPS.",
        );
      result = await one(
        "UPDATE class_sessions SET status=COALESCE($1,status),meeting_url=COALESCE($2,meeting_url) WHERE id=$3 RETURNING id,status",
        [d.status || null, d.meetingUrl || null, id],
        db,
      );
    } else if (kind === "privacy-requests") {
      allow(user, "admin");
      const d = z
        .object({
          status: z.enum(["reviewing", "completed", "declined"]),
          response: content,
        })
        .parse(input);
      result = await one(
        "UPDATE privacy_requests SET status=$1,response=$2,reviewed_by=$3 WHERE id=$4 RETURNING *",
        [d.status, d.response, user.id, id],
        db,
      );
    } else if (kind === "users") {
      allow(user, "admin");
      const d = z
        .object({
          active: z.boolean(),
          roles: z
            .array(
              z.enum([
                "patient",
                "student",
                "trainer",
                "vendor",
                "clinician",
                "reception",
                "finance",
                "admin",
              ]),
            )
            .min(1),
        })
        .parse(input);
      requireThat(id !== user.id, 400, "You cannot change your own access.");
      result = await one(
        "UPDATE users SET active=$1,roles=$2 WHERE id=$3 RETURNING id,name,email,roles,active",
        [d.active, d.roles, id],
        db,
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    } else if (kind === "notifications") {
      result = await one(
        "UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",
        [id, user.id],
        db,
      );
    } else if (kind === "certificates") {
      allow(user, "admin");
      const d = z.object({ reason: z.string().min(5).max(1000) }).parse(input);
      result = await one(
        "UPDATE certificates SET revoked_at=now(),revocation_reason=$1 WHERE id=$2 AND revoked_at IS NULL RETURNING *",
        [d.reason, id],
        db,
      );
    } else requireThat(false, 404, "Unknown resource.");
    requireThat(result, 404, "Record not found.");
    await audit(db, user.id, `${kind}.updated`, id);
    return result;
  });
}
