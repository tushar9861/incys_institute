import { z } from "zod";
import { rows, one, pool, transaction, audit, emit, type DB } from "./db";
import { type User, has, allow } from "./auth";
import { requireThat } from "./errors";
const uuid = z.string().uuid();
export async function cohortAccess(user: User, id: string, db: DB = pool) {
  const cohort = await one("SELECT * FROM cohorts WHERE id=$1", [id], db);
  requireThat(
    cohort &&
      (has(user, "admin") ||
        (has(user, "trainer") && cohort.trainer_id === user.id)),
    403,
    "This cohort is not assigned to you.",
  );
  return cohort;
}
export async function applyCourse(user: User, input: unknown) {
  const d = z.object({ cohortId: uuid, consent: z.literal(true) }).parse(input);
  return transaction(async (db) => {
    const c = await one(
      "SELECT h.*,c.fee_paise FROM cohorts h JOIN course_versions v ON v.id=h.version_id JOIN courses c ON c.id=v.course_id WHERE h.id=$1 AND c.published FOR UPDATE OF h",
      [d.cohortId],
      db,
    );
    requireThat(c, 404, "This intake is not available.");
    requireThat(
      !(await one(
        "SELECT id FROM enrolments WHERE student_id=$1 AND cohort_id=$2",
        [user.id, c.id],
        db,
      )),
      409,
      "You already have an application for this intake.",
    );
    const count = await one(
      "SELECT count(*)::int AS n FROM enrolments WHERE cohort_id=$1 AND status IN ('applied','active','completed')",
      [c.id],
      db,
    );
    requireThat(count!.n < c.capacity, 409, "This intake is full.");
    const result = await one(
      "INSERT INTO enrolments(student_id,cohort_id,fee_paise) VALUES($1,$2,$3) RETURNING *",
      [user.id, c.id, c.fee_paise],
      db,
    );
    await db.query(
      "UPDATE users SET roles=array_append(roles,'student') WHERE id=$1 AND NOT ('student'=ANY(roles))",
      [user.id],
    );
    await audit(db, user.id, "enrolment.applied", result!.id);
    await db.query(
      "INSERT INTO consents(user_id,purpose,version,granted) VALUES($1,'course_application','1',true)",
      [user.id],
    );
    await emit(db, "CourseApplicationCreated", result!.id, user.id);
    return result;
  });
}
export async function enrolments(user: User) {
  const scope = has(user, "admin", "finance")
    ? "true"
    : has(user, "trainer")
      ? "h.trainer_id=$1"
      : "e.student_id=$1";
  return rows(
    `SELECT e.*,c.title AS course_title,c.award_type,h.name AS cohort_name,h.trainer_id,h.version_id,u.name AS student_name,
    (SELECT count(*)::int FROM lesson_progress p WHERE p.enrolment_id=e.id) AS completed_lessons,
    (SELECT count(*)::int FROM lessons l WHERE l.version_id=h.version_id AND l.required) AS total_lessons
    FROM enrolments e JOIN cohorts h ON h.id=e.cohort_id JOIN course_versions v ON v.id=h.version_id
    JOIN courses c ON c.id=v.course_id JOIN users u ON u.id=e.student_id WHERE ${scope} ORDER BY e.created_at DESC LIMIT 200`,
    scope === "true" ? [] : [user.id],
  );
}
export async function learningDetail(user: User, id: string) {
  const e = await one(
    "SELECT e.*,h.version_id,h.trainer_id,h.name AS cohort_name FROM enrolments e JOIN cohorts h ON h.id=e.cohort_id WHERE e.id=$1",
    [id],
  );
  requireThat(
    e &&
      (e.student_id === user.id ||
        has(user, "admin") ||
        (has(user, "trainer") && e.trainer_id === user.id)),
    403,
    "You cannot access this enrolment.",
  );
  requireThat(
    ["active", "completed"].includes(e.status) || has(user, "admin", "trainer"),
    403,
    "Your admission must be approved before accessing lessons.",
  );
  const lessons = await rows(
    "SELECT l.*,p.completed_at FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.enrolment_id=$2 WHERE version_id=$1 ORDER BY position",
    [e.version_id, id],
  );
  const classes = await rows(
    "SELECT c.id,c.cohort_id,c.title,c.starts_at,c.duration_minutes,c.status,a.present FROM class_sessions c LEFT JOIN attendance a ON a.class_id=c.id AND a.student_id=$2 WHERE cohort_id=$1 ORDER BY starts_at",
    [e.cohort_id, e.student_id],
  );
  const assignments = await rows(
    "SELECT a.*,s.id AS submission_id,s.body AS submission_body,s.score,s.feedback FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=$2 WHERE cohort_id=$1 ORDER BY due_at",
    [e.cohort_id, e.student_id],
  );
  const certificate = await one(
    "SELECT * FROM certificates WHERE enrolment_id=$1",
    [id],
  );
  const quizzes = await rows(
    `SELECT q.id,q.title,q.duration_minutes,q.pass_percent,q.max_attempts,
    (SELECT max(a.score) FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.student_id=$2) AS best_score,
    (SELECT count(*)::int FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.student_id=$2) AS attempts
    FROM quizzes q WHERE q.cohort_id=$1 AND q.published ORDER BY q.created_at`,
    [e.cohort_id, e.student_id],
  );
  return { enrolment: e, lessons, classes, assignments, quizzes, certificate };
}
export async function approveEnrolment(user: User, id: string, input: unknown) {
  allow(user, "admin");
  const d = z.object({ status: z.enum(["active", "withdrawn"]) }).parse(input);
  return transaction(async (db) => {
    const e = await one(
      "SELECT * FROM enrolments WHERE id=$1 FOR UPDATE",
      [id],
      db,
    );
    requireThat(e, 404, "Application not found.");
    requireThat(
      e.status === "applied" ||
        (e.status === "active" && d.status === "withdrawn"),
      409,
      "This application cannot make that transition.",
    );
    const result = await one(
      "UPDATE enrolments SET status=$1 WHERE id=$2 RETURNING *",
      [d.status, id],
      db,
    );
    await audit(db, user.id, `enrolment.${d.status}`, id);
    await emit(db, "EnrolmentChanged", id, e.student_id);
    return result;
  });
}
export async function completeLesson(
  user: User,
  enrolmentId: string,
  input: unknown,
) {
  const d = z.object({ lessonId: uuid }).parse(input);
  return transaction(async (db) => {
    const e = await one(
      "SELECT e.*,h.version_id FROM enrolments e JOIN cohorts h ON h.id=e.cohort_id WHERE e.id=$1 AND e.student_id=$2 AND e.status='active'",
      [enrolmentId, user.id],
      db,
    );
    requireThat(e, 403, "Active enrolment required.");
    requireThat(
      await one(
        "SELECT id FROM lessons WHERE id=$1 AND version_id=$2",
        [d.lessonId, e.version_id],
        db,
      ),
      403,
      "Lesson is not part of your course version.",
    );
    await db.query(
      "INSERT INTO lesson_progress(enrolment_id,lesson_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [enrolmentId, d.lessonId],
    );
    return { completed: true };
  });
}
export async function submitAssignment(user: User, id: string, input: unknown) {
  const d = z
    .object({ body: z.string().trim().min(5).max(30000) })
    .parse(input);
  return transaction(async (db) => {
    const a = await one(
      "SELECT a.* FROM assignments a JOIN enrolments e ON e.cohort_id=a.cohort_id WHERE a.id=$1 AND e.student_id=$2 AND e.status='active'",
      [id, user.id],
      db,
    );
    requireThat(a, 403, "You are not enrolled in this assignment.");
    requireThat(
      new Date(a.due_at).getTime() >= Date.now(),
      409,
      "The submission deadline has passed.",
    );
    const existing = await one(
      "SELECT * FROM submissions WHERE assignment_id=$1 AND student_id=$2 FOR UPDATE",
      [id, user.id],
      db,
    );
    requireThat(
      existing?.score == null,
      409,
      "A graded submission cannot be replaced.",
    );
    const result = await one(
      `INSERT INTO submissions(assignment_id,student_id,body) VALUES($1,$2,$3) ON CONFLICT(assignment_id,student_id) DO UPDATE SET body=excluded.body,submitted_at=now() RETURNING *`,
      [id, user.id, d.body],
      db,
    );
    await audit(db, user.id, "assignment.submitted", result!.id);
    return result;
  });
}
export async function gradeSubmission(user: User, id: string, input: unknown) {
  allow(user, "admin", "trainer");
  const d = z
    .object({ score: z.number().int().min(0), feedback: z.string().max(5000) })
    .parse(input);
  return transaction(async (db) => {
    const s = await one(
      "SELECT s.*,a.cohort_id,a.max_score FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=$1 FOR UPDATE OF s",
      [id],
      db,
    );
    requireThat(s, 404, "Submission not found.");
    await cohortAccess(user, s.cohort_id, db);
    requireThat(d.score <= s.max_score, 400, "Score exceeds the maximum mark.");
    await db.query(
      "UPDATE submissions SET score=$1,feedback=$2,graded_by=$3 WHERE id=$4",
      [d.score, d.feedback, user.id, id],
    );
    await audit(db, user.id, "submission.graded", id, { score: d.score });
    return { graded: true };
  });
}
export async function markAttendance(
  user: User,
  classId: string,
  input: unknown,
) {
  const d = z.object({ studentId: uuid, present: z.boolean() }).parse(input);
  return transaction(async (db) => {
    const c = await one(
      "SELECT * FROM class_sessions WHERE id=$1",
      [classId],
      db,
    );
    requireThat(c, 404, "Class not found.");
    await cohortAccess(user, c.cohort_id, db);
    requireThat(
      await one(
        "SELECT id FROM enrolments WHERE cohort_id=$1 AND student_id=$2 AND status='active'",
        [c.cohort_id, d.studentId],
        db,
      ),
      400,
      "Student is not actively enrolled in this cohort.",
    );
    await db.query(
      "INSERT INTO attendance(class_id,student_id,present,recorded_by) VALUES($1,$2,$3,$4) ON CONFLICT(class_id,student_id) DO UPDATE SET present=excluded.present,recorded_by=excluded.recorded_by,updated_at=now()",
      [classId, d.studentId, d.present, user.id],
    );
    await audit(db, user.id, "attendance.recorded", classId, {
      studentId: d.studentId,
      present: d.present,
    });
    return { recorded: true };
  });
}
export async function issueCertificate(user: User, enrolmentId: string) {
  allow(user, "admin");
  return transaction(async (db) => {
    const e = await one(
      "SELECT e.*,h.version_id,h.attendance_required,c.award_type FROM enrolments e JOIN cohorts h ON h.id=e.cohort_id JOIN course_versions v ON v.id=h.version_id JOIN courses c ON c.id=v.course_id WHERE e.id=$1 FOR UPDATE OF e",
      [enrolmentId],
      db,
    );
    requireThat(
      e && e.status === "active",
      409,
      "An active enrolment is required.",
    );
    requireThat(
      e.paid_paise >= e.fee_paise,
      409,
      "Outstanding fees must be cleared.",
    );
    const missing = await one(
      "SELECT count(*)::int AS n FROM lessons l WHERE l.version_id=$1 AND l.required AND NOT EXISTS(SELECT 1 FROM lesson_progress p WHERE p.lesson_id=l.id AND p.enrolment_id=$2)",
      [e.version_id, enrolmentId],
      db,
    );
    requireThat(missing!.n === 0, 409, "Required lessons are incomplete.");
    const incomplete = await one(
      "SELECT count(*)::int AS n FROM assignments a WHERE a.cohort_id=$1 AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.student_id=$2 AND s.score>=a.pass_score)",
      [e.cohort_id, e.student_id],
      db,
    );
    requireThat(
      incomplete!.n === 0,
      409,
      "Required assessments have not been passed.",
    );
    const failedQuizzes = await one(
      "SELECT count(*)::int AS n FROM quizzes q WHERE q.cohort_id=$1 AND q.published AND NOT EXISTS(SELECT 1 FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.student_id=$2 AND a.passed)",
      [e.cohort_id, e.student_id],
      db,
    );
    requireThat(
      failedQuizzes!.n === 0,
      409,
      "Required quizzes have not been passed.",
    );
    const attendance = await one(
      "SELECT count(*)::int AS total,count(*) FILTER(WHERE a.present)::int AS present FROM class_sessions c LEFT JOIN attendance a ON a.class_id=c.id AND a.student_id=$2 WHERE c.cohort_id=$1 AND c.status='completed'",
      [e.cohort_id, e.student_id],
      db,
    );
    requireThat(
      attendance!.total === 0 ||
        (attendance!.present * 100) / attendance!.total >=
          e.attendance_required,
      409,
      "Attendance threshold has not been met.",
    );
    const upcoming = await one(
      "SELECT id FROM class_sessions WHERE cohort_id=$1 AND status='scheduled' LIMIT 1",
      [e.cohort_id],
      db,
    );
    requireThat(
      !upcoming,
      409,
      "Complete or cancel all scheduled classes first.",
    );
    const serial = `INCYS-${new Date().getUTCFullYear()}-${enrolmentId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const result = await one(
      "INSERT INTO certificates(enrolment_id,serial,issued_by) VALUES($1,$2,$3) RETURNING *",
      [enrolmentId, serial, user.id],
      db,
    );
    await db.query("UPDATE enrolments SET status='completed' WHERE id=$1", [
      enrolmentId,
    ]);
    await audit(db, user.id, "certificate.issued", result!.id);
    return result;
  });
}
