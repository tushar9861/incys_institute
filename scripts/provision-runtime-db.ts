import { Pool } from "pg";
const migration = process.env.DATABASE_URL,
  runtime = process.env.RUNTIME_DATABASE_URL;
if (!migration || !runtime)
  throw new Error("Migration and runtime database URLs are required.");
const target = new URL(runtime),
  owner = new URL(migration),
  role = decodeURIComponent(target.username).split(".")[0],
  schema = process.env.DATABASE_SCHEMA || "public";
if (
  !/^incys_[a-z0-9_]+$/.test(role) ||
  !/^[a-z][a-z0-9_]*$/.test(schema) ||
  role === decodeURIComponent(owner.username).split(".")[0] ||
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
  const namespace = quote(schema);
  await db.query(`REVOKE CREATE ON SCHEMA ${namespace} FROM PUBLIC`);
  await db.query(
    `GRANT CONNECT ON DATABASE ${quote(decodeURIComponent(target.pathname.slice(1)))} TO ${identifier}`,
  );
  await db.query(`GRANT USAGE ON SCHEMA ${namespace} TO ${identifier}`);
  await db.query(
    `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${namespace} TO ${identifier}`,
  );
  await db.query(
    `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${namespace} TO ${identifier}`,
  );
  await db.query(
    `REVOKE ALL ON TABLE ${namespace}.schema_migrations FROM ${identifier}`,
  );
  await db.query(
    `REVOKE UPDATE,DELETE ON TABLE ${namespace}.clinical_notes,${namespace}.audit_events,${namespace}.ledger_entries,${namespace}.stock_movements,${namespace}.supply_documents,${namespace}.supplier_payments,${namespace}.shop_invoices FROM ${identifier}`,
  );
  if (process.env.AUTH_MODE === "supabase") {
    if (schema !== "incys")
      throw new Error(
        "Supabase application data requires the private incys schema.",
      );
    // Defense in depth if this private schema is accidentally added to the Data API.
    // The trusted API role still applies per-user authorization in server handlers.
    const tables = (
      await db.query("SELECT tablename FROM pg_tables WHERE schemaname=$1", [
        schema,
      ])
    ).rows;
    for (const { tablename } of tables) {
      const table = `${namespace}.${quote(tablename)}`;
      await db.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await db.query(`DROP POLICY IF EXISTS incys_server_access ON ${table}`);
      await db.query(
        `CREATE POLICY incys_server_access ON ${table} TO ${identifier} USING (true) WITH CHECK (true)`,
      );
    }
    await db.query(`CREATE OR REPLACE FUNCTION ${namespace}.is_supabase_session_active(identity_uid uuid, session_uid uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=session_uid AND s.user_id=identity_uid AND (s.not_after IS NULL OR s.not_after>now()))
      $$`);
    await db.query(
      `REVOKE ALL ON FUNCTION ${namespace}.is_supabase_session_active(uuid,uuid) FROM PUBLIC`,
    );
    await db.query(
      `GRANT EXECUTE ON FUNCTION ${namespace}.is_supabase_session_active(uuid,uuid) TO ${identifier}`,
    );
    for (const restricted of ["anon", "authenticated", "service_role"]) {
      await db.query(
        `REVOKE ALL ON SCHEMA ${namespace} FROM ${quote(restricted)}`,
      );
      await db.query(
        `REVOKE ALL ON ALL TABLES IN SCHEMA ${namespace} FROM ${quote(restricted)}`,
      );
      await db.query(
        `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${namespace} FROM ${quote(restricted)}`,
      );
      await db.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${namespace} REVOKE ALL ON TABLES FROM ${quote(restricted)}`,
      );
    }
  }
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
