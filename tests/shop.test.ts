import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { one, rows, pool } from "../server/db";
import { type User } from "../server/auth";
import { placeOrder, createPayment, capturePayment } from "../server/commerce";
import { processRefund } from "../server/refunds";
import { inclusiveTax, financialYear, validGstin } from "../lib/india";
import {
  adjustStock,
  receiveSupply,
  returnSupply,
  recordSupplierPayment,
  reverseSupplierPayment,
  shopWorkspace,
  saveSettings,
  issueInvoice,
  readInvoice,
  editProduct,
  addSupplier,
} from "../server/shop";
const day = "2026-01-10";
const inputProfile = {
  legalName: "Synthetic institute",
  address: "Synthetic test address",
  stateCode: "27",
  gstin: "",
  registration: "non_gst",
  einvoice: "not_applicable",
  signatory: "Synthetic signatory",
};
async function user(role: string) {
  return (await one(
    "INSERT INTO users(email,name,roles) VALUES($1,$2,$3) RETURNING *",
    [`${randomUUID()}@test.invalid`, `Synthetic ${role}`, [role]],
  ))! as User;
}
async function fixture() {
  const admin = await user("admin"),
    finance = await user("finance"),
    vendor = await user("vendor"),
    buyer = await user("patient"),
    other = await user("vendor");
  const v = (await one(
    "INSERT INTO vendors(owner_id,name,status) VALUES($1,'Synthetic supplier','approved') RETURNING *",
    [vendor.id],
  ))!;
  const p = (await one(
    "INSERT INTO products(vendor_id,name,category,description,price_paise,stock,status,hsn_code,gst_rate_bps) VALUES($1,'Synthetic item','Test','Test stock',11800,10,'approved','123456',1800) RETURNING *",
    [v.id],
  ))!;
  return { admin, finance, vendor, buyer, other, v, p };
}
const supply = (f: any) => ({
  vendorId: f.v.id,
  reference: randomUUID(),
  documentDate: day,
  idempotencyKey: randomUUID(),
  lines: [{ productId: f.p.id, quantity: 5, unitPaise: 5000 }],
});
async function paid(f: any, st = "27") {
  const o = (await placeOrder(f.buyer, {
    items: [{ productId: f.p.id, quantity: 1 }],
    address: {
      name: "Synthetic buyer",
      phone: "9999999999",
      line: "Synthetic buyer address",
      city: "Synthetic city",
      stateCode: st,
      postcode: "411001",
    },
    idempotencyKey: randomUUID(),
  }))!;
  const p = await createPayment(f.buyer, {
    referenceType: "order",
    referenceId: o.id,
  });
  await capturePayment(p.id, randomUUID(), randomUUID(), o.total_paise, "INR");
  return { o, p };
}
beforeEach(async () => {
  await pool.query(
    "UPDATE shop_settings SET registration='pending',gstin='',address='',state_code='',signatory='',einvoice='unknown' WHERE id=true",
  );
});
after(async () => {
  await pool.query(
    "UPDATE shop_settings SET registration='pending',gstin='',address='',state_code='',signatory='',einvoice='unknown' WHERE id=true",
  );
  await pool.end();
});
test("GST inclusive rounding preserves paise and India financial-year boundaries", () => {
  assert.deepEqual(inclusiveTax(11800, 1800, false), {
    gross: 11800,
    net: 10000,
    tax: 1800,
    cgst: 900,
    sgst: 900,
    igst: 0,
    rateBps: 1800,
  });
  for (const amount of [1, 99, 10501, 9999999])
    for (const rate of [0, 500, 1800, 4000]) {
      const t = inclusiveTax(amount, rate, false);
      assert.equal(t.net + t.cgst + t.sgst, amount);
      const i = inclusiveTax(amount, rate, true);
      assert.equal(i.net + i.igst, amount);
      assert.equal(i.cgst, 0);
    }
  assert.equal(financialYear(new Date("2026-03-31T18:29:59Z")), "2025-26");
  assert.equal(financialYear(new Date("2026-03-31T18:30:00Z")), "2026-27");
  assert.equal(validGstin("27AAPFU0939F1ZV"), true);
  assert.equal(validGstin("27AAPFU0939F1ZA"), false);
});
test("supplier receipts atomically increase stock and payable, reject altered retries, and remain immutable", async () => {
  const f = await fixture(),
    d = supply(f);
  const r = await Promise.all([
    receiveSupply(f.admin, d),
    receiveSupply(f.admin, d),
  ]);
  assert.equal(r[0].id, r[1].id);
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.p.id]))!.stock,
    15,
  );
  const data = await shopWorkspace(
    f.vendor,
    new URLSearchParams("from=2026-01-01&to=2026-12-31"),
  );
  assert.equal(data.vendors.length, 1);
  assert.equal(Number(data.vendors[0].purchases_paise), 25000);
  await assert.rejects(
    () =>
      receiveSupply(f.admin, {
        ...d,
        lines: [{ ...d.lines[0], unitPaise: 1 }],
      }),
    /different supply/,
  );
  await assert.rejects(
    () => receiveSupply(f.vendor, { ...d, idempotencyKey: randomUUID() }),
    /permission/,
  );
  await assert.rejects(
    pool.query("UPDATE supply_documents SET total_paise=1 WHERE id=$1", [
      r[0].id,
    ]),
    /Append-only/,
  );
});
test("stock adjustments enforce ownership and cannot concurrently remove more than available", async () => {
  const f = await fixture();
  const adjust = {
    delta: -7,
    reason: "Damaged units",
    idempotencyKey: randomUUID(),
  };
  await assert.rejects(() => adjustStock(f.other, f.p.id, adjust), /not found/);
  const results = await Promise.allSettled([
    adjustStock(f.vendor, f.p.id, adjust),
    adjustStock(f.vendor, f.p.id, { ...adjust, idempotencyKey: randomUUID() }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await one("SELECT stock FROM products WHERE id=$1", [f.p.id]))!.stock,
    3,
  );
});
test("supplier payments serialize balance checks and corrections restore the balance without deleting history", async () => {
  const f = await fixture();
  await receiveSupply(f.admin, supply(f));
  const d = {
    vendorId: f.v.id,
    amountPaise: 20000,
    reference: randomUUID(),
    paidOn: day,
    idempotencyKey: randomUUID(),
  };
  const rs = await Promise.allSettled([
    recordSupplierPayment(f.finance, d),
    recordSupplierPayment(f.finance, {
      ...d,
      reference: randomUUID(),
      idempotencyKey: randomUUID(),
    }),
  ]);
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  const payment = (
    rs.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>
  ).value;
  const r = await reverseSupplierPayment(f.admin, payment.id, {
    note: "Incorrect bank record",
    idempotencyKey: randomUUID(),
  });
  assert.equal(r!.amount_paise, -20000);
  await reverseSupplierPayment(f.admin, payment.id, {
    note: "Retry correction",
    idempotencyKey: randomUUID(),
  });
  const data = await shopWorkspace(
    f.vendor,
    new URLSearchParams("from=2026-01-01&to=2026-12-31"),
  );
  assert.equal(Number(data.vendors[0].paid_paise), 0);
  const later = await shopWorkspace(
    f.vendor,
    new URLSearchParams("from=2026-02-01&to=2026-02-28"),
  );
  assert.equal(later.documents.length, 0);
  // The correction is dated today; it must not rewrite February's statement.
  assert.equal(Number(later.vendors[0].opening_paise), 5000);
  assert.equal(Number(later.vendors[0].closing_paise), 5000);
  await assert.rejects(
    () =>
      recordSupplierPayment(f.vendor, { ...d, idempotencyKey: randomUUID() }),
    /permission/,
  );
});
test("supplier returns use the original cost and cannot over-return or change another supplier balance", async () => {
  const f = await fixture(),
    receipt = await receiveSupply(f.admin, supply(f));
  const d = {
    reference: randomUUID(),
    documentDate: day,
    note: "Damaged on arrival",
    idempotencyKey: randomUUID(),
    lines: [{ productId: f.p.id, quantity: 4, unitPaise: 1 }],
  };
  const r = await returnSupply(f.admin, receipt.id, d);
  assert.equal(r.total_paise, 20000);
  await assert.rejects(
    () =>
      returnSupply(f.admin, receipt.id, {
        ...d,
        reference: randomUUID(),
        idempotencyKey: randomUUID(),
        lines: [{ productId: f.p.id, quantity: 2 }],
      }),
    /exceeds/,
  );
  const data = await shopWorkspace(
    f.vendor,
    new URLSearchParams("from=2026-01-01&to=2026-12-31"),
  );
  assert.equal(Number(data.vendors[0].purchases_paise), 5000);
});
test("GSTIN stays blank and invoices are blocked until seller information is confirmed", async () => {
  const f = await fixture(),
    { o } = await paid(f);
  await assert.rejects(() => issueInvoice(f.admin, o.id), /Confirm non-GST/);
  await saveSettings(f.admin, { ...inputProfile, address: "" });
  await assert.rejects(() => issueInvoice(f.admin, o.id), /address/);
  await saveSettings(f.admin, inputProfile);
  const i = (await issueInvoice(f.admin, o.id))!;
  assert.equal(i.document.seller.gstin, "");
  assert.equal(i.document.totals.tax, 0);
  assert.equal(i.document.title, "Invoice");
  await assert.rejects(() => readInvoice(f.other, i.id), /not found/);
  assert.equal((await readInvoice(f.buyer, i.id)).id, i.id);
});
test("GST invoices snapshot price and identity, isolate customer access and issue consecutive unique numbers", async () => {
  const f = await fixture();
  await saveSettings(f.admin, {
    ...inputProfile,
    registration: "regular",
    gstin: "27AAPFU0939F1ZV",
  });
  const a = await paid(f),
    b = await paid(f, "21");
  const rs = await Promise.all([
    issueInvoice(f.admin, a.o.id),
    issueInvoice(f.finance, a.o.id),
    issueInvoice(f.admin, b.o.id),
  ]);
  assert.equal(rs[0]!.id, rs[1]!.id);
  assert.notEqual(rs[0]!.number, rs[2]!.number);
  assert.ok(rs[0]!.number.length <= 16);
  assert.equal(rs[0]!.document.totals.cgst, 900);
  assert.equal(rs[0]!.document.totals.sgst, 900);
  assert.equal(rs[2]!.document.totals.igst, 1800);
  await pool.query(
    "UPDATE products SET price_paise=24000,name='Changed product' WHERE id=$1",
    [f.p.id],
  );
  await saveSettings(f.admin, {
    ...inputProfile,
    legalName: "Changed institute",
  });
  const persisted = await readInvoice(f.buyer, rs[0]!.id);
  assert.equal(persisted.document.lines[0].name, "Synthetic item");
  assert.equal(persisted.document.seller.legal_name, "Synthetic institute");
  assert.equal(persisted.total_paise, 11800);
  await assert.rejects(
    pool.query("DELETE FROM shop_invoices WHERE id=$1", [persisted.id]),
    /Append-only/,
  );
  const ledger = await rows(
    "SELECT * FROM ledger_entries WHERE payment_id=$1",
    [a.p.id],
  );
  assert.equal(
    ledger.reduce((n, r) => n + r.amount_paise, 0),
    0,
  );
  assert.equal(
    ledger.find((r) => r.account === "retail_revenue")!.amount_paise,
    -10000,
  );
  assert.equal(
    ledger.some((r) => r.account.startsWith("vendor_payable")),
    false,
  );
});
test("IRP-required invoices are blocked and full refunds produce one immutable linked credit note", async () => {
  const f = await fixture();
  await saveSettings(f.admin, {
    ...inputProfile,
    registration: "regular",
    gstin: "27AAPFU0939F1ZV",
    einvoice: "required",
  });
  const blocked = await paid(f);
  await assert.rejects(() => issueInvoice(f.admin, blocked.o.id), /IRP/);
  await saveSettings(f.admin, inputProfile);
  const { o, p } = await paid(f),
    invoice = (await issueInvoice(f.admin, o.id))!;
  const refund = (await one(
    "INSERT INTO refund_requests(payment_id,requested_by,reason,status,approved_by) VALUES($1,$2,'Synthetic full refund','approved',$3) RETURNING *",
    [p.id, f.buyer.id, f.admin.id],
  ))!;
  await processRefund(refund.id, randomUUID());
  await processRefund(refund.id, randomUUID());
  const credits = await rows(
    "SELECT * FROM shop_invoices WHERE order_id=$1 AND kind='credit_note'",
    [o.id],
  );
  assert.equal(credits.length, 1);
  assert.equal(credits[0].original_id, invoice.id);
  assert.equal(credits[0].total_paise, invoice.total_paise);
  assert.equal(credits[0].document.originalNumber, invoice.number);
});
test("supplier view ignores a forged supplier filter and hides customer addresses and invoices", async () => {
  const f = await fixture();
  await paid(f);
  const forged = await shopWorkspace(
    f.vendor,
    new URLSearchParams(`vendor=${randomUUID()}&from=2026-01-01&to=2026-12-31`),
  );
  assert.equal(forged.vendors[0].id, f.v.id);
  assert.ok(forged.sales.every((s) => s.address === null));
  assert.deepEqual(forged.invoices, []);
  assert.equal(forged.profile.gstin, undefined);
  await assert.rejects(
    () => shopWorkspace(f.buyer, new URLSearchParams()),
    /permission/,
  );
});

test("supplier onboarding requires an existing active account and never grants administrator access", async () => {
  const f = await fixture(),
    newOwner = await user("patient");
  await assert.rejects(
    () =>
      addSupplier(f.vendor, {
        email: newOwner.email,
        name: "Synthetic business",
      }),
    /permission/,
  );
  await assert.rejects(
    () =>
      addSupplier(f.admin, {
        email: "missing@example.invalid",
        name: "Synthetic business",
      }),
    /sign in/,
  );
  const v = (await addSupplier(f.admin, {
    email: newOwner.email,
    name: "Synthetic business",
  }))!;
  assert.equal(v.status, "pending");
  assert.equal(v.gstin, "");
  const u = (await one("SELECT roles FROM users WHERE id=$1", [newOwner.id]))!;
  assert.deepEqual(u.roles, ["patient", "vendor"]);
  await assert.rejects(
    () => addSupplier(f.admin, { email: newOwner.email, name: "Duplicate" }),
    /already/,
  );
});

test("historical marketplace captures still preserve the original commission split", async () => {
  const f = await fixture();
  const o = (await placeOrder(f.buyer, {
    items: [{ productId: f.p.id, quantity: 1 }],
    address: {
      name: "Synthetic buyer",
      phone: "9999999999",
      line: "Synthetic test address",
      city: "Test city",
      postcode: "411001",
    },
    idempotencyKey: randomUUID(),
  }))!;
  // Recreate the historical persisted shape, not a new client-selectable model.
  await pool.query(
    "UPDATE orders SET commerce_model='legacy_marketplace',tax_snapshot=null WHERE id=$1",
    [o.id],
  );
  await pool.query(
    "UPDATE order_items SET commission_paise=590 WHERE order_id=$1",
    [o.id],
  );
  const p = await createPayment(f.buyer, {
    referenceType: "order",
    referenceId: o.id,
  });
  await capturePayment(p.id, randomUUID(), randomUUID(), 11800, "INR");
  const ledger = await rows(
    "SELECT * FROM ledger_entries WHERE payment_id=$1",
    [p.id],
  );
  assert.equal(
    ledger.find((r) => r.account === "institute_commission")!.amount_paise,
    -590,
  );
  assert.equal(
    ledger.find((r) => r.account.startsWith("vendor_payable:"))!.amount_paise,
    -11210,
  );
  assert.equal(
    ledger.reduce((n, r) => n + r.amount_paise, 0),
    0,
  );
});
