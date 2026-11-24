import { z } from "zod";
import { one, rows, pool, transaction, audit, emit } from "./db";
import { User, has, allow, isDemo } from "./auth";
import { requireThat } from "./errors";
export async function requestRefund(user: User, input: unknown) {
  const d = z
    .object({
      paymentId: z.string().uuid(),
      reason: z.string().min(5).max(2000),
    })
    .parse(input);
  return transaction(async (db) => {
    const p = await one(
      "SELECT * FROM payments WHERE id=$1 AND status='captured' FOR UPDATE",
      [d.paymentId],
      db,
    );
    requireThat(
      p && (p.user_id === user.id || has(user, "admin", "finance")),
      403,
      "A captured payment is required.",
    );
    const r = await one(
      "INSERT INTO refund_requests(payment_id,requested_by,reason) VALUES($1,$2,$3) RETURNING *",
      [p.id, user.id, d.reason],
      db,
    );
    await audit(db, user.id, "refund.requested", r!.id);
    return r;
  });
}
export async function approveRefund(user: User, id: string) {
  allow(user, "admin", "finance");
  const result = await transaction(async (db) => {
    const r = await one(
      "SELECT r.*,p.provider_payment_id,p.amount_paise FROM refund_requests r JOIN payments p ON p.id=r.payment_id WHERE r.id=$1 FOR UPDATE OF r",
      [id],
      db,
    );
    requireThat(r, 404, "Refund request not found.");
    requireThat(
      r.requested_by !== user.id,
      403,
      "A different staff member must approve this refund.",
    );
    if (r.status === "provider_pending" || r.status === "processed") return r;
    requireThat(
      ["requested", "approved"].includes(r.status),
      409,
      "Refund is not pending approval.",
    );
    if (isDemo()) {
      await db.query(
        "UPDATE refund_requests SET status='approved',approved_by=$1 WHERE id=$2",
        [user.id, id],
      );
      return r;
    }
    requireThat(
      process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
      503,
      "Payment provider is not configured.",
    );
    // Persist approval before the external call; a failed/uncertain call stays approved for manual provider reconciliation.
    await db.query(
      "UPDATE refund_requests SET status='approved',approved_by=$1 WHERE id=$2",
      [user.id, id],
    );
    await audit(db, user.id, "refund.approved", id);
    return r;
  });
  if (result.status === "processed" || result.status === "provider_pending")
    return result;
  if (isDemo()) return processRefund(id, `demo-refund-${id}`);
  // Do not retry an ambiguous provider request automatically: reconciliation is required first.
  requireThat(
    result.status === "requested",
    409,
    "This refund was already approved. Reconcile with the payment provider before retrying.",
  );
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(result.provider_payment_id)}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: result.amount_paise,
        receipt: id,
        notes: { refund_request_id: id },
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  requireThat(
    response.ok,
    502,
    "Refund request requires reconciliation with the payment provider.",
  );
  const r = await response.json();
  await pool.query(
    "UPDATE refund_requests SET status='provider_pending',provider_refund_id=$1 WHERE id=$2 AND status='approved'",
    [r.id, id],
  );
  if (r.status === "processed") return processRefund(id, r.id);
  return { pending: true };
}
export async function processRefund(id: string, providerRefundId: string) {
  return transaction(async (db) => {
    const r = await one(
      "SELECT * FROM refund_requests WHERE id=$1 FOR UPDATE",
      [id],
      db,
    );
    requireThat(r, 404, "Refund request not found.");
    if (r.status === "processed") return { duplicate: true };
    requireThat(
      ["approved", "provider_pending"].includes(r.status),
      409,
      "Refund was not approved.",
    );
    const p = await one(
      "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
      [r.payment_id],
      db,
    );
    requireThat(p?.status === "captured", 409, "Payment is not captured.");
    for (const l of await rows(
      "SELECT * FROM ledger_entries WHERE payment_id=$1",
      [p.id],
      db,
    ))
      await db.query(
        "INSERT INTO ledger_entries(payment_id,account,amount_paise,reference_id) VALUES($1,$2,$3,$4)",
        [p.id, `refund:${l.account}`, -l.amount_paise, l.reference_id],
      );
    if (p.reconciliation_reason) {
      // This receipt was never allocated to a purchase. Its reversal must not
      // restore inventory or deduct fees a second time.
    } else if (p.reference_type === "order") {
      await creditInvoice(db, p.reference_id, r.id);
      await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [
        p.reference_id,
      ]);
      // Only unsent stock can be returned automatically. Shipped returns require warehouse inspection.
      const items = await rows(
        "SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id FOR UPDATE",
        [p.reference_id],
        db,
      );
      for (const i of items)
        if (["pending", "accepted"].includes(i.status))
          await recordStock(
            db,
            i.product_id,
            i.quantity,
            "release",
            `refund:${r.id}`,
            "Unsent order refunded",
          );
      await db.query(
        "UPDATE order_items SET status='refunded' WHERE order_id=$1",
        [p.reference_id],
      );
    } else if (p.reference_type === "appointment")
      await db.query(
        "UPDATE appointments SET payment_status='refunded' WHERE id=$1",
        [p.reference_id],
      );
    else
      await db.query(
        "UPDATE enrolments SET paid_paise=paid_paise-$1,status=CASE WHEN status='completed' THEN status ELSE 'withdrawn' END WHERE id=$2",
        [p.amount_paise, p.reference_id],
      );
    await db.query("UPDATE payments SET status='refunded' WHERE id=$1", [p.id]);
    await db.query(
      "UPDATE refund_requests SET status='processed',processed_at=now(),provider_refund_id=$1 WHERE id=$2",
      [providerRefundId, id],
    );
    await audit(db, r.approved_by, "refund.processed", id, {
      amount: p.amount_paise,
    });
    await emit(db, "RefundProcessed", id, p.user_id);
    return { refunded: true };
  });
}
import { creditInvoice, recordStock } from "./shop";
