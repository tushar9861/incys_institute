import { one, pool, transaction, audit } from "../server/db";
import { readPrivateFile } from "../server/private-storage";
import { clamCommand, freshSignatures } from "../services/scanner/protocol.mjs";
// Operator-run finite job. Quarantined files are never returned to app clients.
const options = {
  host: process.env.CLAMAV_HOST || "127.0.0.1",
  port: Number(process.env.CLAMAV_PORT || 3310),
};
let clean = 0,
  rejected = 0;
try {
  if (!freshSignatures(await clamCommand("VERSION", undefined, options)))
    throw new Error("Scanner signatures require an update.");
  for (let i = 0; i < 20; i++) {
    const processed = await transaction(async (db) => {
      const doc = await one(
        "SELECT * FROM documents WHERE state='quarantined' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        [],
        db,
      );
      if (!doc) return false;
      const bytes = await readPrivateFile(doc.storage_key);
      if (bytes.length !== doc.size_bytes || bytes.length > 10 * 1024 * 1024)
        throw new Error("Stored file size differs from its upload record.");
      const verdict = await clamCommand("INSTREAM", bytes, options);
      const state =
        verdict === "stream: OK"
          ? "clean"
          : /^stream: .+ FOUND$/.test(verdict)
            ? "rejected"
            : null;
      if (!state)
        throw new Error(
          "Scanner did not return a valid verdict; file remains quarantined.",
        );
      await db.query("UPDATE documents SET state=$1 WHERE id=$2", [
        state,
        doc.id,
      ]);
      await audit(db, null, `document.scan.${state}`, doc.id, {
        processor: "operator-scanner",
      });
      if (state === "clean") clean++;
      else rejected++;
      return true;
    });
    if (!processed) break;
  }
  console.log(JSON.stringify({ clean, rejected }));
} finally {
  await pool.end();
}
