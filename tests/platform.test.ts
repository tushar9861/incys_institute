import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { one, rows, pool, transaction } from "../server/db";
import { hashPassword, login, type User } from "../server/auth";
import {
  bookAppointment,
  addClinicalNote,
  clinicalRecords,
} from "../server/clinic";
import {
  placeOrder,
  capturePayment,
  createPayment,
  cancelOrder,
  fulfillItem,
  paymentWebhook,
} from "../server/commerce";
import {
  applyCourse,
  approveEnrolment,
  completeLesson,
  submitAssignment,
  gradeSubmission,
  issueCertificate,
} from "../server/learning";
import { route } from "../server/router";
import { createQuiz, startQuiz, submitQuiz } from "../server/assessments";
import { requestRefund, approveRefund, processRefund } from "../server/refunds";
import {
  setAppointmentMeeting,
  joinAppointment,
  appointments,
} from "../server/clinic";
import { updateResource, createResource, workspace } from "../server/platform";
import { uploadDocument, downloadDocument } from "../server/files";
after(async () => pool.end());
async function user(role = "patient"): Promise<User> {
  return (await one(
    "INSERT INTO users(email,name,roles,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
    [
      `${randomUUID()}@test.invalid`,
      `Test ${role}`,
      [role],
      hashPassword("test-password-for-suite"),
    ],
  )) as User;
}
async function clinicFixture() {
  const practitioner = await user("clinician"),
    patient = await user(),
    other = await user(),
    s = (await one(
      "INSERT INTO services(name,category,duration_minutes,price_paise) VALUES('Test service','Test',45,50000) RETURNING *",
    ))!;
  await pool.query(
    "INSERT INTO practitioner_services(practitioner_id,service_id) VALUES($1,$2)",
    [practitioner.id, s.id],
  );
  const start = new Date(Date.now() + 5 * 86400000);
  start.setUTCMinutes(0, 0, 0);
  await pool.query(
    "INSERT INTO availability(practitioner_id,starts_at,ends_at) VALUES($1,$2,$3)",
    [practitioner.id, start, new Date(start.getTime() + 4 * 3600000)],
  );
  return {
    practitioner,
    patient,
    other,
    service: s,
    input: {
      serviceId: s.id,
      practitionerId: practitioner.id,
      startsAt: start.toISOString(),
      mode: "in_person",
      consent: true,
    },
  };
}
async function storeFixture(stock = 5) {
  const customer = await user(),
    seller = await user("vendor"),
    v = (await one(
      "INSERT INTO vendors(owner_id,name,status) VALUES($1,'Test vendor','approved') RETURNING *",
      [seller.id],
    ))!,
    p = (await one(
      "INSERT INTO products(vendor_id,name,category,description,price_paise,stock,status) VALUES($1,'Test product','Test','Test description',100000,$2,'approved') RETURNING *",
      [v.id, stock],
    ))!;
  return {
    customer,
    seller,
    vendor: v,
    product: p,
    input: {
      items: [{ productId: p.id, quantity: 1 }],
      address: {
        name: "Test buyer",
        phone: "9999999999",
        line: "Synthetic test address",
        city: "Balasore",
        postcode: "756001",
      },
      idempotencyKey: randomUUID(),
    },
  };
}
test("two simultaneous bookings cannot reserve the same practitioner slot", async () => {
  const f = await clinicFixture();
  const results = await Promise.allSettled([
    bookAppointment(f.patient, f.input),
    bookAppointment(f.other, f.input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await one(
      "SELECT count(*)::int AS n FROM appointments WHERE practitioner_id=$1",
      [f.practitioner.id],
    ))!.n,
    1,
  );
});
test("a user cannot read another patient’s notes; administrators have no implicit clinical access", async () => {
  const f = await clinicFixture(),
    a = (await bookAppointment(f.patient, f.input))!;
  await addClinicalNote(f.practitioner, a.id, {
    body: "Synthetic clinical note.",
  });
  await assert.rejects(() => clinicalRecords(f.other, a.id), /restricted/);
  await assert.rejects(
    async () => clinicalRecords(await user("admin"), a.id),
    /restricted/,
  );
  assert.equal((await clinicalRecords(f.patient, a.id)).length, 1);
  await assert.rejects(
    () =>
      pool.query("UPDATE clinical_notes SET body=$1 WHERE appointment_id=$2", [
        "Changed",
        a.id,
      ]),
    /Append-only/,
  );
});
test("booking outside published availability is rejected without creating records", async () => {
  const f = await clinicFixture();
  await assert.rejects(
    () =>
      bookAppointment(f.patient, {
        ...f.input,
        startsAt: new Date(Date.now() + 100 * 86400000).toISOString(),
      }),
    /availability/,
  );
});
test("order pricing is server-derived and duplicate checkout keys reserve stock once", async () => {
  const f = await storeFixture();
  const result = await Promise.all([
    placeOrder(f.customer, { ...f.input, totalPaise: 1 }),
    placeOrder(f.customer, f.input),
  ]);
  assert.equal(result[0]!.id, result[1]!.id);
  assert.equal(result[0]!.total_paise, 100000);
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.product.id]))!
      .stock,
    4,
  );
});
test("concurrent orders cannot oversell the last item", async () => {
  const f = await storeFixture(1),
    other = await user();
  const results = await Promise.allSettled([
    placeOrder(f.customer, f.input),
    placeOrder(other, { ...f.input, idempotencyKey: randomUUID() }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.product.id]))!
      .stock,
    0,
  );
});
test("payment capture is idempotent and creates a balanced 5% commission ledger", async () => {
  const f = await storeFixture(),
    o = (await placeOrder(f.customer, f.input))!,
    p = await createPayment(f.customer, {
      referenceType: "order",
      referenceId: o.id,
    });
  await assert.rejects(
    () => capturePayment(p.id, randomUUID(), randomUUID(), 1, "INR"),
    /mismatch/,
  );
  const event = randomUUID(),
    payment = randomUUID();
  await Promise.all([
    capturePayment(p.id, event, payment, 100000, "INR"),
    capturePayment(p.id, event, payment, 100000, "INR"),
  ]);
  const ledger = await rows(
    "SELECT * FROM ledger_entries WHERE payment_id=$1",
    [p.id],
  );
  assert.equal(
    ledger.reduce((s, l) => s + l.amount_paise, 0),
    0,
  );
  assert.equal(
    ledger.find((l) => l.account === "institute_commission")!.amount_paise,
    -5000,
  );
  assert.equal(
    ledger.find((l) => l.account.startsWith("vendor_payable"))!.amount_paise,
    -95000,
  );
  assert.equal(
    (await one("SELECT status FROM orders WHERE id=$1", [o.id]))!.status,
    "paid",
  );
});
test("vendor cannot fulfil another vendor’s item or dispatch an unpaid order", async () => {
  const f = await storeFixture(),
    o = (await placeOrder(f.customer, f.input))!,
    i = (await one("SELECT * FROM order_items WHERE order_id=$1", [o.id]))!,
    outsider = await user("vendor");
  await assert.rejects(
    () => fulfillItem(outsider, i.id, { status: "accepted" }),
    /cannot fulfil/,
  );
  await assert.rejects(
    () => fulfillItem(f.seller, i.id, { status: "accepted" }),
    /Payment must/,
  );
});
test("cancelling unpaid checkout restores stock exactly once", async () => {
  const f = await storeFixture(),
    o = (await placeOrder(f.customer, f.input))!;
  await cancelOrder(f.customer, o.id);
  await assert.rejects(() => cancelOrder(f.customer, o.id), /refund workflow/);
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.product.id]))!
      .stock,
    5,
  );
});
test("webhook rejects an invalid signature before processing payloads", async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-only-secret";
  await assert.rejects(
    () => paymentWebhook("{}", "a".repeat(64), "test-event"),
    /Invalid webhook signature/,
  );
});
test("course completion requires approved enrolment, the right lessons, fees and passed assignments", async () => {
  const student = await user("student"),
    teacher = await user("trainer"),
    admin = await user("admin"),
    otherTeacher = await user("trainer");
  const c = (await one(
    "INSERT INTO courses(title,category,description,duration,fee_paise,published) VALUES('Test programme','Test','Test syllabus','1 week',10000,true) RETURNING *",
  ))!;
  const v = (await one(
    "INSERT INTO course_versions(course_id,syllabus) VALUES($1,$2) RETURNING *",
    [c.id, "Test curriculum"],
  ))!;
  const h = (await one(
    "INSERT INTO cohorts(version_id,name,trainer_id,capacity,starts_at) VALUES($1,'Test cohort',$2,1,now()) RETURNING *",
    [v.id, teacher.id],
  ))!;
  const l = (await one(
    "INSERT INTO lessons(version_id,title,content) VALUES($1,'Test lesson','Test content') RETURNING *",
    [v.id],
  ))!;
  const a = (await one(
    "INSERT INTO assignments(cohort_id,title,instructions,due_at,max_score,pass_score) VALUES($1,'Test assignment','Respond',now()+interval '1 day',100,60) RETURNING *",
    [h.id],
  ))!;
  const e = (await applyCourse(student, { cohortId: h.id, consent: true }))!;
  await assert.rejects(
    async () =>
      applyCourse(await user("student"), { cohortId: h.id, consent: true }),
    /full/,
  );
  await assert.rejects(
    () => completeLesson(student, e.id, { lessonId: l.id }),
    /Active enrolment/,
  );
  await approveEnrolment(admin, e.id, { status: "active" });
  await assert.rejects(() => issueCertificate(admin, e.id), /fees/);
  const p = await createPayment(student, {
    referenceType: "enrolment",
    referenceId: e.id,
  });
  await capturePayment(p.id, randomUUID(), randomUUID(), 10000, "INR");
  await assert.rejects(() => issueCertificate(admin, e.id), /lessons/);
  await assert.rejects(
    () => completeLesson(student, e.id, { lessonId: randomUUID() }),
    /course version/,
  );
  await completeLesson(student, e.id, { lessonId: l.id });
  const upload = async (owner: User, purpose: string) => {
    const session = await login(owner.email, "test-password-for-suite");
    const form = new FormData();
    form.set(
      "file",
      new File(["%PDF-1.4\nSynthetic assignment"], "assignment.pdf", {
        type: "application/pdf",
      }),
    );
    form.set("purpose", purpose);
    return (await uploadDocument(
      new Request("http://localhost/api/v1/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: form,
      }),
    ))!;
  };
  const attachment = await upload(student, "assignment_attachment");
  const otherAttachment = await upload(otherTeacher, "assignment_attachment");
  const clinical = await upload(student, "patient_report");
  const quarantined = await upload(student, "assignment_attachment");
  await pool.query("UPDATE documents SET state='quarantined' WHERE id=$1", [
    quarantined.id,
  ]);
  for (const forbidden of [otherAttachment, clinical, quarantined]) {
    await assert.rejects(
      () =>
        submitAssignment(student, a.id, {
          body: "Cannot attach another owner's, clinical, or unscanned document.",
          documentId: forbidden.id,
        }),
      /scanned assignment attachments/,
    );
  }
  const downloadAs = async (viewer: User, id: string) => {
    const session = await login(viewer.email, "test-password-for-suite");
    return downloadDocument(
      new Request("http://localhost", {
        headers: { Authorization: `Bearer ${session.token}` },
      }),
      id,
    );
  };
  await assert.rejects(
    () => downloadAs(teacher, attachment.id),
    /cannot access/,
  );
  const s = (await submitAssignment(student, a.id, {
    body: "Synthetic assignment response.",
    documentId: attachment.id,
  }))!;
  assert.equal(s.document_id, attachment.id);
  assert.equal((await downloadAs(teacher, attachment.id)).status, 200);
  assert.equal((await downloadAs(admin, attachment.id)).status, 200);
  await assert.rejects(
    () => downloadAs(otherTeacher, attachment.id),
    /cannot access/,
  );
  await assert.rejects(() => downloadAs(admin, clinical.id), /cannot access/);
  assert.ok(
    (await workspace(teacher)).documents.some(
      (d: any) => d.id === attachment.id,
    ),
  );
  assert.ok(
    !(await workspace(otherTeacher)).documents.some(
      (d: any) => d.id === attachment.id,
    ),
  );
  await submitAssignment(student, a.id, {
    body: "Removed the attachment.",
    documentId: null,
  });
  await assert.rejects(
    () => downloadAs(teacher, attachment.id),
    /cannot access/,
  );
  await submitAssignment(student, a.id, {
    body: "Reattached the assignment.",
    documentId: attachment.id,
  });
  await assert.rejects(
    () => gradeSubmission(otherTeacher, s.id, { score: 90, feedback: "Test" }),
    /not assigned/,
  );
  await gradeSubmission(teacher, s.id, { score: 90, feedback: "Pass" });
  await assert.rejects(
    () =>
      submitAssignment(student, a.id, {
        body: "Attempt to replace graded work.",
        documentId: null,
      }),
    /graded submission/,
  );
  const certificate = await issueCertificate(admin, e.id);
  assert.ok(certificate!.serial.startsWith("INCYS-"));
  await assert.rejects(() => issueCertificate(admin, e.id), /active enrolment/);
});
test("API requires authentication, blocks cross-origin mutations, and does not permit role escalation at signup", async () => {
  const unauth = await route(new Request("http://localhost/api/v1/workspace"), [
    "workspace",
  ]);
  assert.equal(unauth.status, 401);
  const cross = await route(
    new Request("http://localhost/api/v1/enquiries", {
      method: "POST",
      headers: { Origin: "https://attacker.invalid" },
      body: "{}",
    }),
    ["enquiries"],
  );
  assert.equal(cross.status, 403);
  const email = `${randomUUID()}@test.invalid`;
  const response = await route(
    new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New user",
        email,
        password: "long-test-password",
        consent: true,
        roles: ["admin"],
      }),
    }),
    ["auth", "register"],
  );
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).roles, ["patient"]);
  const auth = await login(email, "long-test-password");
  const me = await route(
    new Request("http://localhost/api/v1/me", {
      headers: { Authorization: `Bearer ${auth.token}` },
    }),
    ["me"],
  );
  assert.equal(me.status, 200);
  const escalation = await route(
    new Request("http://localhost/api/v1/users/" + auth.user.id, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ active: true, roles: ["admin"] }),
    }),
    ["users", auth.user.id],
  );
  assert.equal(escalation.status, 403);
});

async function assessmentFixture() {
  const student = await user("student"),
    teacher = await user("trainer");
  const course = (await one(
    "INSERT INTO courses(title,category,description,duration,fee_paise,published) VALUES('Assessment course','Test','Test course','1 week',0,true) RETURNING *",
  ))!;
  const version = (await one(
    "INSERT INTO course_versions(course_id,syllabus) VALUES($1,$2) RETURNING *",
    [course.id, "Test syllabus"],
  ))!;
  const cohort = (await one(
    "INSERT INTO cohorts(version_id,name,trainer_id,capacity,starts_at) VALUES($1,'Quiz cohort',$2,10,now()) RETURNING *",
    [version.id, teacher.id],
  ))!;
  const enrolment = (await applyCourse(student, {
    cohortId: cohort.id,
    consent: true,
  }))!;
  await approveEnrolment(await user("admin"), enrolment.id, {
    status: "active",
  });
  const quiz = (await createQuiz(teacher, {
    cohortId: cohort.id,
    title: "Test assessment",
    durationMinutes: 10,
    passPercent: 60,
    maxAttempts: 1,
    published: true,
    questions: [
      {
        prompt: "Choose option two.",
        options: ["One", "Two"],
        correctIndex: 1,
      },
    ],
  }))!;
  return { student, teacher, course, version, cohort, enrolment, quiz };
}

test("quizzes hide answer keys, enforce ownership and attempt limits, and grade once", async () => {
  const f = await assessmentFixture();
  const attempt = await startQuiz(f.student, f.quiz.id);
  assert.equal("correctIndex" in attempt.questions[0], false);
  assert.equal((await startQuiz(f.student, f.quiz.id)).id, attempt.id);
  await assert.rejects(
    async () => submitQuiz(await user("student"), attempt.id, { answers: [1] }),
    /not found/,
  );
  assert.equal(
    (await submitQuiz(f.student, attempt.id, { answers: [1] })).score,
    100,
  );
  assert.equal(
    (await submitQuiz(f.student, attempt.id, { answers: [0] })).score,
    100,
  );
  await assert.rejects(
    () => startQuiz(f.student, f.quiz.id),
    /No assessment attempts/,
  );
  await assert.rejects(
    () =>
      createResource(f.teacher, "lessons", {
        versionId: f.version.id,
        title: "New lesson",
        content: "Late curriculum change",
        position: 2,
      }),
    /active learners/,
  );
});

test("an expired assessment cannot pass even with correct answers", async () => {
  const f = await assessmentFixture(),
    attempt = await startQuiz(f.student, f.quiz.id);
  await pool.query(
    "UPDATE quiz_attempts SET expires_at=now()-interval '1 second' WHERE id=$1",
    [attempt.id],
  );
  const result = await submitQuiz(f.student, attempt.id, { answers: [1] });
  assert.equal(result.score, 0);
  assert.equal(result.passed, false);
});

test("refund approval separates requester and approver, reverses ledger and restores unsent stock once", async () => {
  const f = await storeFixture(),
    order = (await placeOrder(f.customer, f.input))!;
  const p = await createPayment(f.customer, {
    referenceType: "order",
    referenceId: order.id,
  });
  await capturePayment(p.id, randomUUID(), randomUUID(), 100000, "INR");
  const finance = await user("finance"),
    admin = await user("admin");
  const refund = (await requestRefund(finance, {
    paymentId: p.id,
    reason: "Synthetic cancellation request.",
  }))!;
  await assert.rejects(
    () => approveRefund(finance, refund.id),
    /different staff/,
  );
  await assert.rejects(
    () => approveRefund(f.customer, refund.id),
    /permission/,
  );
  await approveRefund(admin, refund.id);
  await processRefund(refund.id, `demo-refund-${refund.id}`);
  const ledger = await rows(
    "SELECT account,amount_paise FROM ledger_entries WHERE payment_id=$1",
    [p.id],
  );
  assert.equal(ledger.length, 6);
  assert.equal(
    ledger.reduce((n, l) => n + l.amount_paise, 0),
    0,
  );
  assert.equal(
    ledger.find((l) => l.account === "refund:institute_commission")
      ?.amount_paise,
    5000,
  );
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.product.id]))!
      .stock,
    5,
  );
  assert.equal(
    (await one("SELECT status FROM payments WHERE id=$1", [p.id]))!.status,
    "refunded",
  );
});

test("online meeting links are hidden from lists and require the assigned participant, time window and cleared fees", async () => {
  const f = await clinicFixture(),
    a = (await bookAppointment(f.patient, { ...f.input, mode: "online" }))!;
  await setAppointmentMeeting(f.practitioner, a.id, {
    meetingUrl: "https://meet.example.test/private-room",
  });
  assert.equal("meeting_url" in (await appointments(f.patient))[0], false);
  await assert.rejects(
    () => joinAppointment(f.other, a.id),
    /Only the patient/,
  );
  await assert.rejects(() => joinAppointment(f.patient, a.id), /fee/);
  const p = await createPayment(f.patient, {
    referenceType: "appointment",
    referenceId: a.id,
  });
  await capturePayment(p.id, randomUUID(), randomUUID(), 50000, "INR");
  await assert.rejects(() => joinAppointment(f.patient, a.id), /15 minutes/);
  await pool.query(
    "UPDATE appointments SET starts_at=now()-interval '2 minutes',ends_at=now()+interval '43 minutes' WHERE id=$1",
    [a.id],
  );
  assert.equal(
    (await joinAppointment(f.patient, a.id)).url,
    "https://meet.example.test/private-room",
  );
});

test("private files reject spoofed content and cross-user downloads", async () => {
  const owner = await user(),
    other = await user();
  const session = await login(owner.email, "test-password-for-suite");
  const make = (bytes: string) => {
    const form = new FormData();
    form.set(
      "file",
      new File([bytes], "report.pdf", { type: "application/pdf" }),
    );
    form.set("purpose", "patient_report");
    return new Request("http://localhost/api/v1/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: form,
    });
  };
  await assert.rejects(
    () => uploadDocument(make("<script>bad</script>")),
    /format/,
  );
  const doc = (await uploadDocument(
    make("%PDF-1.4\nSynthetic integration test document"),
  ))!;
  const outsider = await login(other.email, "test-password-for-suite");
  await assert.rejects(
    () =>
      downloadDocument(
        new Request("http://localhost", {
          headers: { Authorization: `Bearer ${outsider.token}` },
        }),
        doc.id,
      ),
    /cannot access/,
  );
  const response = await downloadDocument(
    new Request("http://localhost", {
      headers: { Authorization: `Bearer ${session.token}` },
    }),
    doc.id,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition")!, /attachment/);
});

test("privacy decisions require an administrator and oversized API bodies are rejected", async () => {
  const owner = await user();
  const r = (await one(
    "INSERT INTO privacy_requests(user_id,request_type,message) VALUES($1,'access','Test data access request') RETURNING *",
    [owner.id],
  ))!;
  await assert.rejects(
    () =>
      updateResource(owner, "privacy-requests", r.id, {
        status: "completed",
        response: "Unauthorised closure",
      }),
    /permission/,
  );
  await updateResource(await user("admin"), "privacy-requests", r.id, {
    status: "reviewing",
    response: "Identity verified; review underway.",
  });
  const response = await route(
    new Request("http://localhost/api/v1/enquiries", {
      method: "POST",
      body: "x".repeat(65537),
    }),
    ["enquiries"],
  );
  assert.equal(response.status, 413);
});

test("late captures on cancelled orders are recorded for reconciliation and can be refunded without restoring stock twice", async () => {
  const f = await storeFixture(),
    order = (await placeOrder(f.customer, f.input))!;
  const p = await createPayment(f.customer, {
    referenceType: "order",
    referenceId: order.id,
  });
  await cancelOrder(f.customer, order.id);
  const capture = await capturePayment(
    p.id,
    randomUUID(),
    randomUUID(),
    100000,
    "INR",
  );
  assert.equal("needsReview" in capture && capture.needsReview, true);
  assert.equal(
    (await one("SELECT status FROM orders WHERE id=$1", [order.id]))!.status,
    "cancelled",
  );
  assert.ok(
    (await one("SELECT reconciliation_reason FROM payments WHERE id=$1", [
      p.id,
    ]))!.reconciliation_reason,
  );
  const refund = (await requestRefund(f.customer, {
    paymentId: p.id,
    reason: "Payment arrived after cancellation.",
  }))!;
  await approveRefund(await user("finance"), refund.id);
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.product.id]))!
      .stock,
    5,
  );
  assert.equal(
    (await one(
      "SELECT sum(amount_paise)::int AS balance FROM ledger_entries WHERE payment_id=$1",
      [p.id],
    ))!.balance,
    0,
  );
});

test("concurrent worker jobs deliver one durable notification and release each expired reservation once", async () => {
  const recipient = await user();
  const event = (await one(
    "INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('TestUpdate',$1,$2) RETURNING id",
    [recipient.id, { userId: recipient.id }],
  ))!;
  const f = await storeFixture(),
    order = (await placeOrder(f.customer, f.input))!;
  await pool.query(
    "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [order.id],
  );
  const run = () =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/worker.ts"],
        { env: process.env, stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Worker exited ${code}`)),
      );
    });
  await Promise.all([run(), run()]);
  assert.equal(
    (await one("SELECT count(*)::int AS n FROM event_inbox WHERE event_id=$1", [
      event.id,
    ]))!.n,
    1,
  );
  assert.equal(
    (await one(
      "SELECT count(*)::int AS n FROM notifications WHERE user_id=$1",
      [recipient.id],
    ))!.n,
    1,
  );
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.product.id]))!
      .stock,
    5,
  );
  assert.equal(
    (await one("SELECT status FROM orders WHERE id=$1", [order.id]))!.status,
    "cancelled",
  );
});
