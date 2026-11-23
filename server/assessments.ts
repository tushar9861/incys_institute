import { z } from "zod";
import { one, rows, transaction, audit } from "./db";
import { type User, has } from "./auth";
import { cohortAccess } from "./learning";
import { requireThat } from "./errors";
export async function createQuiz(user: User, input: unknown) {
  const d = z
    .object({
      cohortId: z.string().uuid(),
      title: z.string().min(3).max(200),
      durationMinutes: z.number().int().min(1).max(240),
      passPercent: z.number().int().min(0).max(100),
      maxAttempts: z.number().int().min(1).max(10),
      published: z.boolean(),
      questions: z
        .array(
          z.object({
            prompt: z.string().min(3).max(2000),
            options: z.array(z.string().min(1).max(1000)).min(2).max(6),
            correctIndex: z.number().int().min(0).max(5),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  requireThat(
    d.questions.every((q) => q.correctIndex < q.options.length),
    400,
    "Each answer must reference a valid option.",
  );
  return transaction(async (db) => {
    await cohortAccess(user, d.cohortId, db);
    const quiz = await one(
      "INSERT INTO quizzes(cohort_id,title,duration_minutes,pass_percent,max_attempts,questions,published) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [
        d.cohortId,
        d.title,
        d.durationMinutes,
        d.passPercent,
        d.maxAttempts,
        JSON.stringify(d.questions),
        d.published,
      ],
      db,
    );
    await audit(db, user.id, "quiz.created", quiz!.id);
    return quiz;
  });
}
export async function startQuiz(user: User, id: string) {
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${user.id}:${id}`,
    ]);
    const q = await one(
      "SELECT q.* FROM quizzes q JOIN enrolments e ON e.cohort_id=q.cohort_id WHERE q.id=$1 AND q.published AND e.student_id=$2 AND e.status='active'",
      [id, user.id],
      db,
    );
    requireThat(q, 403, "This assessment is not available to you.");
    await db.query(
      "UPDATE quiz_attempts SET submitted_at=now(),score=0,passed=false,answers='[]' WHERE quiz_id=$1 AND student_id=$2 AND submitted_at IS NULL AND expires_at<now()",
      [id, user.id],
    );
    let attempt = await one(
      "SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND submitted_at IS NULL",
      [id, user.id],
      db,
    );
    if (!attempt) {
      const count = await one(
        "SELECT count(*)::int AS n FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2",
        [id, user.id],
        db,
      );
      requireThat(
        count!.n < q.max_attempts,
        409,
        "No assessment attempts remaining.",
      );
      attempt = await one(
        "INSERT INTO quiz_attempts(quiz_id,student_id,expires_at) VALUES($1,$2,now()+$3*interval '1 minute') RETURNING *",
        [id, user.id, q.duration_minutes],
        db,
      );
    }
    return {
      id: attempt!.id,
      title: q.title,
      expiresAt: attempt!.expires_at,
      questions: q.questions.map((x: any) => ({
        prompt: x.prompt,
        options: x.options,
      })),
    };
  });
}
export async function submitQuiz(user: User, id: string, input: unknown) {
  const d = z
    .object({ answers: z.array(z.number().int().min(-1).max(5)).max(100) })
    .parse(input);
  return transaction(async (db) => {
    const a = await one(
      "SELECT a.*,q.questions,q.pass_percent FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.id=$1 AND a.student_id=$2 FOR UPDATE OF a",
      [id, user.id],
      db,
    );
    requireThat(a, 403, "Assessment attempt not found.");
    if (a.submitted_at) return { score: a.score, passed: a.passed };
    requireThat(
      d.answers.length === a.questions.length,
      400,
      "Answer count does not match the assessment.",
    );
    const expired = Date.now() > new Date(a.expires_at).getTime();
    const correct = expired
      ? 0
      : a.questions.reduce(
          (n: number, q: any, i: number) =>
            n + (q.correctIndex === d.answers[i] ? 1 : 0),
          0,
        );
    const score = Math.round((correct * 100) / a.questions.length),
      passed = !expired && score >= a.pass_percent;
    await db.query(
      "UPDATE quiz_attempts SET submitted_at=now(),answers=$1,score=$2,passed=$3 WHERE id=$4",
      [JSON.stringify(d.answers), score, passed, id],
    );
    await audit(db, user.id, "quiz.submitted", id, { score, expired });
    return { score, passed, expired };
  });
}
