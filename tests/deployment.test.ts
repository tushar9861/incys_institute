import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import { allowedOrigin } from "../server/origin";

test("Hosting aliases accept exact origins only", () => {
  const previous = {
    app: process.env.APP_ORIGIN,
    allowed: process.env.ALLOWED_ORIGINS,
  };
  try {
    process.env.APP_ORIGIN = "https://incys-institute.web.app";
    process.env.ALLOWED_ORIGINS = "https://incys-institute.firebaseapp.com";
    assert.ok(allowedOrigin("https://incys-institute.web.app"));
    assert.ok(allowedOrigin("https://incys-institute.firebaseapp.com"));
    for (const origin of [
      null,
      "null",
      "http://incys-institute.web.app",
      "https://incys-institute.web.app.evil.invalid",
      "https://incys-institute.web.app@evil.invalid",
    ])
      assert.equal(allowedOrigin(origin), false);
  } finally {
    if (previous.app === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous.app;
    if (previous.allowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous.allowed;
  }
});

test("deployed runtime can use application tables but cannot change schema or immutable history", async () => {
  const source = new URL(process.env.DATABASE_URL!);
  assert.match(source.pathname, /_test$/);
  const role = `incys_runtime_test_${randomBytes(6).toString("hex")}`;
  const runtimeUrl = new URL(source);
  runtimeUrl.username = role;
  runtimeUrl.password = randomBytes(32).toString("hex");
  const admin = new Pool({ connectionString: source.toString() });
  const runtime = new Pool({ connectionString: runtimeUrl.toString() });
  try {
    const env = { ...process.env, RUNTIME_DATABASE_URL: runtimeUrl.toString() };
    // Re-running the migration provisioner must retain the restricted role.
    for (let attempt = 0; attempt < 2; attempt++) {
      await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "scripts/provision-runtime-db.ts"],
        { env },
      );
    }
    await runtime.query("SELECT 1 FROM services LIMIT 0");
    await runtime.query("BEGIN");
    await runtime.query(
      "INSERT INTO users(email,name,roles) VALUES($1,'Runtime test',ARRAY['patient'])",
      [`${role}@test.invalid`],
    );
    await runtime.query("ROLLBACK");
    for (const sql of [
      `CREATE TABLE public.${role}(id integer)`,
      "TRUNCATE users",
      "SELECT * FROM schema_migrations",
      "UPDATE clinical_notes SET body=body WHERE false",
      "DELETE FROM audit_events WHERE false",
      "DELETE FROM ledger_entries WHERE false",
      "UPDATE stock_movements SET reason='changed' WHERE false",
      "DELETE FROM supply_documents WHERE false",
      "DELETE FROM supplier_payments WHERE false",
      "DELETE FROM shop_invoices WHERE false",
    ]) {
      await assert.rejects(runtime.query(sql), { code: "42501" });
    }
  } finally {
    await runtime.end();
    await admin.query(`DROP OWNED BY "${role}"`);
    await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
});
