import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { rows, one, pool, transaction, audit, emit, type DB } from "./db";
import { type User, has, allow, isDemo } from "./auth";
import { requireThat, AppError } from "./errors";
import { processRefund } from "./refunds";
const uuid = z.string().uuid();
export async function placeOrder(user: User, input: unknown) {
  const d = z
    .object({
      items: z
        .array(
          z.object({
            productId: uuid,
            quantity: z.number().int().min(1).max(20),
          }),
        )
        .min(1)
        .max(30),
      address: z.object({
        name: z.string().min(2).max(100),
        phone: z.string().regex(/^[+0-9 ()-]{8,20}$/),
        line: z.string().min(5).max(300),
        city: z.string().min(2).max(100),
        postcode: z.string().regex(/^[0-9]{6}$/),
      }),
      idempotencyKey: z.string().min(16).max(100),
    })
    .parse(input);
  requireThat(
    new Set(d.items.map((i) => i.productId)).size === d.items.length,
    400,
    "Combine duplicate products in your cart.",
  );
  return transaction(async (db) => {
    // Same customer/key is serialized even before an order row exists.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${user.id}:${d.idempotencyKey}`,
    ]);
    const existing = await one(
      "SELECT * FROM orders WHERE customer_id=$1 AND idempotency_key=$2",
      [user.id, d.idempotencyKey],
      db,
    );
    if (existing) return existing;
    let total = 0;
    const items = [];
    for (const i of [...d.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const p = await one(
        `SELECT p.*,v.commission_bps FROM products p JOIN vendors v ON v.id=p.vendor_id
        WHERE p.id=$1 AND p.status='approved' AND v.status='approved' AND (p.expires_on IS NULL OR p.expires_on>current_date) FOR UPDATE OF p`,
        [i.productId],
        db,
      );
      requireThat(p, 409, "A product is no longer available.");
      requireThat(
        p.stock >= i.quantity,
        409,
        `Insufficient stock for ${p.name}.`,
      );
      const value = p.price_paise * i.quantity;
      total += value;
      requireThat(
        Number.isSafeInteger(total) && total <= 100000000,
        400,
        "Order value exceeds the supported limit.",
      );
      items.push({
        p,
        quantity: i.quantity,
        commission: Math.round((value * p.commission_bps) / 10000),
      });
    }
    const order = await one(
      "INSERT INTO orders(customer_id,total_paise,address,idempotency_key) VALUES($1,$2,$3,$4) RETURNING *",
      [user.id, total, d.address, d.idempotencyKey],
      db,
    );
    for (const { p, quantity, commission } of items) {
      await db.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [
        quantity,
        p.id,
      ]);
      await db.query(
        "INSERT INTO order_items(order_id,product_id,vendor_id,product_name,quantity,unit_paise,commission_paise) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          order!.id,
          p.id,
          p.vendor_id,
          p.name,
          quantity,
          p.price_paise,
          commission,
        ],
      );
    }
    await audit(db, user.id, "order.created", order!.id);
    await emit(db, "OrderCreated", order!.id, user.id);
    return order;
  });
}
export async function orderList(user: User) {
  const admin = has(user, "admin", "finance");
  const vendor = has(user, "vendor") && !admin;
  if (vendor)
    return rows(
      `SELECT i.*,o.created_at,o.status AS order_status,
    CASE WHEN o.status IN ('paid','processing','completed') THEN o.address ELSE NULL END AS address
    FROM order_items i JOIN orders o ON o.id=i.order_id JOIN vendors v ON v.id=i.vendor_id WHERE v.owner_id=$1 ORDER BY o.created_at DESC LIMIT 200`,
      [user.id],
    );
  const orders = await rows(
    `SELECT o.*,u.name AS customer_name FROM orders o JOIN users u ON u.id=o.customer_id ${admin ? "" : "WHERE o.customer_id=$1"} ORDER BY o.created_at DESC LIMIT 200`,
    admin ? [] : [user.id],
  );
  for (const o of orders)
    o.items = await rows("SELECT * FROM order_items WHERE order_id=$1", [o.id]);
  return orders;
}
export async function fulfillItem(user: User, id: string, input: unknown) {
  allow(user, "vendor", "admin");
  const d = z
    .object({
      status: z.enum(["accepted", "shipped", "delivered"]),
      trackingReference: z.string().max(200).optional(),
    })
    .parse(input);
  return transaction(async (db) => {
    const i = await one(
      "SELECT i.*,v.owner_id,o.status AS order_status FROM order_items i JOIN vendors v ON v.id=i.vendor_id JOIN orders o ON o.id=i.order_id WHERE i.id=$1 FOR UPDATE OF i,o",
      [id],
      db,
    );
    requireThat(
      i && (has(user, "admin") || i.owner_id === user.id),
      403,
      "You cannot fulfil this order item.",
    );
    requireThat(
      ["paid", "processing"].includes(i.order_status),
      409,
      "Payment must be captured before fulfilment.",
    );
    const next: Record<string, string> = {
      pending: "accepted",
      accepted: "shipped",
      shipped: "delivered",
    };
    requireThat(
      next[i.status] === d.status,
      409,
      "Invalid fulfilment transition.",
    );
    requireThat(
      d.status !== "shipped" || d.trackingReference,
      400,
      "A tracking reference is required.",
    );
    await db.query(
      "UPDATE order_items SET status=$1,tracking_reference=COALESCE($2,tracking_reference) WHERE id=$3",
      [d.status, d.trackingReference || null, id],
    );
    const remaining = await one(
      "SELECT count(*)::int AS n FROM order_items WHERE order_id=$1 AND status<>'delivered'",
      [i.order_id],
      db,
    );
    await db.query("UPDATE orders SET status=$1 WHERE id=$2", [
      remaining!.n === 0 ? "completed" : "processing",
      i.order_id,
    ]);
    await audit(db, user.id, `order_item.${d.status}`, id);
    return { updated: true };
  });
}
export async function cancelOrder(user: User, id: string) {
  return transaction(async (db) => {
    const o = await one(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [id],
      db,
    );
    requireThat(
      o && (o.customer_id === user.id || has(user, "admin")),
      403,
      "You cannot cancel this order.",
    );
    requireThat(
      o.status === "pending_payment",
      409,
      "Paid orders require a refund workflow.",
    );
    await releaseStock(db, id);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [id]);
    await audit(db, user.id, "order.cancelled", id);
    return { cancelled: true };
  });
}
export async function releaseStock(db: DB, id: string) {
  const items = await rows(
    "SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id",
    [id],
    db,
  );
  for (const i of items)
    await db.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
      i.quantity,
      i.product_id,
    ]);
  await db.query(
    "UPDATE order_items SET status='cancelled' WHERE order_id=$1",
    [id],
  );
}
export async function createPayment(
  user: User,
  input: unknown,
): Promise<Record<string, any>> {
  const d = z
    .object({
      referenceType: z.enum(["order", "appointment", "enrolment"]),
      referenceId: uuid,
    })
    .parse(input);
  let payment = await transaction(async (db) => {
    const table = {
      order: "orders",
      appointment: "appointments",
      enrolment: "enrolments",
    }[d.referenceType];
    const r = await one(
      `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,
      [d.referenceId],
      db,
    );
    requireThat(
      r && [r.customer_id, r.patient_id, r.student_id].includes(user.id),
      403,
      "You cannot pay for this record.",
    );
    let amount = 0;
    if (d.referenceType === "order") {
      requireThat(
        r.status === "pending_payment" &&
          new Date(r.expires_at).getTime() > Date.now(),
        409,
        "Order is paid, cancelled, or expired.",
      );
      amount = r.total_paise;
    }
    if (d.referenceType === "appointment") {
      requireThat(
        r.status === "confirmed" && r.payment_status === "due",
        409,
        "This appointment does not have an outstanding payment.",
      );
      amount = r.price_paise;
    }
    if (d.referenceType === "enrolment") {
      requireThat(
        ["applied", "active"].includes(r.status),
        409,
        "This enrolment cannot accept payment.",
      );
      amount = r.fee_paise - r.paid_paise;
    }
    requireThat(amount > 0, 409, "There is no outstanding balance.");
    const existing = await one(
      "SELECT * FROM payments WHERE reference_type=$1 AND reference_id=$2 AND status='created' ORDER BY created_at DESC LIMIT 1",
      [d.referenceType, d.referenceId],
      db,
    );
    if (existing) return existing;
    return (await one(
      "INSERT INTO payments(user_id,reference_type,reference_id,amount_paise) VALUES($1,$2,$3,$4) RETURNING *",
      [user.id, d.referenceType, d.referenceId, amount],
      db,
    ))!;
  });
  if (isDemo()) return { ...payment, mode: "demo" };
  requireThat(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
    503,
    "Online payments are not configured. Please contact the institute.",
  );
  // A per-payment lock prevents concurrent checkout requests from creating multiple provider orders.
  payment = await transaction(async (db) => {
    const p = (await one(
      "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
      [payment.id],
      db,
    ))!;
    if (p.provider_order_id) return p;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: p.amount_paise,
        currency: "INR",
        receipt: p.id,
      }),
      signal: AbortSignal.timeout(12000),
    });
    requireThat(
      response.ok,
      502,
      "The payment provider could not create checkout. Please try again.",
    );
    const provider = await response.json();
    return (await one(
      "UPDATE payments SET provider_order_id=$1 WHERE id=$2 RETURNING *",
      [provider.id, p.id],
      db,
    ))!;
  });
  return { ...payment, mode: "razorpay", keyId: process.env.RAZORPAY_KEY_ID };
}
export async function capturePayment(
  paymentId: string,
  eventId: string,
  providerPaymentId: string,
  amount: number,
  currency: string,
) {
  return transaction(async (db) => {
    const p = await one(
      "SELECT * FROM payments WHERE id=$1 FOR UPDATE",
      [paymentId],
      db,
    );
    requireThat(p, 404, "Payment not found.");
    requireThat(
      p.amount_paise === amount && p.currency === currency,
      400,
      "Payment amount or currency mismatch.",
    );
    if (
      await one(
        "SELECT event_id FROM payment_events WHERE event_id=$1",
        [eventId],
        db,
      )
    )
      return { duplicate: true };
    await db.query(
      "INSERT INTO payment_events(event_id,payment_id) VALUES($1,$2)",
      [eventId, p.id],
    );
    if (p.status === "captured") return { duplicate: true };
    requireThat(p.status === "created", 409, "Payment is already closed.");
    const table = {
      order: "orders",
      appointment: "appointments",
      enrolment: "enrolments",
    }[p.reference_type as "order" | "appointment" | "enrolment"];
    const r = await one(
      `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,
      [p.reference_id],
      db,
    );
    requireThat(r, 409, "Payment reference is missing.");
    const allocatable =
      p.reference_type === "order"
        ? r.status === "pending_payment"
        : p.reference_type === "appointment"
          ? r.status === "confirmed" && r.payment_status === "due"
          : ["active", "applied"].includes(r.status) &&
            r.paid_paise + amount <= r.fee_paise;
    if (!allocatable) {
      // Money can arrive after cancellation. Record it durably without fulfilling
      // the cancelled item or reserving stock again; finance can refund it.
      const reason =
        "Captured after the reference became unavailable. Review and refund this unapplied receipt.";
      await db.query(
        "INSERT INTO ledger_entries(payment_id,account,amount_paise,reference_id) VALUES($1,$2,$3,$4),($1,$5,$6,$4)",
        [
          p.id,
          "gateway_receivable",
          amount,
          p.reference_id,
          "unapplied_receipts",
          -amount,
        ],
      );
      await db.query(
        "UPDATE payments SET status='captured',provider_payment_id=$1,reconciliation_reason=$2 WHERE id=$3",
        [providerPaymentId, reason, p.id],
      );
      await audit(db, p.user_id, "payment.reconciliation_required", p.id, {
        amount,
        currency,
      });
      await emit(db, "PaymentReconciliationRequired", p.id, p.user_id);
      return { captured: true, needsReview: true };
    }
    if (p.reference_type === "order") {
      requireThat(
        r.status === "pending_payment",
        409,
        "Order is no longer payable; finance must reconcile and refund this capture.",
      );
      await db.query("UPDATE orders SET status='paid' WHERE id=$1", [r.id]);
      const items = await rows(
        "SELECT * FROM order_items WHERE order_id=$1",
        [r.id],
        db,
      );
      const commission = items.reduce((a, i) => a + i.commission_paise, 0);
      await db.query(
        "INSERT INTO ledger_entries(payment_id,account,amount_paise,reference_id) VALUES($1,$2,$3,$4)",
        [p.id, "institute_commission", -commission, r.id],
      );
      for (const i of items)
        await db.query(
          "INSERT INTO ledger_entries(payment_id,account,amount_paise,reference_id) VALUES($1,$2,$3,$4)",
          [
            p.id,
            `vendor_payable:${i.vendor_id}`,
            -(i.unit_paise * i.quantity - i.commission_paise),
            i.id,
          ],
        );
    } else {
      if (p.reference_type === "appointment") {
        requireThat(
          r.status === "confirmed" && r.payment_status === "due",
          409,
          "Appointment cannot be fulfilled; finance reconciliation required.",
        );
        await db.query(
          "UPDATE appointments SET payment_status='paid' WHERE id=$1",
          [r.id],
        );
      } else {
        requireThat(
          ["active", "applied"].includes(r.status) &&
            r.paid_paise + amount <= r.fee_paise,
          409,
          "Fee payment cannot be allocated.",
        );
        await db.query(
          "UPDATE enrolments SET paid_paise=paid_paise+$1 WHERE id=$2",
          [amount, r.id],
        );
      }
      await db.query(
        "INSERT INTO ledger_entries(payment_id,account,amount_paise,reference_id) VALUES($1,$2,$3,$4)",
        [p.id, `${p.reference_type}_revenue`, -amount, r.id],
      );
    }
    await db.query(
      "INSERT INTO ledger_entries(payment_id,account,amount_paise,reference_id) VALUES($1,$2,$3,$4)",
      [p.id, "gateway_receivable", amount, p.reference_id],
    );
    await db.query(
      "UPDATE payments SET status='captured',provider_payment_id=$1 WHERE id=$2",
      [providerPaymentId, p.id],
    );
    await audit(db, p.user_id, "payment.captured", p.id, { amount, currency });
    await emit(db, "PaymentCaptured", p.id, p.user_id);
    return { captured: true };
  });
}
export async function paymentWebhook(
  raw: string,
  signature: string | null,
  eventId: string | null,
) {
  requireThat(
    process.env.RAZORPAY_WEBHOOK_SECRET,
    503,
    "Webhook is not configured.",
  );
  requireThat(
    signature && /^[a-f0-9]{64}$/i.test(signature),
    401,
    "Invalid webhook signature.",
  );
  const expected = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw)
    .digest();
  requireThat(
    timingSafeEqual(Buffer.from(signature, "hex"), expected),
    401,
    "Invalid webhook signature.",
  );
  const event = JSON.parse(raw);
  if (event.event === "refund.processed") {
    const refund = event.payload?.refund?.entity;
    requireThat(refund?.id && refund?.payment_id, 400, "Invalid refund event.");
    const r = await one(
      "SELECT r.*,p.provider_payment_id,p.amount_paise FROM refund_requests r JOIN payments p ON p.id=r.payment_id WHERE r.provider_refund_id=$1 OR r.id::text=$2",
      [refund.id, refund.notes?.refund_request_id || ""],
    );
    requireThat(
      r &&
        r.provider_payment_id === refund.payment_id &&
        r.amount_paise === refund.amount,
      400,
      "Unrecognized refund or amount mismatch.",
    );
    return processRefund(r.id, refund.id);
  }
  if (event.event !== "payment.captured") return { ignored: true };
  const p = event.payload?.payment?.entity;
  requireThat(
    p && eventId && p.status === "captured",
    400,
    "Invalid capture event.",
  );
  const stored = await one(
    "SELECT * FROM payments WHERE provider_order_id=$1",
    [p.order_id],
  );
  requireThat(stored, 404, "Unrecognized provider order.");
  return capturePayment(stored.id, eventId, p.id, p.amount, p.currency);
}
