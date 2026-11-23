import { Pool, type PoolClient, type QueryResultRow } from "pg";
const globalDb = globalThis as unknown as { incysPool?: Pool };
export const pool =
  globalDb.incysPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    application_name: "incys-platform",
  });
globalDb.incysPool = pool;
export type DB = Pick<PoolClient, "query">;
export async function rows<T extends QueryResultRow = Record<string, any>>(
  sql: string,
  params: unknown[] = [],
  db: DB = pool,
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
export async function one<T extends QueryResultRow = Record<string, any>>(
  sql: string,
  params: unknown[] = [],
  db: DB = pool,
): Promise<T | undefined> {
  return (await rows<T>(sql, params, db))[0];
}
export async function transaction<T>(
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function audit(
  db: DB,
  actor: string,
  action: string,
  resourceId: string,
  details: object = {},
) {
  await db.query(
    "INSERT INTO audit_events(actor_id, action, resource_id, details) VALUES ($1,$2,$3,$4)",
    [actor, action, resourceId, details],
  );
}
export async function emit(
  db: DB,
  type: string,
  resourceId: string,
  userId?: string,
) {
  await db.query(
    "INSERT INTO outbox(event_type, aggregate_id, payload) VALUES ($1,$2,$3)",
    [type, resourceId, { resourceId, userId }],
  );
}
