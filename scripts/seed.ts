import { pool, transaction, one } from "../server/db";
import { hashPassword } from "../server/auth";
if (process.env.DEMO_MODE !== "true" || process.env.NODE_ENV === "production")
  throw new Error(
    "Sample data is only permitted in an explicitly enabled development environment.",
  );
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error("Set a DEMO_PASSWORD of at least 12 characters.");
await transaction(async (db) => {
  if (
    await one(
      "SELECT id FROM users WHERE email='admin@demo.incys.local'",
      [],
      db,
    )
  ) {
    console.log("Sample data already exists; left unchanged.");
    return;
  }
  const accounts: Record<string, any> = {};
  for (const [role, name] of Object.entries({
    admin: "Institute administrator",
    patient: "Ananya Demo",
    student: "Rohan Demo",
    trainer: "Demo faculty",
    clinician: "Demo practitioner",
    vendor: "Demo wellness partner",
    reception: "Demo reception",
    finance: "Demo accountant",
  })) {
    accounts[role] = await one(
      "INSERT INTO users(email,name,password_hash,roles) VALUES($1,$2,$3,$4) RETURNING *",
      [
        `${role}@demo.incys.local`,
        name,
        hashPassword(password),
        role === "student" ? ["patient", "student"] : [role],
      ],
      db,
    );
  }
  const services = [];
  for (const [name, category, description, duration, price] of [
    [
      "Wellness consultation",
      "Consultation",
      "Meet a practitioner to discuss your goals and suitable services. Sample service; confirm clinical scope and pricing before launch.",
      45,
      60000,
    ],
    [
      "Guided yoga session",
      "Yoga",
      "A guided session focused on breath, movement and a consistent practice.",
      60,
      35000,
    ],
    [
      "Physiotherapy assessment",
      "Physiotherapy",
      "An initial assessment and discussion of an appropriate care plan.",
      45,
      80000,
    ],
    [
      "Lifestyle follow-up",
      "Consultation",
      "A scheduled follow-up with your assigned practitioner.",
      30,
      40000,
    ],
  ]) {
    const s = await one(
      "INSERT INTO services(name,category,description,duration_minutes,price_paise) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [name, category, description, duration, price],
      db,
    );
    services.push(s!);
    await db.query(
      "INSERT INTO practitioner_services(practitioner_id,service_id) VALUES($1,$2)",
      [accounts.clinician.id, s!.id],
    );
  }
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(4, 30, 0, 0);
  for (let day = 0; day < 14; day++) {
    const start = new Date(tomorrow.getTime() + day * 86400000),
      end = new Date(start.getTime() + 8 * 3600000);
    await db.query(
      "INSERT INTO availability(practitioner_id,starts_at,ends_at) VALUES($1,$2,$3)",
      [accounts.clinician.id, start, end],
    );
  }
  await db.query(
    "INSERT INTO appointments(patient_id,practitioner_id,service_id,starts_at,ends_at,price_paise) VALUES($1,$2,$3,$4,$5,$6)",
    [
      accounts.patient.id,
      accounts.clinician.id,
      services[0].id,
      tomorrow,
      new Date(tomorrow.getTime() + 45 * 60000),
      services[0].price_paise,
    ],
  );
  for (const [index, title] of [
    "Yoga Foundations",
    "Applied Wellness Practice",
    "Yoga Teaching Essentials",
  ].entries()) {
    const c = await one(
      "INSERT INTO courses(title,category,description,duration,fee_paise,published) VALUES($1,$2,$3,$4,$5,true) RETURNING *",
      [
        title,
        index === 1 ? "Wellness" : "Yoga",
        "A sample learning programme with guided lessons, live classes and practical assignments. This listing does not represent a verified academic qualification.",
        `${index + 4} weeks`,
        (index + 1) * 250000,
      ],
      db,
    );
    const v = await one(
      "INSERT INTO course_versions(course_id,syllabus) VALUES($1,$2) RETURNING *",
      [
        c!.id,
        "Foundations, guided practice, reflection and practical assessment. Institute-issued completion certificate only.",
      ],
      db,
    );
    const h = await one(
      "INSERT INTO cohorts(version_id,name,trainer_id,capacity,starts_at) VALUES($1,$2,$3,30,$4) RETURNING *",
      [v!.id, `Foundation cohort ${index + 1}`, accounts.trainer.id, tomorrow],
      db,
    );
    for (const [pos, lesson] of [
      "Welcome and learning outcomes",
      "Foundations of a sustainable practice",
      "Guided practice and reflection",
    ].entries())
      await db.query(
        "INSERT INTO lessons(version_id,title,content,position) VALUES($1,$2,$3,$4)",
        [
          v!.id,
          lesson,
          "This is sample learning content. Before launch, faculty should replace it with approved course material.\n\nUse the reflection activity to record what you have learned and discuss questions with your trainer. Do not use this material as medical advice or as a clinical protocol.",
          pos,
        ],
      );
    const classStart = new Date(
      tomorrow.getTime() + 2 * 3600000 + index * 86400000,
    );
    await db.query(
      "INSERT INTO class_sessions(cohort_id,title,starts_at,duration_minutes) VALUES($1,$2,$3,60)",
      [h!.id, "Welcome and guided learning", classStart],
    );
    await db.query(
      "INSERT INTO assignments(cohort_id,title,instructions,due_at,max_score,pass_score) VALUES($1,$2,$3,$4,100,60)",
      [
        h!.id,
        "Practice reflection",
        "Describe your learning goals, reflect on the introductory lesson, and list questions for your trainer.",
        new Date(Date.now() + 14 * 86400000),
      ],
    );
    if (index === 0)
      await db.query(
        "INSERT INTO enrolments(student_id,cohort_id,status,fee_paise) VALUES($1,$2,'active',$3)",
        [accounts.student.id, h!.id, c!.fee_paise],
      );
  }
  const vendor = await one(
    "INSERT INTO vendors(owner_id,name,description,status) VALUES($1,$2,$3,'approved') RETURNING *",
    [
      accounts.vendor.id,
      "INCYS Demo Wellness Store",
      "Sample partner for testing order fulfilment.",
    ],
    db,
  );
  for (const [name, category, description, price] of [
    [
      "Everyday yoga mat",
      "Practice essentials",
      "A sample non-medicinal yoga accessory listing.",
      149900,
    ],
    [
      "Cork practice blocks",
      "Practice essentials",
      "A pair of sample support blocks for guided practice.",
      69900,
    ],
    [
      "Practice journal",
      "Learning",
      "A sample journal for class notes and reflection.",
      34900,
    ],
    [
      "Cotton yoga strap",
      "Practice essentials",
      "A sample adjustable cotton practice strap.",
      39900,
    ],
  ])
    await db.query(
      "INSERT INTO products(vendor_id,name,category,description,price_paise,stock,status) VALUES($1,$2,$3,$4,$5,25,'approved')",
      [vendor!.id, name, category, description, price],
    );
  await db.query(
    "INSERT INTO announcements(title,body,published,created_by) VALUES($1,$2,true,$3)",
    [
      "Welcome to the INCYS platform preview",
      "This development preview contains synthetic accounts, illustrative prices and sample courses. No real payment is collected in demo mode.",
      accounts.admin.id,
    ],
  );
  await db.query(
    "INSERT INTO enquiries(name,email,interest,message) VALUES($1,$2,$3,$4)",
    [
      "Sample applicant",
      "applicant@example.test",
      "Yoga Foundations",
      "I would like to know more about the next intake and class timings.",
    ],
  );
  await db.query(
    "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
    [
      accounts.student.id,
      "Your learning space is ready",
      "Explore the syllabus, lessons and upcoming classes in your student portal.",
    ],
  );
  console.log(
    "Created synthetic sample accounts, services, learning programmes and products. Password comes from DEMO_PASSWORD.",
  );
});
await pool.end();
