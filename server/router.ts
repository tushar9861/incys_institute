import { googleSignInAvailable } from "./google-sign-in";
import { z } from "zod";
import {
  authenticate,
  login,
  register,
  tokenHash,
  isDemo,
  throttle,
  has,
} from "./auth";
import { rows, one, pool } from "./db";
import { AppError, requireThat } from "./errors";
import * as clinic from "./clinic";
import * as learning from "./learning";
import * as commerce from "./commerce";
import * as platform from "./platform";
import * as assessments from "./assessments";
import * as refunds from "./refunds";
import { boundedBody } from "./request-body";
import { allowedOrigin } from "./origin";
import { authorizedWorkerRequest } from "./job-auth";
import { runWorker } from "./worker";
function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export async function route(request: Request, path: string[]) {
  try {
    const method = request.method,
      key = path.join("/");
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (mutation && key !== "payments/webhook") {
      const origin = request.headers.get("origin");
      if (origin)
        requireThat(allowedOrigin(origin), 403, "Unrecognized request origin.");
      // Browser cookies require same-origin protection. Native clients authenticate via bearer token.
      if (request.headers.get("cookie")?.includes("incys_session="))
        requireThat(
          allowedOrigin(origin),
          403,
          "A same-origin request is required.",
        );
    }
    let body: unknown = {};
    let raw = "";
    if (mutation) {
      raw = new TextDecoder().decode(await boundedBody(request, 65536));
      requireThat(
        Buffer.byteLength(raw) <= 65536,
        413,
        "Request is too large.",
      );
      if (raw && key !== "payments/webhook") {
        try {
          body = JSON.parse(raw);
        } catch {
          throw new AppError(400, "Invalid JSON request.");
        }
      }
    }
    if (key === "livez" && method === "GET")
      return json({
        status: "alive",
        version: process.env.DEPLOYMENT_VERSION || "development",
      });
    if (key === "health" && method === "GET") {
      await pool.query("SELECT 1 FROM services LIMIT 0");
      return json({ status: "ok" });
    }
    if (key === "config" && method === "GET")
      return json({
        demo: isDemo(),
        authMode: process.env.AUTH_MODE,
        onlinePayments: Boolean(process.env.RAZORPAY_KEY_ID),
        googleSignIn: await googleSignInAvailable(),
      });
    if (key === "catalog" && method === "GET")
      return json(await platform.catalog());
    if (key === "internal/worker" && method === "POST") {
      requireThat(
        authorizedWorkerRequest(request),
        401,
        "Invalid job credentials.",
      );
      return json(await runWorker());
    }
    if (key === "auth/login" && method === "POST") {
      const d = z
        .object({
          email: z.email().transform((s) => s.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .parse(body);
      const result = await login(d.email, d.password);
      return json(result, 200, {
        "Set-Cookie": `incys_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,
      });
    }
    if (key === "auth/register" && method === "POST") {
      const d = z
        .object({
          name: z.string().trim().min(2).max(100),
          email: z.email().transform((s) => s.toLowerCase()),
          password: z.string().min(12).max(128),
          consent: z.literal(true),
        })
        .parse(body);
      return json(await register(d.name, d.email, d.password), 201);
    }
    if (key === "auth/logout" && method === "POST") {
      const token =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ||
        request.headers
          .get("cookie")
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("incys_session="))
          ?.slice(14);
      if (token)
        await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
          tokenHash(token),
        ]);
      return json({ signedOut: true }, 200, {
        "Set-Cookie":
          "incys_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      });
    }
    if (key === "enquiries" && method === "POST") {
      const d = z
        .object({
          name: z.string().min(2).max(100),
          email: z.email().max(200),
          interest: z.string().min(2).max(100),
          message: z.string().min(5).max(3000),
          consent: z.literal(true),
        })
        .parse(body);
      await throttle(`enquiry:${d.email.toLowerCase()}`, 5, 3600);
      await pool.query(
        "INSERT INTO enquiries(name,email,interest,message) VALUES($1,$2,$3,$4)",
        [d.name, d.email, d.interest, d.message],
      );
      return json({ received: true }, 201);
    }
    if (path[0] === "verify" && path[1] && method === "GET") {
      const c = await one(
        `SELECT c.serial,c.issued_at,c.revoked_at,u.name AS student_name,p.title,p.award_type FROM certificates c JOIN enrolments e ON e.id=c.enrolment_id JOIN users u ON u.id=e.student_id JOIN cohorts h ON h.id=e.cohort_id JOIN course_versions v ON v.id=h.version_id JOIN courses p ON p.id=v.course_id WHERE c.serial=$1`,
        [path[1]],
      );
      requireThat(c, 404, "Certificate not found.");
      return json(c);
    }
    if (key === "payments/webhook" && method === "POST")
      return json(
        await commerce.paymentWebhook(
          raw,
          request.headers.get("x-razorpay-signature"),
          request.headers.get("x-razorpay-event-id"),
        ),
      );
    const user = await authenticate(request);
    if (key === "me" && method === "GET") return json(user);
    if (key === "workspace" && method === "GET")
      return json(await platform.workspace(user));
    if (key === "privacy-requests" && method === "POST") {
      const d = z
        .object({
          requestType: z.enum(["access", "correction", "erasure"]),
          message: z.string().min(5).max(3000),
        })
        .parse(body);
      return json(
        await one(
          "INSERT INTO privacy_requests(user_id,request_type,message) VALUES($1,$2,$3) RETURNING *",
          [user.id, d.requestType, d.message],
        ),
        201,
      );
    }
    if (key === "devices" && method === "POST") {
      const d = z.object({ token: z.string().min(20).max(500) }).parse(body);
      await pool.query(
        "INSERT INTO device_tokens(token,user_id) VALUES($1,$2) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id",
        [d.token, user.id],
      );
      return json({ registered: true });
    }
    if (key === "devices/unregister" && method === "POST") {
      const d = z.object({ token: z.string().min(20).max(500) }).parse(body);
      await pool.query(
        "DELETE FROM device_tokens WHERE token=$1 AND user_id=$2",
        [d.token, user.id],
      );
      return json({ removed: true });
    }
    if (path.length > 1 && !["payments"].includes(path[0]))
      z.string().uuid().parse(path[1]);
    if (key === "appointments" && method === "POST")
      return json(await clinic.bookAppointment(user, body), 201);
    if (path[0] === "appointments" && path[1]) {
      if (path[2] === "meeting" && method === "POST")
        return json(await clinic.setAppointmentMeeting(user, path[1], body));
      if (path[2] === "join" && method === "POST")
        return json(await clinic.joinAppointment(user, path[1]));
      if (path[2] === "notes" && method === "GET")
        return json(await clinic.clinicalRecords(user, path[1]));
      if (path[2] === "notes" && method === "POST")
        return json(await clinic.addClinicalNote(user, path[1], body), 201);
      if (path.length === 2 && method === "PATCH")
        return json(await clinic.changeAppointment(user, path[1], body));
    }
    if (key === "plans" && method === "POST")
      return json(await clinic.createPlan(user, body), 201);
    if (path[0] === "plans" && path[2] === "sessions" && method === "POST")
      return json(await clinic.recordTreatment(user, path[1], body), 201);
    if (key === "enrolments" && method === "POST")
      return json(await learning.applyCourse(user, body), 201);
    if (path[0] === "enrolments" && path[1]) {
      if (method === "GET")
        return json(await learning.learningDetail(user, path[1]));
      if (path[2] === "lessons" && method === "POST")
        return json(await learning.completeLesson(user, path[1], body));
      if (path[2] === "certificate" && method === "POST")
        return json(await learning.issueCertificate(user, path[1]), 201);
      if (path.length === 2 && method === "PATCH")
        return json(await learning.approveEnrolment(user, path[1], body));
    }
    if (path[0] === "assignments" && path[2] === "submit" && method === "POST")
      return json(await learning.submitAssignment(user, path[1], body));
    if (path[0] === "submissions" && method === "PATCH")
      return json(await learning.gradeSubmission(user, path[1], body));
    if (path[0] === "classes" && path[2] === "attendance" && method === "POST")
      return json(await learning.markAttendance(user, path[1], body));
    if (path[0] === "classes" && path[2] === "join" && method === "POST") {
      const c = await one(
        "SELECT c.*,h.trainer_id FROM class_sessions c JOIN cohorts h ON h.id=c.cohort_id WHERE c.id=$1",
        [path[1]],
      );
      requireThat(
        c && c.status === "scheduled",
        404,
        "Class is not available.",
      );
      const e = await one(
        "SELECT * FROM enrolments WHERE cohort_id=$1 AND student_id=$2 AND status='active'",
        [c.cohort_id, user.id],
      );
      requireThat(
        has(user, "admin") ||
          c.trainer_id === user.id ||
          (e && e.paid_paise >= e.fee_paise),
        403,
        "Active enrolment and cleared fees are required.",
      );
      const start = new Date(c.starts_at).getTime();
      requireThat(
        Date.now() >= start - 15 * 60000 &&
          Date.now() <= start + (c.duration_minutes + 15) * 60000,
        409,
        "Joining opens 15 minutes before class.",
      );
      requireThat(
        c.meeting_url,
        503,
        "The trainer has not added the class meeting yet.",
      );
      return json({ url: c.meeting_url });
    }
    if (key === "orders" && method === "POST")
      return json(await commerce.placeOrder(user, body), 201);
    if (path[0] === "orders" && path[2] === "cancel" && method === "POST")
      return json(await commerce.cancelOrder(user, path[1]));
    if (path[0] === "order-items" && method === "PATCH")
      return json(await commerce.fulfillItem(user, path[1], body));
    if (key === "payments" && method === "POST")
      return json(await commerce.createPayment(user, body), 201);
    if (key === "refunds" && method === "POST")
      return json(await refunds.requestRefund(user, body), 201);
    if (path[0] === "refunds" && path[2] === "approve" && method === "POST")
      return json(await refunds.approveRefund(user, path[1]));
    if (key === "quizzes" && method === "POST")
      return json(await assessments.createQuiz(user, body), 201);
    if (path[0] === "quizzes" && path[2] === "start" && method === "POST")
      return json(await assessments.startQuiz(user, path[1]));
    if (path[0] === "quiz-attempts" && method === "POST")
      return json(await assessments.submitQuiz(user, path[1], body));
    if (key === "payments/demo" && method === "POST") {
      requireThat(isDemo(), 404, "Not found.");
      const d = z.object({ paymentId: z.string().uuid() }).parse(body);
      const p = await one("SELECT * FROM payments WHERE id=$1 AND user_id=$2", [
        d.paymentId,
        user.id,
      ]);
      requireThat(p, 403, "Payment not found.");
      return json(
        await commerce.capturePayment(
          p.id,
          `demo-event-${p.id}`,
          `demo-payment-${p.id}`,
          p.amount_paise,
          p.currency,
        ),
      );
    }
    if (method === "POST" && path.length === 1)
      return json(await platform.createResource(user, path[0], body), 201);
    if (method === "PATCH" && path.length === 2)
      return json(await platform.updateResource(user, path[0], path[1], body));
    throw new AppError(404, "Endpoint not found.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: "Check the submitted fields.",
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    const code = (error as { code?: string }).code;
    if (code === "23P01")
      return json(
        {
          error: "That time has just been booked. Please choose another slot.",
        },
        409,
      );
    if (code === "23505")
      return json({ error: "This record already exists." }, 409);
    if (["23503", "23514", "22P02"].includes(code || ""))
      return json({ error: "Invalid record reference or value." }, 400);
    console.error("API request failed", {
      code: code || "internal",
      path: path.slice(0, 1),
    });
    return json(
      { error: "The request could not be completed. Please try again." },
      500,
    );
  }
}
