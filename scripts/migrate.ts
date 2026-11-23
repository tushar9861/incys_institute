import { readFile, readdir } from "node:fs/promises";
import { pool } from "../server/db";
const db = await pool.connect();
try {
  // Serialize manual and scheduled migration runs on one dedicated connection.
  await db.query(
    "SELECT pg_advisory_lock(hashtextextended('incys-schema-migrations',0))",
  );
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("database"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (
        await db.query("SELECT name FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    await db.query("BEGIN");
    try {
      await db.query(await readFile(`database/${name}`, "utf8"));
      await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    console.log(`Applied ${name}`);
  }
} finally {
  await db.query(
    "SELECT pg_advisory_unlock(hashtextextended('incys-schema-migrations',0))",
  );
  db.release();
  await pool.end();
}
