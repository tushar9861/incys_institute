import { Pool } from "pg";
import { spawn } from "node:child_process";
const source = new URL(process.env.DATABASE_URL!);
// URL.origin excludes credentials for database URLs on some Node versions; preserve them explicitly.
const target = new URL(
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL!,
);
if (!process.env.TEST_DATABASE_URL) target.pathname = `${source.pathname}_test`;
if (!/^\/[a-zA-Z0-9_]+_test$/.test(target.pathname))
  throw new Error(
    "TEST_DATABASE_URL must name a dedicated database ending in _test.",
  );
const admin = new URL(target);
admin.pathname = "/postgres";
const pool = new Pool({ connectionString: admin.toString() });
const name = target.pathname.slice(1);
if (
  !(
    await pool.query("SELECT datname FROM pg_database WHERE datname=$1", [name])
  ).rowCount
)
  await pool.query(`CREATE DATABASE "${name}"`);
await pool.end();
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: target.toString(),
  NODE_ENV: "test",
  AUTH_MODE: "local",
  DEMO_MODE: "true",
};
async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, ["--import", "tsx", ...args], {
      stdio: "inherit",
      env,
    });
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error(`Test command exited ${c}`)),
    );
  });
}
await run(["scripts/migrate.ts"]);
await run([
  "--test",
  "--test-concurrency=1",
  "tests/platform.test.ts",
  "tests/deployment.test.ts",
  "tests/supabase.test.ts",
  "tests/google-sign-in.test.ts",
  "tests/shop.test.ts",
]);
