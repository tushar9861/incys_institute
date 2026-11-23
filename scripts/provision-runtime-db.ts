import { Pool } from "pg";
const migration = process.env.DATABASE_URL,
  runtime = process.env.RUNTIME_DATABASE_URL;
if (!migration || !runtime)
  throw new Error("Migration and runtime database URLs are required.");
const target = new URL(runtime),
  owner = new URL(migration),
  role = decodeURIComponent(target.username);
if (
  !/^incys_[a-z0-9_]+$/.test(role) ||
  role === decodeURIComponent(owner.username) ||
  target.pathname !== owner.pathname
)
  throw new Error(
    "Expected a separate INCYS runtime role in the same database.",
  );
if (!target.password) throw new Error("Runtime database password is required.");
const db = new Pool({ connectionString: migration, max: 1 });
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
try {
  const existing = (
    await db.query("SELECT * FROM pg_roles WHERE rolname=$1", [role])
  ).rows[0];
  if (existing) {
    const inherited = (
      await db.query("SELECT 1 FROM pg_auth_members WHERE member=$1 LIMIT 1", [
        existing.oid,
      ])
    ).rowCount;
    if (
      existing.rolsuper ||
      existing.rolcreatedb ||
      existing.rolcreaterole ||
      existing.rolreplication ||
      existing.rolbypassrls ||
      inherited
    )
      throw new Error(
        "Existing runtime role has elevated privileges; reconcile it before deployment.",
      );
  }
  const password = decodeURIComponent(target.password);
  const ddl = (
    await db.query(
      "SELECT format(CASE WHEN $3 THEN 'ALTER ROLE %I LOGIN PASSWORD %L' ELSE 'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L' END,$1::text,$2::text) AS ddl",
      [role, password, Boolean(existing)],
    )
  ).rows[0].ddl;
  await db.query(ddl);
  const identifier = quote(role);
  await db.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  await db.query(
    `GRANT CONNECT ON DATABASE ${quote(decodeURIComponent(target.pathname.slice(1)))} TO ${identifier}`,
  );
  await db.query(`GRANT USAGE ON SCHEMA public TO ${identifier}`);
  await db.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${identifier}`,
  );
  await db.query(
    `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier}`,
  );
  await db.query(`REVOKE ALL ON TABLE schema_migrations FROM ${identifier}`);
  await db.query(
    `REVOKE UPDATE,DELETE ON TABLE clinical_notes,audit_events,ledger_entries FROM ${identifier}`,
  );
  console.log(
    "Runtime database role provisioned with data access only; migration metadata and immutable history protected.",
  );
} catch {
  // PostgreSQL errors can contain the failed SQL statement. Never log password DDL.
  throw new Error(
    "Runtime database provisioning failed. Check the migration account permissions and role configuration.",
  );
} finally {
  await db.end();
}
