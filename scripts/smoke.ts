import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const port = 4379,
  base = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "ignore",
  },
);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/v1/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, "Production server must become healthy.");
  for (const path of [
    "/",
    "/care",
    "/learn",
    "/shop",
    "/account",
    "/login",
    "/portal/student",
    "/verify/invalid",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/animations/breathe.json",
    "/.well-known/assetlinks.json",
    "/offline.html",
    "/sw.js",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get("x-content-type-options") || "", /nosniff/);
  }
  const config = await (await fetch(`${base}/api/v1/config`)).json();
  assert.equal(config.demo, false);
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "patient@demo.incys.local",
      password: "local-demo-only-change-me",
    }),
  });
  assert.equal(login.status, 403, "Production must disable local accounts.");
  const catalog = await (await fetch(`${base}/api/v1/catalog`)).json();
  assert.ok(Array.isArray(catalog.courses));
  console.log(
    "Production HTTP smoke checks passed: pages, headers, database, catalogue and demo-auth lockout.",
  );
} finally {
  child.kill("SIGTERM");
}
