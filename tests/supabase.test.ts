import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { Pool } from "pg";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { verifiedSupabaseClaims } from "../server/supabase-auth";
import { authorizedWorkerRequest } from "../server/job-auth";
import { pool } from "../server/db";
after(() => pool.end());

test("Supabase identity requires a valid signature, issuer, audience, expiry and session", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256" }],
  });
  const issuer = "https://project.test.invalid/auth/v1";
  const claims = { sub: randomUUID(), session_id: randomUUID(), aal: "aal2" };
  const sign = (
    payload: object,
    iss = issuer,
    aud = "authenticated",
    exp = Math.floor(Date.now() / 1000) + 60,
  ) =>
    new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(iss)
      .setAudience(aud)
      .setExpirationTime(exp)
      .sign(privateKey);
  const token = await sign(claims);
  assert.equal((await verifiedSupabaseClaims(token, issuer, jwks)).aal, "aal2");
  const parts = token.split(".");
  parts[1] = Buffer.from(
    JSON.stringify({ ...claims, sub: randomUUID() }),
  ).toString("base64url");
  for (const invalid of [
    parts.join("."),
    await sign(claims, "https://wrong.invalid"),
    await sign(claims, issuer, "anon"),
    await sign(claims, issuer, "authenticated", 1),
    await sign({ sub: claims.sub, aal: "aal2" }),
    await sign({ ...claims, aal: "admin" }),
  ]) {
    await assert.rejects(
      () => verifiedSupabaseClaims(invalid, issuer, jwks),
      /session has expired/,
    );
  }
});

test("scheduled work requires the exact secret and never accepts anonymous jobs", () => {
  const old = process.env.WORKER_TOKEN;
  try {
    delete process.env.WORKER_TOKEN;
    assert.equal(
      authorizedWorkerRequest(new Request("https://app.test.invalid")),
      false,
    );
    process.env.WORKER_TOKEN = randomBytes(32).toString("hex");
    const request = (token: string) =>
      new Request("https://app.test.invalid", {
        headers: { Authorization: `Bearer ${token}` },
      });
    assert.equal(
      authorizedWorkerRequest(request(process.env.WORKER_TOKEN)),
      true,
    );
    assert.equal(authorizedWorkerRequest(request("wrong")), false);
  } finally {
    if (old === undefined) delete process.env.WORKER_TOKEN;
    else process.env.WORKER_TOKEN = old;
  }
});

test("private Supabase schema blocks browser roles and verifies live identity sessions without exposing auth tables", async () => {
  const source = new URL(process.env.DATABASE_URL!);
  assert.match(source.pathname, /_test$/);
  const admin = new Pool({ connectionString: source.toString() });
  const role = `incys_supabase_test_${randomBytes(5).toString("hex")}`;
  const runtimeUrl = new URL(source);
  runtimeUrl.username = role;
  runtimeUrl.password = randomBytes(32).toString("hex");
  const runtime = new Pool({ connectionString: runtimeUrl.toString() });
  const createdRoles: string[] = [];
  let ownSchemas = false;
  try {
    assert.equal(
      (
        await admin.query(
          "SELECT 1 FROM pg_namespace WHERE nspname IN ('incys','auth')",
        )
      ).rowCount,
      0,
      "Private test schemas must not already exist",
    );
    await admin.query(
      "CREATE SCHEMA auth; CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz)",
    );
    ownSchemas = true;
    for (const r of ["anon", "authenticated", "service_role"]) {
      if (
        !(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [r]))
          .rowCount
      ) {
        await admin.query(`CREATE ROLE "${r}" NOLOGIN`);
        createdRoles.push(r);
      }
    }
    const env = {
      ...process.env,
      AUTH_MODE: "supabase",
      DATABASE_SCHEMA: "incys",
      RUNTIME_DATABASE_URL: runtimeUrl.toString(),
    };
    for (const script of ["migrate", "provision-runtime-db"])
      await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", `scripts/${script}.ts`],
        { env },
      );
    await runtime.query("SELECT 1 FROM incys.services LIMIT 0");
    // An accidental browser grant must not expose business rows through the Data API.
    await admin.query(
      "INSERT INTO incys.users(email,name) VALUES('rls-probe@example.invalid','RLS probe')",
    );
    await admin.query(
      "GRANT USAGE ON SCHEMA incys TO anon; GRANT SELECT ON incys.users TO anon",
    );
    await admin.query("SET ROLE anon");
    assert.equal((await admin.query("SELECT id FROM incys.users")).rowCount, 0);
    await admin.query("RESET ROLE");
    await admin.query(
      "REVOKE USAGE ON SCHEMA incys FROM anon; REVOKE SELECT ON incys.users FROM anon",
    );
    assert.equal(
      (await runtime.query("SELECT id FROM incys.users")).rowCount,
      1,
    );
    await assert.rejects(runtime.query("SELECT * FROM auth.sessions"), {
      code: "42501",
    });
    for (const r of ["anon", "authenticated", "service_role"]) {
      assert.equal(
        (
          await admin.query(
            "SELECT has_schema_privilege($1,'incys','USAGE') AS permitted",
            [r],
          )
        ).rows[0].permitted,
        false,
      );
      assert.equal(
        (
          await admin.query(
            "SELECT has_function_privilege($1,'incys.is_supabase_session_active(uuid,uuid)','EXECUTE') AS permitted",
            [r],
          )
        ).rows[0].permitted,
        false,
      );
    }
    const uid = randomUUID(),
      session = randomUUID();
    await admin.query(
      "INSERT INTO auth.sessions VALUES($1,$2,now()+interval '1 hour')",
      [session, uid],
    );
    const active = async (userId = uid) =>
      (
        await runtime.query(
          "SELECT incys.is_supabase_session_active($1,$2) AS active",
          [userId, session],
        )
      ).rows[0].active;
    assert.equal(await active(), true);
    assert.equal(await active(randomUUID()), false);
    await admin.query(
      "UPDATE auth.sessions SET not_after=now()-interval '1 minute'",
    );
    assert.equal(await active(), false);
    await admin.query("DELETE FROM auth.sessions");
    assert.equal(await active(), false);
  } finally {
    await runtime.end();
    if (
      (await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]))
        .rowCount
    ) {
      await admin.query(`DROP OWNED BY "${role}"`);
      await admin.query(`DROP ROLE "${role}"`);
    }
    if (ownSchemas)
      await admin.query(
        "DROP SCHEMA IF EXISTS incys CASCADE; DROP SCHEMA auth CASCADE",
      );
    for (const r of createdRoles) await admin.query(`DROP ROLE "${r}"`);
    await admin.end();
  }
});
