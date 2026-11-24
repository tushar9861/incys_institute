import { z } from "zod";
import { one, rows, transaction, audit, type DB } from "./db";
import { allow, has, type User } from "./auth";
import { requireThat } from "./errors";
import {
  financialYear,
  inclusiveTax,
  validGstin,
  validState,
} from "../lib/india";

const uuid = z.string().uuid();
const text = z.string().trim().min(2).max(200);
const optional = z.string().trim().max(300).default("");
const state = z.string().refine(validState, "Select a state.");
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
const pastDate = z.iso
  .date()
  .refine((d) => d <= today(), "Use today or an earlier date.");
const storedDate = (value: any) => new Date(value).toISOString().slice(0, 10);
const key = z.string().uuid();
const staff = (u: User) => has(u, "admin", "finance");

export async function addSupplier(user: User, input: unknown) {
  allow(user, "admin");
  const d = z
    .object({
      email: z.email().transform((v) => v.toLowerCase()),
      name: text,
      address: optional,
      gstin: z.string().trim().toUpperCase().default(""),
    })
    .parse(input);
  requireThat(
    !d.gstin || validGstin(d.gstin),
    400,
    "Check the supplier GSTIN.",
  );
  return transaction(async (db) => {
    const owner = await one(
      "SELECT id FROM users WHERE lower(email)=$1 AND active FOR UPDATE",
      [d.email],
      db,
    );
    requireThat(
      owner,
      409,
      "Ask this supplier to sign in to INCYS with this email first.",
    );
    requireThat(
      !(await one("SELECT id FROM vendors WHERE owner_id=$1", [owner.id], db)),
      409,
      "This account already has a supplier profile.",
    );
    const v = await one(
      "INSERT INTO vendors(owner_id,name,description,address,gstin) VALUES($1,$2,'Institute supplier',$3,$4) RETURNING *",
      [owner.id, d.name, d.address, d.gstin],
      db,
    );
    await db.query(
      "UPDATE users SET roles=array_append(roles,'vendor') WHERE id=$1 AND NOT ('vendor'=ANY(roles))",
      [owner.id],
    );
    await audit(db, user.id, "supplier.created", v!.id, { ownerId: owner.id });
    return v;
  });
}

export async function settings(db?: DB) {
  return (await one("SELECT * FROM shop_settings WHERE id=true", [], db))!;
}
export async function saveSettings(user: User, input: unknown) {
  allow(user, "admin", "finance");
  const d = z
    .object({
      legalName: text,
      address: z.string().trim().max(600),
      stateCode: z.string(),
      gstin: z.string().trim().toUpperCase().default(""),
      registration: z.enum(["pending", "non_gst", "regular", "composition"]),
      einvoice: z.enum(["unknown", "not_applicable", "required"]),
      signatory: optional,
    })
    .parse(input);
  requireThat(
    !d.stateCode || validState(d.stateCode),
    400,
    "Select a valid state.",
  );
  requireThat(
    !d.gstin || validGstin(d.gstin),
    400,
    "Check the GSTIN, including its check digit.",
  );
  if (["regular", "composition"].includes(d.registration))
    requireThat(
      d.gstin && d.gstin.slice(0, 2) === d.stateCode,
      400,
      "A valid GSTIN matching the registered state is required.",
    );
  if (d.registration === "non_gst")
    requireThat(
      !d.gstin,
      400,
      "Select a GST registration type when providing a GSTIN.",
    );
  return transaction(async (db) => {
    const result = await one(
      "UPDATE shop_settings SET legal_name=$1,address=$2,state_code=$3,gstin=$4,registration=$5,einvoice=$6,signatory=$7,updated_at=now() WHERE id=true RETURNING *",
      [
        d.legalName,
        d.address,
        d.stateCode,
        d.gstin,
        d.registration,
        d.einvoice,
        d.signatory,
      ],
      db,
    );
    await audit(db, user.id, "shop.settings_updated", "institute", {
      registration: d.registration,
    });
    return result;
  });
}
async function ownedProduct(user: User, id: string, db: DB) {
  const p = await one(
    "SELECT p.*,v.owner_id,v.status AS vendor_status FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.id=$1 FOR UPDATE OF p",
    [uuid.parse(id)],
    db,
  );
  requireThat(
    p && (staff(user) || p.owner_id === user.id),
    404,
    "Product not found.",
  );
  return p;
}
export async function recordStock(
  db: DB,
  productId: string,
  delta: number,
  kind: string,
  reference: string,
  reason: string,
  actor: string | null = null,
) {
  const p = await one(
    "UPDATE products SET stock=stock+$1 WHERE id=$2 AND stock+$1 BETWEEN 0 AND 1000000 RETURNING stock",
    [delta, productId],
    db,
  );
  requireThat(
    p,
    409,
    "Not enough available stock, or the stock limit would be exceeded.",
  );
  await db.query(
    "INSERT INTO stock_movements(product_id,delta,balance,kind,reference,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [productId, delta, p.stock, kind, reference, reason, actor],
  );
  return p.stock;
}
export async function adjustStock(user: User, id: string, input: unknown) {
  allow(user, "admin", "vendor");
  const d = z
    .object({
      delta: z
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((n) => n !== 0),
      reason: text,
      idempotencyKey: key,
    })
    .parse(input);
  return transaction(async (db) => {
    const p = await ownedProduct(user, id, db);
    requireThat(
      staff(user) || p.vendor_status === "approved",
      403,
      "Your supplier account must be approved.",
    );
    const old = await one(
      "SELECT * FROM stock_movements WHERE product_id=$1 AND kind='adjustment' AND reference=$2",
      [id, d.idempotencyKey],
      db,
    );
    if (old) {
      requireThat(
        old.delta === d.delta && old.reason === d.reason,
        409,
        "This request key was used for a different adjustment.",
      );
      return old;
    }
    const balance = await recordStock(
      db,
      id,
      d.delta,
      "adjustment",
      d.idempotencyKey,
      d.reason,
      user.id,
    );
    await audit(db, user.id, "stock.adjusted", id, {
      delta: d.delta,
      reason: d.reason,
    });
    return { balance };
  });
}
export async function editProduct(user: User, id: string, input: unknown) {
  allow(user, "admin", "vendor");
  const d = z
    .object({
      name: text,
      category: text,
      description: z.string().trim().min(5).max(3000),
      pricePaise: z.number().int().min(100).max(10000000),
      sku: optional,
      hsnCode: z.string().regex(/^(?:\d{4}|\d{6}|\d{8})?$/),
      gstRateBps: z.number().int().min(0).max(10000),
      reorderLevel: z.number().int().min(0).max(100000),
      unit: z.string().trim().min(1).max(12),
      batch: optional,
      expiresOn: z.union([z.iso.date(), z.literal("")]).default(""),
    })
    .parse(input);
  return transaction(async (db) => {
    const p = await ownedProduct(user, id, db);
    requireThat(
      staff(user) || p.vendor_status === "approved",
      403,
      "Your supplier account must be approved.",
    );
    requireThat(
      !p.regulated || (d.batch && d.expiresOn),
      400,
      "Regulated products need batch and expiry details.",
    );
    if ((p.batch || "") !== d.batch || p.unit !== d.unit)
      requireThat(
        !(await one(
          "SELECT id FROM stock_movements WHERE product_id=$1 LIMIT 1",
          [id],
          db,
        )),
        409,
        "Use a separate product for a different batch or unit after stock has been recorded.",
      );
    const r = await one(
      "UPDATE products SET name=$1,category=$2,description=$3,price_paise=$4,sku=$5,hsn_code=$6,gst_rate_bps=$7,reorder_level=$8,unit=$9,batch=$10,expires_on=$11,status=CASE WHEN $12 THEN status ELSE 'pending' END WHERE id=$13 RETURNING *",
      [
        d.name,
        d.category,
        d.description,
        d.pricePaise,
        d.sku,
        d.hsnCode,
        d.gstRateBps,
        d.reorderLevel,
        d.unit,
        d.batch,
        d.expiresOn || null,
        has(user, "admin"),
        id,
      ],
      db,
    );
    await audit(db, user.id, "product.details_updated", id, {
      reviewRequired: !has(user, "admin"),
    });
    return r;
  });
}
export async function supplierProfile(user: User, id: string, input: unknown) {
  allow(user, "admin", "vendor");
  const d = z
    .object({
      name: text,
      address: optional,
      gstin: z.string().trim().toUpperCase().default(""),
    })
    .parse(input);
  requireThat(!d.gstin || validGstin(d.gstin), 400, "Check the GSTIN.");
  return transaction(async (db) => {
    const v = await one(
      "SELECT * FROM vendors WHERE id=$1 FOR UPDATE",
      [uuid.parse(id)],
      db,
    );
    requireThat(
      v && (has(user, "admin") || v.owner_id === user.id),
      404,
      "Supplier not found.",
    );
    const result = await one(
      "UPDATE vendors SET name=$1,address=$2,gstin=$3 WHERE id=$4 RETURNING *",
      [d.name, d.address, d.gstin, id],
      db,
    );
    await audit(db, user.id, "supplier.profile_updated", id);
    return result;
  });
}
async function supplierBalance(db: DB, vendorId: string) {
  return Number(
    (await one(
      `SELECT
    COALESCE((SELECT sum(CASE WHEN kind='receipt' THEN total_paise ELSE -total_paise END) FROM supply_documents WHERE vendor_id=$1),0)
    -COALESCE((SELECT sum(amount_paise) FROM supplier_payments WHERE vendor_id=$1),0) AS balance`,
      [vendorId],
      db,
    ))!.balance,
  );
}
export async function receiveSupply(user: User, input: unknown) {
  allow(user, "admin", "finance");
  const d = z
    .object({
      vendorId: uuid,
      reference: text,
      documentDate: pastDate,
      note: optional,
      idempotencyKey: key,
      lines: z
        .array(
          z.object({
            productId: uuid,
            quantity: z.number().int().min(1).max(100000),
            unitPaise: z.number().int().min(1).max(10000000),
          }),
        )
        .min(1)
        .max(30),
    })
    .parse(input);
  requireThat(
    new Set(d.lines.map((l) => l.productId)).size === d.lines.length,
    400,
    "Combine duplicate products.",
  );
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `supply:${d.idempotencyKey}`,
    ]);
    const old = await one(
      "SELECT * FROM supply_documents WHERE idempotency_key=$1",
      [d.idempotencyKey],
      db,
    );
    if (old) {
      const sameLines = (ls: any[]) =>
        JSON.stringify(
          [...ls]
            .sort((a, b) => a.productId.localeCompare(b.productId))
            .map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPaise: l.unitPaise,
            })),
        );
      requireThat(
        old.vendor_id === d.vendorId &&
          old.reference === d.reference &&
          storedDate(old.document_date) === d.documentDate &&
          old.note === d.note &&
          sameLines(old.lines) === sameLines(d.lines),
        409,
        "Request key already used for a different supply.",
      );
      return old;
    }
    const v = await one(
      "SELECT * FROM vendors WHERE id=$1 AND status='approved' FOR UPDATE",
      [d.vendorId],
      db,
    );
    requireThat(v, 409, "Approve this supplier before receiving stock.");
    const lines = [];
    let total = 0;
    for (const l of [...d.lines].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const p = await one(
        "SELECT * FROM products WHERE id=$1 AND vendor_id=$2 FOR UPDATE",
        [l.productId, d.vendorId],
        db,
      );
      requireThat(
        p,
        400,
        "Every product must belong to the selected supplier.",
      );
      requireThat(
        !p.expires_on || new Date(p.expires_on).getTime() > Date.now(),
        409,
        "Expired stock cannot be received.",
      );
      total += l.unitPaise * l.quantity;
      lines.push({ ...l, name: p.name, sku: p.sku, unit: p.unit });
    }
    requireThat(
      Number.isSafeInteger(total) && total <= 100000000,
      400,
      "Supply value exceeds the supported limit.",
    );
    const doc = (await one(
      "INSERT INTO supply_documents(vendor_id,kind,reference,document_date,lines,total_paise,note,created_by,idempotency_key) VALUES($1,'receipt',$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        d.vendorId,
        d.reference,
        d.documentDate,
        JSON.stringify(lines),
        total,
        d.note,
        user.id,
        d.idempotencyKey,
      ],
      db,
    ))!;
    for (const l of lines)
      await recordStock(
        db,
        l.productId,
        l.quantity,
        "receipt",
        doc.id,
        d.reference,
        user.id,
      );
    await audit(db, user.id, "supplier.stock_received", doc.id, {
      vendorId: d.vendorId,
      totalPaise: total,
    });
    return doc;
  });
}
export async function returnSupply(user: User, id: string, input: unknown) {
  allow(user, "admin", "finance");
  const d = z
    .object({
      reference: text,
      documentDate: pastDate,
      note: text,
      idempotencyKey: key,
      lines: z
        .array(
          z.object({
            productId: uuid,
            quantity: z.number().int().min(1).max(100000),
          }),
        )
        .min(1)
        .max(30),
    })
    .parse(input);
  requireThat(
    new Set(d.lines.map((l) => l.productId)).size === d.lines.length,
    400,
    "Combine duplicate products.",
  );
  return transaction(async (db) => {
    const source = await one(
      "SELECT * FROM supply_documents WHERE id=$1 AND kind='receipt'",
      [uuid.parse(id)],
      db,
    );
    requireThat(source, 404, "Supply receipt not found.");
    await db.query("SELECT id FROM vendors WHERE id=$1 FOR UPDATE", [
      source.vendor_id,
    ]);
    const old = await one(
      "SELECT * FROM supply_documents WHERE idempotency_key=$1",
      [d.idempotencyKey],
      db,
    );
    if (old) {
      requireThat(old.source_id === id, 409, "Request key already used.");
      return old;
    }
    const prior = await rows(
      "SELECT lines FROM supply_documents WHERE source_id=$1 AND kind='return'",
      [id],
      db,
    );
    const lines = [];
    let total = 0;
    for (const l of [...d.lines].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const original = source.lines.find(
        (p: any) => p.productId === l.productId,
      );
      const returned = prior.reduce(
        (s, r) =>
          s +
          r.lines
            .filter((p: any) => p.productId === l.productId)
            .reduce((n: number, p: any) => n + p.quantity, 0),
        0,
      );
      requireThat(
        original && l.quantity + returned <= original.quantity,
        409,
        "Return exceeds the units received.",
      );
      lines.push({ ...original, quantity: l.quantity });
      total += l.quantity * original.unitPaise;
    }
    const doc = (await one(
      "INSERT INTO supply_documents(vendor_id,kind,reference,document_date,lines,total_paise,source_id,note,created_by,idempotency_key) VALUES($1,'return',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        source.vendor_id,
        d.reference,
        d.documentDate,
        JSON.stringify(lines),
        total,
        id,
        d.note,
        user.id,
        d.idempotencyKey,
      ],
      db,
    ))!;
    for (const l of lines)
      await recordStock(
        db,
        l.productId,
        -l.quantity,
        "return",
        doc.id,
        d.note,
        user.id,
      );
    await audit(db, user.id, "supplier.stock_returned", doc.id, {
      sourceId: id,
      totalPaise: total,
    });
    return doc;
  });
}
export async function recordSupplierPayment(user: User, input: unknown) {
  allow(user, "admin", "finance");
  const d = z
    .object({
      vendorId: uuid,
      amountPaise: z.number().int().min(1).max(100000000),
      reference: text,
      paidOn: pastDate,
      note: optional,
      idempotencyKey: key,
    })
    .parse(input);
  return transaction(async (db) => {
    requireThat(
      await one(
        "SELECT id FROM vendors WHERE id=$1 FOR UPDATE",
        [d.vendorId],
        db,
      ),
      404,
      "Supplier not found.",
    );
    const old = await one(
      "SELECT * FROM supplier_payments WHERE idempotency_key=$1",
      [d.idempotencyKey],
      db,
    );
    if (old) {
      requireThat(
        old.vendor_id === d.vendorId &&
          old.amount_paise === d.amountPaise &&
          old.reference === d.reference &&
          storedDate(old.paid_on) === d.paidOn &&
          old.note === d.note,
        409,
        "Request key already used.",
      );
      return old;
    }
    requireThat(
      d.amountPaise <= (await supplierBalance(db, d.vendorId)),
      409,
      "Payment exceeds the outstanding supplier balance.",
    );
    const result = await one(
      "INSERT INTO supplier_payments(vendor_id,amount_paise,reference,paid_on,note,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [
        d.vendorId,
        d.amountPaise,
        d.reference,
        d.paidOn,
        d.note,
        user.id,
        d.idempotencyKey,
      ],
      db,
    );
    await audit(db, user.id, "supplier.payment_recorded", result!.id, {
      amountPaise: d.amountPaise,
    });
    return result;
  });
}
export async function reverseSupplierPayment(
  user: User,
  id: string,
  input: unknown,
) {
  allow(user, "admin", "finance");
  const d = z.object({ note: text, idempotencyKey: key }).parse(input);
  return transaction(async (db) => {
    const p = await one(
      "SELECT * FROM supplier_payments WHERE id=$1",
      [uuid.parse(id)],
      db,
    );
    requireThat(p && p.amount_paise > 0, 404, "Payment not found.");
    await db.query("SELECT id FROM vendors WHERE id=$1 FOR UPDATE", [
      p.vendor_id,
    ]);
    const old = await one(
      "SELECT * FROM supplier_payments WHERE reverses_id=$1",
      [id],
      db,
    );
    if (old) return old;
    const result = await one(
      "INSERT INTO supplier_payments(vendor_id,amount_paise,reference,paid_on,note,reverses_id,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        p.vendor_id,
        -p.amount_paise,
        `Reversal ${p.id}`,
        today(),
        d.note,
        id,
        user.id,
        d.idempotencyKey,
      ],
      db,
    );
    await audit(db, user.id, "supplier.payment_reversed", result!.id, {
      paymentId: id,
    });
    return result;
  });
}

// Snapshot price, tax and seller identity when the customer places the order.
export function taxSnapshot(profile: any, items: any[], address: any) {
  const registered = profile.registration === "regular";
  if (registered) {
    requireThat(
      profile.address &&
        validState(profile.state_code) &&
        validGstin(profile.gstin),
      409,
      "The institute must complete its GST settings before accepting taxable orders.",
    );
    requireThat(
      validState(address.stateCode),
      400,
      "Select your delivery state.",
    );
  }
  if (address.gstin)
    requireThat(
      validGstin(address.gstin) &&
        address.gstin.slice(0, 2) === address.stateCode,
      400,
      "Buyer GSTIN must match the delivery state.",
    );
  const interstate = profile.state_code !== address.stateCode;
  const lines = items.map(({ p, quantity }) => {
    if (registered)
      requireThat(
        /^\d{6}(\d{2})?$/.test(p.hsn_code),
        409,
        `Add a 6 or 8 digit HSN for ${p.name} before GST sales.`,
      );
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      hsn: p.hsn_code,
      unit: p.unit,
      quantity,
      unitPaise: p.price_paise,
      ...inclusiveTax(
        p.price_paise * quantity,
        registered ? p.gst_rate_bps : 0,
        interstate,
      ),
    };
  });
  const totals = lines.reduce(
    (s, l) => ({
      gross: s.gross + l.gross,
      net: s.net + l.net,
      cgst: s.cgst + l.cgst,
      sgst: s.sgst + l.sgst,
      igst: s.igst + l.igst,
      tax: s.tax + l.tax,
    }),
    { gross: 0, net: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 },
  );
  return {
    seller: profile,
    buyer: address,
    lines,
    totals,
    interstate,
    localTax: ["04", "26", "31", "35", "38"].includes(profile.state_code)
      ? "UTGST"
      : "SGST",
  };
}
async function invoiceNumber(db: DB, kind: string) {
  const year = financialYear();
  const r = (await one(
    "INSERT INTO invoice_counters(financial_year,kind,last_number) VALUES($1,$2,1) ON CONFLICT(financial_year,kind) DO UPDATE SET last_number=invoice_counters.last_number+1 RETURNING last_number",
    [year, kind],
    db,
  ))!;
  return {
    year,
    number: `${kind === "invoice" ? "IN" : "CN"}/${year.slice(2, 4)}${year.slice(-2)}/${String(r.last_number).padStart(6, "0")}`,
  };
}
export async function issueInvoice(user: User, id: string) {
  allow(user, "admin", "finance");
  return transaction(async (db) => {
    const o = await one(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [uuid.parse(id)],
      db,
    );
    requireThat(o, 404, "Order not found.");
    const existing = await one(
      "SELECT * FROM shop_invoices WHERE order_id=$1 AND kind='invoice'",
      [id],
      db,
    );
    if (existing) return existing;
    requireThat(
      ["paid", "processing", "completed"].includes(o.status),
      409,
      "Only paid orders can be invoiced.",
    );
    requireThat(
      o.commerce_model === "institute_retail" && o.tax_snapshot,
      409,
      "Historical marketplace orders require their original seller invoice.",
    );
    const snapshot = structuredClone(o.tax_snapshot),
      current = await settings(db);
    // A pending, zero-tax order may become a commercial invoice only. Never retroactively invent GST.
    if (snapshot.seller.registration === "pending") {
      requireThat(
        current.registration === "non_gst",
        409,
        "This order has no GST snapshot. Confirm non-GST status or reconcile the order before invoicing.",
      );
      snapshot.seller = current;
    }
    const s = snapshot.seller;
    if (
      s.registration === current.registration &&
      s.gstin === current.gstin &&
      s.legal_name === current.legal_name
    ) {
      s.address ||= current.address;
      s.state_code ||= current.state_code;
      s.signatory ||= current.signatory;
    }
    requireThat(
      s.address?.length >= 5 &&
        validState(s.state_code) &&
        s.signatory?.length >= 2,
      409,
      "Complete the institute address, state and authorised signatory in Shop settings.",
    );
    requireThat(
      validState(snapshot.buyer.stateCode),
      409,
      "The order needs a delivery state before invoicing.",
    );
    if (["regular", "composition"].includes(s.registration))
      requireThat(
        validGstin(s.gstin),
        409,
        "A valid institute GSTIN is required.",
      );
    if (s.registration === "regular")
      requireThat(
        s.einvoice === "not_applicable",
        409,
        "Confirm e-invoice applicability. IRP-required invoices need an authorised IRP integration before issuance.",
      );
    const { year, number } = await invoiceNumber(db, "invoice");
    const document = {
      ...snapshot,
      title:
        s.registration === "regular"
          ? "Tax invoice"
          : s.registration === "composition"
            ? "Bill of supply"
            : "Invoice",
      number,
      issuedAt: new Date().toISOString(),
      orderId: id,
      supplyDate: o.created_at,
      reverseCharge: false,
    };
    const r = await one(
      "INSERT INTO shop_invoices(order_id,kind,number,financial_year,document,total_paise,created_by) VALUES($1,'invoice',$2,$3,$4,$5,$6) RETURNING *",
      [id, number, year, document, o.total_paise, user.id],
      db,
    );
    await audit(db, user.id, "shop.invoice_issued", r!.id, {
      orderId: id,
      number,
    });
    return r;
  });
}
export async function creditInvoice(db: DB, orderId: string, refundId: string) {
  // Same order lock as issuance prevents a refund racing a newly issued invoice.
  await db.query("SELECT id FROM orders WHERE id=$1 FOR UPDATE", [orderId]);
  const original = await one(
    "SELECT * FROM shop_invoices WHERE order_id=$1 AND kind='invoice'",
    [orderId],
    db,
  );
  if (!original) return;
  const { year, number } = await invoiceNumber(db, "credit_note");
  const document = {
    ...original.document,
    title: "Credit note",
    number,
    issuedAt: new Date().toISOString(),
    originalNumber: original.number,
    originalDate: original.created_at,
    reason: "Full order refund",
  };
  const r = await one(
    "INSERT INTO shop_invoices(order_id,kind,number,financial_year,original_id,refund_id,document,total_paise) VALUES($1,'credit_note',$2,$3,$4,$5,$6,$7) RETURNING id",
    [
      orderId,
      number,
      year,
      original.id,
      refundId,
      document,
      original.total_paise,
    ],
    db,
  );
  await audit(db, null, "shop.credit_note_issued", r!.id, {
    orderId,
    refundId,
    number,
  });
}
export async function readInvoice(user: User, id: string) {
  const r = await one(
    "SELECT i.* FROM shop_invoices i JOIN orders o ON o.id=i.order_id WHERE i.id=$1 AND ($2 OR o.customer_id=$3)",
    [uuid.parse(id), staff(user), user.id],
  );
  requireThat(r, 404, "Invoice not found.");
  return r;
}

export async function shopWorkspace(user: User, query: URLSearchParams) {
  allow(user, "admin", "finance", "vendor");
  const isStaff = staff(user),
    vendor = await one("SELECT id FROM vendors WHERE owner_id=$1", [user.id]);
  const vendorId = isStaff ? query.get("vendor") || null : vendor?.id;
  requireThat(
    isStaff || vendorId,
    403,
    "Submit your supplier application first.",
  );
  if (vendorId) uuid.parse(vendorId);
  const from = z.iso
    .date()
    .parse(
      query.get("from") ||
        new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    );
  const to = z.iso.date().parse(query.get("to") || today());
  requireThat(from <= to, 400, "The end date must be after the start date.");
  const scope = [vendorId || null, from, to];
  const [
    profile,
    vendors,
    products,
    sales,
    documents,
    payments,
    movements,
    invoices,
    summary,
  ] = await Promise.all([
    settings(),
    rows(
      `SELECT v.id,v.name,v.status,v.address,v.gstin,
      COALESCE((SELECT sum(CASE WHEN kind='receipt' THEN total_paise ELSE -total_paise END) FROM supply_documents d WHERE d.vendor_id=v.id),0)::bigint AS purchases_paise,
      COALESCE((SELECT sum(amount_paise) FROM supplier_payments p WHERE p.vendor_id=v.id),0)::bigint AS paid_paise,
      (COALESCE((SELECT sum(CASE WHEN kind='receipt' THEN total_paise ELSE -total_paise END) FROM supply_documents d WHERE d.vendor_id=v.id AND d.document_date<$2::date),0)-COALESCE((SELECT sum(amount_paise) FROM supplier_payments p WHERE p.vendor_id=v.id AND p.paid_on<$2::date),0))::bigint AS opening_paise,
      (COALESCE((SELECT sum(CASE WHEN kind='receipt' THEN total_paise ELSE -total_paise END) FROM supply_documents d WHERE d.vendor_id=v.id AND d.document_date<=$3::date),0)-COALESCE((SELECT sum(amount_paise) FROM supplier_payments p WHERE p.vendor_id=v.id AND p.paid_on<=$3::date),0))::bigint AS closing_paise
      FROM vendors v WHERE ($1::uuid IS NULL OR v.id=$1) ORDER BY v.name`,
      scope,
    ),
    rows(
      "SELECT p.*,v.name AS vendor_name FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE ($1::uuid IS NULL OR p.vendor_id=$1) ORDER BY p.name LIMIT 1000",
      [vendorId || null],
    ),
    rows(
      `SELECT i.*,o.created_at,o.status AS order_status,o.commerce_model,
      CASE WHEN $4 THEN o.address ELSE NULL END AS address,
      (SELECT id FROM shop_invoices si WHERE si.order_id=o.id AND si.kind='invoice') AS invoice_id
      FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE ($1::uuid IS NULL OR i.vendor_id=$1) AND o.created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND o.created_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      ORDER BY o.created_at DESC,i.id LIMIT 500`,
      [...scope, isStaff],
    ),
    rows(
      "SELECT d.*,v.name AS vendor_name FROM supply_documents d JOIN vendors v ON v.id=d.vendor_id WHERE ($1::uuid IS NULL OR d.vendor_id=$1) AND d.document_date BETWEEN $2::date AND $3::date ORDER BY d.created_at DESC LIMIT 500",
      scope,
    ),
    rows(
      "SELECT p.*,v.name AS vendor_name FROM supplier_payments p JOIN vendors v ON v.id=p.vendor_id WHERE ($1::uuid IS NULL OR p.vendor_id=$1) AND p.paid_on BETWEEN $2::date AND $3::date ORDER BY p.created_at DESC LIMIT 500",
      scope,
    ),
    rows(
      "SELECT m.*,p.name AS product_name FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE ($1::uuid IS NULL OR p.vendor_id=$1) AND m.created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND m.created_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') ORDER BY m.created_at DESC LIMIT 100",
      scope,
    ),
    isStaff
      ? rows(
          "SELECT id,order_id,kind,number,total_paise,created_at,document->'totals' AS totals,document->'buyer'->>'gstin' AS buyer_gstin,document->'buyer'->>'stateCode' AS supply_state,document->>'originalNumber' AS original_number FROM shop_invoices WHERE created_at>=($1::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata') ORDER BY created_at DESC LIMIT 500",
          [from, to],
        )
      : Promise.resolve([]),
    one(
      `SELECT COALESCE(sum(i.quantity*i.unit_paise) FILTER(WHERE o.status IN ('paid','processing','completed')),0)::bigint AS sales_paise,
      count(DISTINCT o.id) FILTER(WHERE o.status IN ('paid','processing','completed'))::int AS paid_orders,
      COALESCE(sum(i.quantity) FILTER(WHERE o.status IN ('paid','processing','completed')),0)::int AS units_sold
      FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ($1::uuid IS NULL OR i.vendor_id=$1) AND o.created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND o.created_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Kolkata')`,
      scope,
    ),
  ]);
  return {
    isStaff,
    profile: isStaff ? profile : { legal_name: profile.legal_name },
    vendors,
    products,
    sales,
    documents,
    payments,
    movements,
    invoices,
    summary,
    from,
    to,
  };
}
