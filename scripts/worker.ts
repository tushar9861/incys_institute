import { one, rows, pool, transaction, audit } from "../server/db";
import { releaseStock } from "../server/commerce";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
// Finite, idempotent job. Invoke via Cloud Scheduler -> Cloud Run Jobs.
// Pending events remain durable in PostgreSQL until processing commits.
let processed = 0,
  expired = 0;
for (let i = 0; i < 100; i++) {
  const result = await transaction(async (db) => {
    const event = await one(
      "SELECT * FROM outbox WHERE published_at IS NULL AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      [],
      db,
    );
    if (!event) return null;
    if (
      !(await one(
        "SELECT event_id FROM event_inbox WHERE event_id=$1",
        [event.id],
        db,
      ))
    ) {
      if (event.payload.userId)
        await db.query(
          "INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)",
          [
            event.payload.userId,
            "An update from your institute",
            "There is an update in your account. Sign in to view the details.",
          ],
        );
      await db.query("INSERT INTO event_inbox(event_id) VALUES($1)", [
        event.id,
      ]);
    }
    await db.query(
      "UPDATE outbox SET published_at=now(),attempts=attempts+1 WHERE id=$1",
      [event.id],
    );
    return event;
  });
  if (!result) break;
  processed++;
  if (process.env.FIREBASE_PROJECT_ID && result.payload.userId) {
    if (!getApps().length)
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    const tokens = await rows(
      "SELECT token FROM device_tokens WHERE user_id=$1",
      [result.payload.userId],
    );
    if (tokens.length) {
      try {
        await getMessaging().sendEachForMulticast({
          tokens: tokens.map((t) => t.token).slice(0, 500),
          notification: {
            title: "INCYS account update",
            body: "Sign in to view your latest update.",
          },
          data: { eventId: result.id },
        });
      } catch {
        console.error(
          "Optional push delivery failed; in-app notification remains available.",
        );
      }
    }
  }
}
for (let i = 0; i < 100; i++) {
  const done = await transaction(async (db) => {
    const order = await one(
      "SELECT o.* FROM orders o WHERE o.status='pending_payment' AND o.expires_at<now() AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.reference_type='order' AND p.reference_id=o.id AND p.provider_order_id IS NOT NULL AND p.status='created') ORDER BY o.expires_at FOR UPDATE SKIP LOCKED LIMIT 1",
      [],
      db,
    );
    if (!order) return false;
    // Provider-backed pending payments are held for reconciliation to avoid releasing stock after a late capture.
    await releaseStock(db, order.id);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      order.id,
    ]);
    await audit(db, order.customer_id, "order.expired", order.id);
    return true;
  });
  if (!done) break;
  expired++;
}
await pool.query("DELETE FROM sessions WHERE expires_at<now()");
await pool.query("DELETE FROM rate_limits WHERE reset_at<now()");
console.log(JSON.stringify({ processed, expired }));
await pool.end();
