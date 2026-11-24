import { readFile, readdir, writeFile } from "node:fs/promises";

// Generates a reviewable provider migration from the same application migrations.
// No credential values are included. Apply to the explicitly selected Supabase project.
const output = process.argv[2];
if (!output) throw new Error("Provide an output path for the generated SQL.");
const chunks = [
  String.raw`
SELECT pg_advisory_xact_lock(hashtextextended('incys-schema-migrations',0));
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS incys;
REVOKE ALL ON SCHEMA incys FROM PUBLIC,anon,authenticated,service_role;
SET LOCAL search_path = incys,extensions,public;
CREATE TABLE IF NOT EXISTS incys.schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now());
`,
];
for (const name of (await readdir("database"))
  .filter((n) => /^\d+_[a-z_]+\.sql$/.test(n))
  .sort()) {
  chunks.push(`DO $incys_migration$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM incys.schema_migrations WHERE name='${name}') THEN
      ${await readFile(`database/${name}`, "utf8")}
      INSERT INTO incys.schema_migrations(name) VALUES('${name}');
    END IF;
  END $incys_migration$;`);
}
chunks.push(String.raw`
DO $incys_role$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='incys_app') THEN
    CREATE ROLE incys_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='incys_app' AND
    (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid))) THEN
    RAISE EXCEPTION 'Existing incys_app role has unexpected privileges';
  END IF;
END $incys_role$;
GRANT CONNECT ON DATABASE postgres TO incys_app;
GRANT USAGE ON SCHEMA incys TO incys_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA incys TO incys_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA incys TO incys_app;
REVOKE ALL ON incys.schema_migrations FROM incys_app;
REVOKE UPDATE,DELETE ON incys.clinical_notes,incys.audit_events,incys.ledger_entries FROM incys_app;
DO $incys_rls$ DECLARE entry record; BEGIN
  FOR entry IN SELECT tablename FROM pg_tables WHERE schemaname='incys' LOOP
    EXECUTE format('ALTER TABLE incys.%I ENABLE ROW LEVEL SECURITY',entry.tablename);
    EXECUTE format('DROP POLICY IF EXISTS incys_server_access ON incys.%I',entry.tablename);
    EXECUTE format('CREATE POLICY incys_server_access ON incys.%I TO incys_app USING (true) WITH CHECK (true)',entry.tablename);
  END LOOP;
END $incys_rls$;
ALTER FUNCTION incys.reject_mutation() SET search_path = '';
-- Only the trusted runtime role can call this private lookup. JWT claims are
-- verified by the API before it supplies these IDs; browser roles have no access.
CREATE OR REPLACE FUNCTION incys.is_supabase_session_active(identity_uid uuid,session_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=session_uid AND s.user_id=identity_uid
    AND (s.not_after IS NULL OR s.not_after>now()))
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA incys FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA incys FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION incys.is_supabase_session_active(uuid,uuid) TO incys_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA incys REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA incys REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
`);
await writeFile(output, chunks.join("\n"), { mode: 0o600 });
console.log("Supabase bootstrap SQL generated without credentials.");
