import { runWorker } from "../server/worker";
import { pool } from "../server/db";
try {
  console.log(JSON.stringify(await runWorker()));
} finally {
  await pool.end();
}
