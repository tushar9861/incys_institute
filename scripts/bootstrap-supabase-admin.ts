import { supabaseServer } from "../server/supabase";
import { one, pool, transaction, audit } from "../server/db";
const uid = process.env.BOOTSTRAP_SUPABASE_UID;
if (!uid || !/^[a-f0-9-]{36}$/.test(uid))
  throw new Error(
    "Set BOOTSTRAP_SUPABASE_UID to the designated verified identity.",
  );
try {
  const { data, error } =
    await supabaseServer(true).auth.admin.getUserById(uid);
  const identity = data.user;
  if (
    error ||
    !identity?.email ||
    !identity.email_confirmed_at ||
    (identity.banned_until &&
      new Date(identity.banned_until).getTime() > Date.now())
  )
    throw new Error("A verified, active identity is required.");
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
      throw new Error("An administrator already exists.");
    const existing = await one(
      "SELECT * FROM users WHERE email=$1 OR supabase_uid=$2 FOR UPDATE",
      [identity.email!.toLowerCase(), uid],
      db,
    );
    if (existing && existing.supabase_uid !== uid)
      throw new Error(
        "This email belongs to a different identity. Reconcile it explicitly.",
      );
    const user = existing
      ? await one(
          "UPDATE users SET roles=array_append(roles,'admin') WHERE id=$1 RETURNING id",
          [existing.id],
          db,
        )
      : await one(
          "INSERT INTO users(supabase_uid,email,name,roles) VALUES($1,$2,$3,ARRAY['patient','admin']) RETURNING id",
          [
            uid,
            identity.email!.toLowerCase(),
            String(
              identity.user_metadata?.name || "Institute administrator",
            ).slice(0, 100),
          ],
          db,
        );
    await audit(db, user!.id, "administrator.bootstrapped", user!.id, {
      provider: "supabase",
    });
  });
  console.log(
    "Administrator created. Complete authenticator enrollment at sign-in.",
  );
} finally {
  await pool.end();
}
