import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { one, pool, transaction, audit } from "../server/db";
// Run by an operator with database and Firebase Admin credentials, never via HTTP.
const uid = process.env.BOOTSTRAP_FIREBASE_UID;
if (!uid || !process.env.FIREBASE_PROJECT_ID)
  throw new Error("Set BOOTSTRAP_FIREBASE_UID and FIREBASE_PROJECT_ID.");
initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const identity = await getAuth().getUser(uid);
if (!identity.emailVerified || !identity.email || identity.disabled)
  throw new Error(
    "The selected identity must have a verified email and be enabled.",
  );
await transaction(async (db) => {
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('incys-bootstrap',0))",
  );
  if (
    await one(
      "SELECT id FROM users WHERE 'admin'=ANY(roles) AND active",
      [],
      db,
    )
  )
    throw new Error(
      "An administrator already exists. Use the administrator access workflow.",
    );
  const existing = await one(
    "SELECT * FROM users WHERE email=$1 OR firebase_uid=$2 FOR UPDATE",
    [identity.email!.toLowerCase(), uid],
    db,
  );
  if (existing && existing.firebase_uid !== uid)
    throw new Error(
      "An account with this email exists under another identity. Reconcile it explicitly.",
    );
  const user = existing
    ? await one(
        "UPDATE users SET roles=array_append(roles,'admin') WHERE id=$1 RETURNING id",
        [existing.id],
        db,
      )
    : await one(
        "INSERT INTO users(firebase_uid,email,name,roles) VALUES($1,$2,$3,ARRAY['patient','admin']) RETURNING id",
        [
          uid,
          identity.email!.toLowerCase(),
          identity.displayName || "Institute administrator",
        ],
        db,
      );
  await audit(db, user!.id, "administrator.bootstrapped", user!.id);
});
console.log(
  "Administrator created. Complete authenticator enrollment at sign-in.",
);
await pool.end();
