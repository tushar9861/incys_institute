import assert from "node:assert/strict";
const base = (
  process.env.INCYS_BASE_URL || "https://incys-institute.web.app"
).replace(/\/$/, "");
assert.equal(new URL(base).protocol, "https:", "Live checks require HTTPS.");
const checks = [];
async function get(path, status = 200) {
  const r = await fetch(base + path, {
    signal: AbortSignal.timeout(90000),
    redirect: "error",
  });
  assert.equal(r.status, status, path);
  return r;
}
const health = await (await get("/api/v1/health")).json();
assert.equal(health.status, "ok");
checks.push("Database readiness");
const config = await (await get("/api/v1/config")).json();
assert.equal(config.demo, false);
assert.ok(["firebase", "supabase"].includes(config.authMode));
checks.push(`${config.authMode} auth and demo capture disabled`);
await get("/");
await get("/login");
await get("/api/v1/workspace", 401);
checks.push("Website routing and unauthenticated data isolation");
const catalogue = await (await get("/api/v1/catalog")).json();
assert.ok(
  Array.isArray(catalogue.courses) && Array.isArray(catalogue.services),
);
checks.push("Database-backed public catalogue");
const denied = await fetch(base + "/api/v1/enquiries", {
  method: "POST",
  headers: {
    Origin: "https://untrusted.invalid",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(denied.status, 403);
checks.push("Cross-origin mutation rejected");
// An optional short-lived end-user token exercises identity validation and reads only.
if (process.env.INCYS_TEST_ID_TOKEN) {
  const r = await fetch(base + "/api/v1/workspace", {
    headers: { Authorization: `Bearer ${process.env.INCYS_TEST_ID_TOKEN}` },
    signal: AbortSignal.timeout(90000),
  });
  assert.equal(r.status, 200, "Authenticated workspace");
  const data = await r.json();
  assert.ok(data.user.id && Array.isArray(data.user.roles));
  checks.push("Verified identity and scoped database workspace");
}
console.log(
  JSON.stringify(
    {
      base,
      passed: checks,
      limits:
        "Read-only smoke checks. Booking/payment/upload/assessment acceptance needs designated test accounts and configured providers.",
    },
    null,
    2,
  ),
);
