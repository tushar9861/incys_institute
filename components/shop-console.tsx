"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Store,
  Package,
  ShoppingBag,
  Wallet,
  UserRound,
  ArrowDownToLine,
  Plus,
  Search,
  FileText,
  SlidersHorizontal,
  Truck,
  ArrowUpRight,
  Check,
  RotateCw,
  X,
  Trash2,
  AlertTriangle,
  Boxes,
  ChartNoAxesCombined,
  ArrowDownLeft,
  ChevronRight,
} from "lucide-react";
import { api, money, date } from "@/lib/client";
import { states } from "@/lib/india";
import { FormModal, type Modal, type Field } from "./form-modal";
import { InvoiceButton, InvoiceView } from "./invoice-view";
import { MotionEmblem } from "./motion-emblem";

const ymd = (value: any) => String(value || "").slice(0, 10);
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
const status = (value: string) => (
  <span className={`badge badge-${value}`}>{value?.replaceAll("_", " ")}</span>
);
const tabs = [
  ["overview", "Overview", ChartNoAxesCombined],
  ["inventory", "Stock", Package],
  ["orders", "Sales", ShoppingBag],
  ["supplies", "Supplies", Truck],
  ["finance", "Accounts", Wallet],
  ["invoices", "Invoices", FileText],
  ["settings", "Settings", SlidersHorizontal],
] as const;
export function SupplierBottomNav({ tab }: { tab: string }) {
  return (
    <nav
      className="bottom-nav supplier-bottom-nav"
      aria-label="Supplier navigation"
    >
      {[
        ["overview", "Home", Store],
        ["inventory", "Stock", Package],
        ["orders", "Sales", ShoppingBag],
        ["finance", "Accounts", Wallet],
        ["account", "Account", UserRound],
      ].map(([key, label, Icon]: any) => (
        <Link
          key={key}
          href={`/portal/vendor${key === "overview" ? "" : `?tab=${key}`}`}
          className={tab === key ? "selected" : ""}
          aria-current={tab === key ? "page" : undefined}
        >
          <span>
            <Icon size={22} />
          </span>
          <small>{label}</small>
        </Link>
      ))}
    </nav>
  );
}
function Table({
  heads,
  rows,
  empty = "No records yet.",
}: {
  heads: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td data-label={heads[j]} key={j}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="shop-empty">
      <MotionEmblem />
      <h3>{empty}</h3>
    </div>
  );
}
function csv(name: string, heads: string[], records: unknown[][]) {
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [heads, ...records].map((r) => r.map(cell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const field = (
  name: string,
  label: string,
  value: any = "",
  type = "text",
  required = true,
): Field => ({ name, label, value, type, required });
const select = (
  name: string,
  label: string,
  options: { value: string; label: string }[],
  value = "",
): Field => ({ name, label, type: "select", options, value });
const stateOptions = states.map(([value, label]) => ({ value, label }));

export function ShopConsole({
  role,
  initialTab = "overview",
}: {
  role: string;
  initialTab?: string;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const isStaff = ["admin", "finance"].includes(role),
    canStock = role !== "finance";
  const tab = isStaff
    ? tabs.some((t) => t[0] === params.get("shopView"))
      ? params.get("shopView")!
      : initialTab
    : initialTab;
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<Modal | null>(null),
    [supply, setSupply] = useState(false),
    [invoice, setInvoice] = useState<any>(null);
  const [query, setQuery] = useState(""),
    [stockFilter, setStockFilter] = useState("all");
  const [range, setRange] = useState({
    from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    to: today(),
  });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++sequence.current;
    setLoading(true);
    try {
      const d = await api(`shop/workspace?from=${range.from}&to=${range.to}`);
      if (n === sequence.current) {
        setData(d);
        setError("");
      }
    } catch (e) {
      if (n === sequence.current) setError((e as Error).message);
    } finally {
      if (n === sequence.current) setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      sequence.current++;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  function go(next: string) {
    setQuery("");
    if (isStaff) router.push(`/portal/${role}?tab=shopdesk&shopView=${next}`);
    else
      router.push(`/portal/vendor${next === "overview" ? "" : `?tab=${next}`}`);
  }
  async function act(
    path: string,
    body: any = {},
    method = "POST",
    message = "Saved.",
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, method, body);
      setNotice(message);
      await refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const done = () => {
    setNotice("Saved.");
    refresh();
  };
  const button = (label: string, fn: () => void, primary = false) => (
    <button
      className={`button small ${primary ? "" : "secondary"}`}
      disabled={busy}
      onClick={fn}
    >
      {label}
    </button>
  );
  function productForm(p?: any) {
    const vendorOptions = data.vendors
      .filter((v: any) => v.status === "approved")
      .map((v: any) => ({ value: v.id, label: v.name }));
    const fields: Field[] = [
      ...(!p && isStaff ? [select("vendorId", "Supplier", vendorOptions)] : []),
      field("name", "Product name", p?.name),
      field("category", "Category", p?.category),
      field("sku", "SKU", p?.sku, "text", false),
      field(
        "pricePaise",
        "Selling price (₹, inclusive)",
        p ? p.price_paise / 100 : "",
        "money",
      ),
      field("hsnCode", "HSN code", p?.hsn_code, "text", false),
      {
        ...field(
          "gstRate",
          "GST rate (%)",
          p ? p.gst_rate_bps / 100 : 0,
          "money",
        ),
        max: 100,
      },
      field(
        "reorderLevel",
        "Low-stock alert at",
        p?.reorder_level ?? 5,
        "number",
      ),
      field("unit", "Unit", p?.unit || "PCS"),
      field("description", "Description", p?.description, "textarea"),
      field("batch", "Batch", p?.batch, "text", Boolean(p?.regulated)),
      field(
        "expiresOn",
        "Expiry",
        ymd(p?.expires_on),
        "date",
        Boolean(p?.regulated),
      ),
      ...(!p
        ? [
            field(
              "regulated",
              "Regulated medicinal / supplement product",
              false,
              "checkbox",
              false,
            ),
            field("licenceReference", "Licence reference", "", "text", false),
          ]
        : []),
    ];
    setModal({
      title: p ? "Edit product" : "New product",
      hint: !isStaff
        ? "Product changes go to the institute for review."
        : undefined,
      fields,
      submit: async (v) => {
        const body = {
          ...v,
          sku: v.sku || "",
          hsnCode: v.hsnCode || "",
          gstRateBps: v.gstRate || 0,
          stock: 0,
        };
        if (p) return api(`shop/products/${p.id}`, "PATCH", body);
        return api("products", "POST", body);
      },
    });
  }
  function adjustment(p: any) {
    const idempotencyKey = crypto.randomUUID();
    setModal({
      title: `Adjust ${p.name}`,
      hint: `Available: ${p.stock}. Use a negative quantity for damage or a count correction. Supplier purchases belong in Supplies.`,
      fields: [
        field("delta", "Stock change", "", "number"),
        field("reason", "Reason", "", "textarea"),
      ],
      submit: (v) =>
        api(`shop/products/${p.id}/stock`, "POST", { ...v, idempotencyKey }),
    });
  }
  function settingsForm() {
    const p = data.profile;
    setModal({
      title: "Institute invoicing",
      hint: "Leave GSTIN blank until registration details are available.",
      fields: [
        field("legalName", "Legal name", p.legal_name),
        field("address", "Registered address", p.address, "textarea", false),
        {
          ...select(
            "stateCode",
            "Registered state",
            stateOptions,
            p.state_code,
          ),
          required: false,
        },
        select(
          "registration",
          "Registration status",
          [
            { value: "pending", label: "Details pending" },
            { value: "non_gst", label: "Not registered for GST" },
            { value: "regular", label: "Regular GST registration" },
            { value: "composition", label: "Composition taxpayer" },
          ],
          p.registration,
        ),
        field("gstin", "GSTIN", p.gstin, "text", false),
        select(
          "einvoice",
          "IRP e-invoicing",
          [
            { value: "unknown", label: "Applicability not confirmed" },
            { value: "not_applicable", label: "Not applicable (confirmed)" },
            { value: "required", label: "Required — integration needed" },
          ],
          p.einvoice,
        ),
        field("signatory", "Authorised signatory", p.signatory, "text", false),
      ],
      submit: (v) =>
        api("shop/settings", "PATCH", {
          ...v,
          address: v.address || "",
          stateCode: v.stateCode || "",
          gstin: v.gstin || "",
          signatory: v.signatory || "",
        }),
    });
  }
  function profileForm(v: any) {
    setModal({
      title: "Supplier details",
      fields: [
        field("name", "Business name", v.name),
        field("address", "Business address", v.address, "textarea", false),
        field("gstin", "GSTIN", v.gstin, "text", false),
      ],
      submit: (d) =>
        api(`shop/suppliers/${v.id}`, "PATCH", {
          ...d,
          address: d.address || "",
          gstin: d.gstin || "",
        }),
    });
  }
  function payment(v: any) {
    const idempotencyKey = crypto.randomUUID();
    setModal({
      title: "Record supplier payment",
      hint: `${v.name} · Outstanding ${money(Number(v.purchases_paise) - Number(v.paid_paise))}. Record a completed bank or cash payment. This does not transfer money.`,
      fields: [
        field("amountPaise", "Amount paid (₹)", "", "money"),
        field("reference", "Bank / cash receipt reference"),
        field("paidOn", "Payment date", today(), "date"),
        field("note", "Note", "", "textarea", false),
        field(
          "confirmed",
          "I confirm the supplier has been paid",
          false,
          "checkbox",
        ),
      ],
      submit: ({ confirmed, ...d }) =>
        api("shop/supplier-payments", "POST", {
          ...d,
          vendorId: v.id,
          idempotencyKey,
        }),
    });
  }
  function returnForm(d: any) {
    const idempotencyKey = crypto.randomUUID();
    setModal({
      title: "Return stock to supplier",
      hint: "Enter the units physically returned. The supplier balance will be reduced at the original purchase price.",
      fields: [
        field("reference", "Supplier credit / return reference"),
        field("documentDate", "Return date", today(), "date"),
        ...d.lines.map((l: any) => ({
          ...field(l.productId, l.name, 0, "number"),
          min: 0,
          max: l.quantity,
        })),
        field("note", "Reason", "", "textarea"),
      ],
      submit: async (v) =>
        api(`shop/supplies/${d.id}/return`, "POST", {
          reference: v.reference,
          documentDate: v.documentDate,
          note: v.note,
          idempotencyKey,
          lines: d.lines
            .map((l: any) => ({
              productId: l.productId,
              quantity: v[l.productId],
            }))
            .filter((l: any) => l.quantity > 0),
        }),
    });
  }
  function reversal(p: any) {
    const idempotencyKey = crypto.randomUUID();
    setModal({
      title: "Correct a payment record",
      hint: "Reverses this accounting entry. It does not reverse a bank transfer.",
      fields: [field("note", "Correction reason", "", "textarea")],
      submit: (v) =>
        api(`shop/supplier-payments/${p.id}/reverse`, "POST", {
          ...v,
          idempotencyKey,
        }),
    });
  }
  function issue(o: any) {
    setModal({
      title: "Issue customer invoice",
      hint: "Creates a permanent invoice from the price and tax details saved with this order.",
      label: "Issue invoice",
      fields: [
        field(
          "confirmed",
          "I have checked the order and seller details",
          false,
          "checkbox",
        ),
      ],
      submit: async () => {
        const result = await api(
          `shop/orders/${o.order_id}/invoice`,
          "POST",
          {},
        );
        setInvoice(result);
      },
    });
  }
  if (!data)
    return (
      <section className="shop-console">
        <div className="shop-empty">
          <MotionEmblem />
          {error ? (
            <>
              <p role="alert" className="error">
                {error}
              </p>
              <button className="button" onClick={refresh}>
                Try again
              </button>
            </>
          ) : (
            <p role="status">Opening your shop…</p>
          )}
        </div>
      </section>
    );
  const filter = (items: any[]) =>
    items.filter((p) =>
      JSON.stringify(p).toLowerCase().includes(query.toLowerCase()),
    );
  const low = data.products.filter(
    (p: any) => p.stock <= p.reorder_level && p.status !== "archived",
  );
  const opening = data.vendors.reduce(
    (n: number, v: any) => n + Number(v.opening_paise),
    0,
  );
  const closing = data.vendors.reduce(
    (n: number, v: any) => n + Number(v.closing_paise),
    0,
  );
  const balance = data.vendors.reduce(
    (n: number, v: any) => n + Number(v.purchases_paise) - Number(v.paid_paise),
    0,
  );
  const products = filter(data.products).filter(
    (p: any) =>
      stockFilter === "all" ||
      (stockFilter === "low"
        ? p.stock <= p.reorder_level
        : p.status === stockFilter),
  );
  const sales = filter(data.sales),
    supplies = filter(data.documents),
    payments = filter(data.payments);
  const statement = [
    ...data.documents.map((d: any) => ({
      when: d.document_date,
      posted: d.created_at,
      type: d.kind === "receipt" ? "Stock received" : "Stock returned",
      supplier: d.vendor_name,
      reference: d.reference,
      amount: d.kind === "receipt" ? d.total_paise : -d.total_paise,
    })),
    ...data.payments.map((p: any) => ({
      when: p.paid_on,
      posted: p.created_at,
      type: p.amount_paise > 0 ? "Payment" : "Payment reversal",
      supplier: p.vendor_name,
      reference: p.reference,
      amount: -p.amount_paise,
    })),
  ].sort(
    (a, b) =>
      new Date(a.when).getTime() - new Date(b.when).getTime() ||
      new Date(a.posted).getTime() - new Date(b.posted).getTime(),
  );
  const selectedTabs = tabs.filter(([id]) => isStaff || id !== "invoices");
  return (
    <section
      className="shop-console"
      aria-label={isStaff ? "Institute shop management" : "Supplier workspace"}
      aria-busy={loading}
    >
      <div className="shop-section-nav" aria-label="Shop sections">
        {selectedTabs.map(([id, label, Icon]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "active" : ""}
            onClick={() => go(id)}
          >
            <Icon size={17} />
            <span>{id === "settings" && !isStaff ? "Business" : label}</span>
          </button>
        ))}
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="text-link" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="notice success" role="status">
          <Check size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!["overview", "settings"].includes(tab) && (
        <form
          className="shop-tools"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setRange({ from: String(f.get("from")), to: String(f.get("to")) });
          }}
        >
          <label className="shop-search">
            <Search size={17} />
            <input
              aria-label="Search shop records"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="shop-dates">
            <label>
              From
              <input
                type="date"
                name="from"
                defaultValue={range.from}
                required
              />
            </label>
            <label>
              To
              <input type="date" name="to" defaultValue={range.to} required />
            </label>
            <button
              className="icon-button"
              aria-label="Apply date range"
              disabled={loading}
            >
              <RotateCw size={18} className={loading ? "rotating" : ""} />
            </button>
          </div>
        </form>
      )}
      <div className="shop-scene" key={tab}>
        {tab === "overview" && (
          <>
            <div className="shop-hero">
              <div>
                <span className="soft-pill">
                  <span />
                  {isStaff ? "INCYS SHOP" : "SUPPLIER SPACE"}
                </span>
                <h2>
                  {isStaff
                    ? "Good business.\nBetter wellbeing."
                    : "Your stock.\nA shared purpose."}
                </h2>
                <div className="button-row">
                  <button className="button" onClick={() => go("inventory")}>
                    <Package size={18} />
                    Manage stock
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => go("finance")}
                  >
                    View accounts
                    <ArrowUpRight size={17} />
                  </button>
                </div>
              </div>
              <MotionEmblem />
            </div>
            <div className="shop-stats">
              {[
                {
                  label: "Retail sales",
                  value: money(Number(data.summary.sales_paise)),
                  detail: `${data.summary.paid_orders} paid orders`,
                  icon: ShoppingBag,
                  color: "mint",
                  target: "orders",
                },
                {
                  label: "Units sold",
                  value: data.summary.units_sold,
                  detail: "Selected period",
                  icon: Boxes,
                  color: "lilac",
                  target: "orders",
                },
                {
                  label:
                    balance < 0 ? "Credit with supplier" : "Supplier balance",
                  value: money(Math.abs(balance)),
                  detail: "All recorded purchases & payments",
                  icon: Wallet,
                  color: "peach",
                  target: "finance",
                },
                {
                  label: "Low stock",
                  value: low.length,
                  detail: "Products to replenish",
                  icon: Package,
                  color: "blue",
                  target: "inventory",
                },
              ].map(({ label, value, detail, icon: Icon, color, target }) => (
                <button
                  className="shop-stat"
                  key={label}
                  onClick={() => go(target)}
                >
                  <span className={`icon-tile ${color}`}>
                    <Icon size={21} />
                  </span>
                  <small>{label}</small>
                  <strong>{value}</strong>
                  <span>{detail}</span>
                </button>
              ))}
            </div>
            <div className="shop-two">
              <section className="panel">
                <div className="section-title">
                  <h3>Stock watch</h3>
                  <button
                    className="text-link"
                    onClick={() => {
                      setStockFilter("low");
                      go("inventory");
                    }}
                  >
                    View all
                    <ChevronRight size={16} />
                  </button>
                </div>
                {low.length ? (
                  low.slice(0, 5).map((p: any) => (
                    <div className="stock-watch" key={p.id}>
                      <span className="icon-tile peach">
                        <Package size={18} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.sku || p.category}</small>
                      </div>
                      <b>
                        {p.stock}
                        <small>left</small>
                      </b>
                    </div>
                  ))
                ) : (
                  <div className="shop-small-empty">
                    <Check />
                    <span>No stock alerts.</span>
                  </div>
                )}
              </section>
              <section className="panel shop-checklist">
                <h3>Ready for the next step</h3>
                {[
                  {
                    label: "Products",
                    detail: `${data.products.length} in your catalogue`,
                    target: "inventory",
                    icon: Package,
                  },
                  {
                    label: "Supplies",
                    detail: "Receipts & returns",
                    target: "supplies",
                    icon: Truck,
                  },
                  {
                    label: isStaff ? "Invoice settings" : "Business details",
                    detail: isStaff
                      ? data.profile.gstin
                        ? "GSTIN configured"
                        : "GSTIN pending"
                      : data.vendors[0]?.status || "Pending",
                    target: "settings",
                    icon: FileText,
                  },
                ].map(({ label, detail, target, icon: Icon }) => (
                  <button key={label} onClick={() => go(target)}>
                    <span className="icon-tile lilac">
                      <Icon size={19} />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </section>
            </div>
          </>
        )}
        {tab === "inventory" && (
          <>
            <div className="section-title">
              <div>
                <h2>Products & stock</h2>
                <span className="muted">
                  {data.products.length} products · {low.length} low stock
                </span>
              </div>
              <div className="button-row">
                <button
                  className="button secondary small"
                  onClick={() =>
                    csv(
                      "incys-stock.csv",
                      [
                        "Product",
                        "Supplier",
                        "SKU",
                        "HSN",
                        "GST rate %",
                        "Unit",
                        "Available",
                        "Reorder at",
                        "Selling price INR",
                        "Status",
                        "Batch",
                        "Expiry",
                      ],
                      products.map((p: any) => [
                        p.name,
                        p.vendor_name,
                        p.sku,
                        p.hsn_code,
                        p.gst_rate_bps / 100,
                        p.unit,
                        p.stock,
                        p.reorder_level,
                        (p.price_paise / 100).toFixed(2),
                        p.status,
                        p.batch,
                        ymd(p.expires_on),
                      ]),
                    )
                  }
                >
                  <ArrowDownToLine size={17} />
                  Export
                </button>
                {canStock && button("New product", () => productForm(), true)}
              </div>
            </div>
            <div className="filter-chips">
              {[
                ["all", "All"],
                ["low", "Low stock"],
                ["pending", "In review"],
                ["approved", "Published"],
                ["archived", "Archived"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={stockFilter === id ? "active" : ""}
                  onClick={() => setStockFilter(id)}
                  aria-pressed={stockFilter === id}
                >
                  {label}
                </button>
              ))}
            </div>
            <section className="panel">
              <Table
                heads={["Product", "Price", "Available", "Status", "Actions"]}
                empty="Add your first product."
                rows={products.map((p: any) => [
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.sku || p.category} · {p.vendor_name}
                    </small>
                    <small>
                      {p.hsn_code ? `HSN ${p.hsn_code} · ` : ""}
                      {p.gst_rate_bps / 100}% GST
                      {p.expires_on ? ` · Exp. ${ymd(p.expires_on)}` : ""}
                    </small>
                  </div>,
                  money(p.price_paise),
                  <span
                    className={p.stock <= p.reorder_level ? "low-stock" : ""}
                  >
                    {p.stock} {p.unit}
                  </span>,
                  status(p.status),
                  <div className="row-actions">
                    {canStock && (
                      <>
                        {button("Edit", () => productForm(p))}
                        {button("Adjust stock", () => adjustment(p))}
                      </>
                    )}
                    {role === "admin" &&
                      p.status !== "approved" &&
                      button("Publish", () =>
                        act(
                          `products/${p.id}`,
                          { status: "approved" },
                          "PATCH",
                        ),
                      )}
                    {role === "admin" &&
                      p.status !== "archived" &&
                      button("Archive", () =>
                        act(
                          `products/${p.id}`,
                          { status: "archived" },
                          "PATCH",
                        ),
                      )}
                  </div>,
                ])}
              />
            </section>
            <details className="panel stock-history">
              <summary>Stock movement history</summary>
              <Table
                heads={["Date", "Product", "Change", "Balance", "Reason"]}
                rows={data.movements.map((m: any) => [
                  date(m.created_at),
                  m.product_name,
                  <b>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </b>,
                  m.balance,
                  m.reason,
                ])}
              />
              <small>Latest 100 movements in the selected period.</small>
            </details>
          </>
        )}
        {tab === "orders" && (
          <>
            <div className="section-title">
              <h2>Sales</h2>
              <button
                className="button secondary small"
                onClick={() =>
                  csv(
                    "incys-sales.csv",
                    [
                      "Order",
                      "Date",
                      "Product",
                      "Quantity",
                      "Retail amount INR",
                      "Status",
                    ],
                    sales.map((s: any) => [
                      s.order_id,
                      s.created_at,
                      s.product_name,
                      s.quantity,
                      ((s.quantity * s.unit_paise) / 100).toFixed(2),
                      s.order_status,
                    ]),
                  )
                }
              >
                <ArrowDownToLine size={17} />
                Export
              </button>
            </div>
            <section className="panel">
              <Table
                heads={[
                  "Order / item",
                  "Quantity",
                  "Retail total",
                  "Status",
                  "Actions",
                ]}
                empty="Sales will appear after checkout."
                rows={sales.map((s: any) => [
                  <div>
                    <strong>{s.product_name}</strong>
                    <small>
                      #{s.order_id.slice(0, 8).toUpperCase()} ·{" "}
                      {date(s.created_at)}
                    </small>
                    {isStaff && s.address && (
                      <details>
                        <summary>Delivery details</summary>
                        <p>
                          {s.address.name}
                          <br />
                          {s.address.line}, {s.address.city}{" "}
                          {s.address.postcode}
                          <br />
                          {s.address.phone}
                        </p>
                      </details>
                    )}
                  </div>,
                  s.quantity,
                  money(s.quantity * s.unit_paise),
                  <div>
                    {status(s.order_status)}
                    <small>{s.status}</small>
                  </div>,
                  <div className="row-actions">
                    {isStaff && s.invoice_id ? (
                      <InvoiceButton id={s.invoice_id} />
                    ) : (
                      isStaff &&
                      ["paid", "processing", "completed"].includes(
                        s.order_status,
                      ) &&
                      button("Issue invoice", () => issue(s))
                    )}
                    {role === "admin" &&
                      ["paid", "processing"].includes(s.order_status) && (
                        <>
                          {s.status === "pending" &&
                            button("Accept", () =>
                              act(
                                `order-items/${s.id}`,
                                { status: "accepted" },
                                "PATCH",
                              ),
                            )}
                          {s.status === "accepted" &&
                            button("Dispatch", () =>
                              setModal({
                                title: "Dispatch item",
                                fields: [
                                  field(
                                    "trackingReference",
                                    "Tracking reference",
                                  ),
                                ],
                                submit: (v) =>
                                  api(`order-items/${s.id}`, "PATCH", {
                                    ...v,
                                    status: "shipped",
                                  }),
                              }),
                            )}
                          {s.status === "shipped" &&
                            button("Delivered", () =>
                              act(
                                `order-items/${s.id}`,
                                { status: "delivered" },
                                "PATCH",
                              ),
                            )}
                        </>
                      )}
                  </div>,
                ])}
              />
            </section>
            {!isStaff && (
              <p className="shop-footnote">
                Retail sales are shown for your products. Supplier dues are
                based on stock received by INCYS.
              </p>
            )}
            {sales.length >= 500 && (
              <p>Latest 500 lines shown. Narrow the dates before exporting.</p>
            )}
          </>
        )}
        {tab === "supplies" && (
          <>
            <div className="section-title">
              <h2>Supplies & returns</h2>
              {isStaff && button("Receive stock", () => setSupply(true), true)}
            </div>
            <section className="panel">
              <Table
                heads={[
                  "Supplier / reference",
                  "Date",
                  "Items",
                  "Amount",
                  "Actions",
                ]}
                empty={
                  isStaff
                    ? "Receive your first supply."
                    : "INCYS will record your received stock here."
                }
                rows={supplies.map((d: any) => [
                  <div>
                    <strong>{d.vendor_name}</strong>
                    <small>{d.reference}</small>
                    {status(d.kind)}
                  </div>,
                  ymd(d.document_date),
                  <details>
                    <summary>{d.lines.length} item(s)</summary>
                    {d.lines.map((l: any) => (
                      <p key={l.productId}>
                        {l.name} × {l.quantity} · {money(l.unitPaise)} each
                      </p>
                    ))}
                  </details>,
                  money(d.total_paise),
                  <div>
                    {isStaff &&
                      d.kind === "receipt" &&
                      button("Return stock", () => returnForm(d))}
                    {d.note && <small>{d.note}</small>}
                  </div>,
                ])}
              />
            </section>
            <p className="shop-footnote">
              Purchase totals include supplier taxes. These records do not claim
              input tax credit.
            </p>
          </>
        )}
        {tab === "finance" && (
          <>
            <div className="section-title">
              <h2>Institute accounts</h2>
              <button
                className="button secondary small"
                onClick={() =>
                  csv(
                    "incys-supplier-statement.csv",
                    [
                      "Date",
                      "Supplier",
                      "Type",
                      "Reference",
                      "Increase in payable INR",
                    ],
                    statement.map((r) => [
                      ymd(r.when),
                      r.supplier,
                      r.type,
                      r.reference,
                      (r.amount / 100).toFixed(2),
                    ]),
                  )
                }
              >
                <ArrowDownToLine size={17} />
                Export entries
              </button>
            </div>
            <section className="panel">
              <Table
                heads={[
                  "Supplier",
                  "Net purchases",
                  "Paid",
                  "Balance",
                  "Actions",
                ]}
                rows={filter(data.vendors).map((v: any) => {
                  const due = Number(v.purchases_paise) - Number(v.paid_paise);
                  return [
                    v.name,
                    money(Number(v.purchases_paise)),
                    money(Number(v.paid_paise)),
                    <div>
                      <strong>{money(Math.abs(due))}</strong>
                      <small>
                        {due < 0
                          ? "Credit with supplier"
                          : due === 0
                            ? "Settled"
                            : "Payable by INCYS"}
                      </small>
                    </div>,
                    isStaff && due > 0
                      ? button("Record payment", () => payment(v))
                      : null,
                  ];
                })}
              />
              <p className="shop-footnote">
                Balances include all recorded purchases, returns and payments.
              </p>
            </section>
            <section className="panel">
              <div className="statement-period">
                <span>
                  {data.from} — {data.to}
                </span>
                <span>
                  Opening <b>{money(opening)}</b>
                </span>
                <span>
                  Closing <b>{money(closing)}</b>
                </span>
              </div>
              <h3>Account entries</h3>
              <Table
                heads={["Date", "Supplier", "Reference", "Entry", "Amount"]}
                rows={filter(statement).map((r: any) => [
                  ymd(r.when),
                  r.supplier,
                  r.reference,
                  r.type,
                  <span className={r.amount < 0 ? "amount-out" : "amount-in"}>
                    {r.amount < 0 ? "−" : "+"}
                    {money(Math.abs(r.amount))}
                  </span>,
                ])}
              />
            </section>
            {isStaff && (
              <details className="panel">
                <summary>Payment records & corrections</summary>
                <Table
                  heads={["Supplier", "Reference", "Amount", "Date", "Actions"]}
                  rows={payments.map((p: any) => [
                    p.vendor_name,
                    p.reference,
                    money(p.amount_paise),
                    ymd(p.paid_on),
                    p.amount_paise > 0 &&
                    !data.payments.some((x: any) => x.reverses_id === p.id)
                      ? button("Correct record", () => reversal(p))
                      : status("recorded"),
                  ])}
                />
              </details>
            )}
            {(data.documents.length >= 500 || data.payments.length >= 500) && (
              <p className="error">
                Latest 500 receipts and payments shown. Narrow the date range
                for a complete export.
              </p>
            )}
          </>
        )}
        {tab === "invoices" && isStaff && (
          <>
            <div className="section-title">
              <h2>Invoices & credit notes</h2>
              <button
                className="button secondary small"
                onClick={() =>
                  csv(
                    "incys-invoice-register.csv",
                    [
                      "Number",
                      "Kind",
                      "Order",
                      "Date",
                      "Buyer GSTIN",
                      "Place of supply state",
                      "Original invoice",
                      "Value INR",
                      "CGST INR",
                      "SGST or UTGST INR",
                      "IGST INR",
                      "Total INR",
                    ],
                    data.invoices.map((i: any) => [
                      i.number,
                      i.kind,
                      i.order_id,
                      i.created_at,
                      i.buyer_gstin || "",
                      i.supply_state,
                      i.original_number || "",
                      ...["net", "cgst", "sgst", "igst"].map((k) =>
                        (
                          (i.totals[k] / 100) *
                          (i.kind === "credit_note" ? -1 : 1)
                        ).toFixed(2),
                      ),
                      (
                        (i.total_paise / 100) *
                        (i.kind === "credit_note" ? -1 : 1)
                      ).toFixed(2),
                    ]),
                  )
                }
              >
                <ArrowDownToLine size={17} />
                Export register
              </button>
            </div>
            {!data.profile.gstin && (
              <div className="shop-setup-note">
                <FileText />
                <span>
                  GSTIN is blank. Complete invoice settings before issuing.
                </span>
                <button className="text-link" onClick={settingsForm}>
                  Settings
                </button>
              </div>
            )}
            <section className="panel">
              <Table
                heads={["Document", "Order", "Date", "Amount", "Open"]}
                empty="Issue invoices from paid sales."
                rows={filter(data.invoices).map((i: any) => [
                  <div>
                    <strong>{i.number}</strong>
                    <small>{i.kind.replace("_", " ")}</small>
                  </div>,
                  i.order_id.slice(0, 8).toUpperCase(),
                  date(i.created_at),
                  money(i.total_paise),
                  <InvoiceButton id={i.id} />,
                ])}
              />
            </section>
          </>
        )}
        {tab === "settings" && (
          <>
            {isStaff && (
              <section className="panel shop-settings-card">
                <span className="icon-tile lilac">
                  <FileText />
                </span>
                <h2>Institute invoicing</h2>
                <h3>{data.profile.legal_name}</h3>
                <dl>
                  <div>
                    <dt>GSTIN</dt>
                    <dd>
                      {data.profile.gstin || (
                        <span className="blank-gstin" aria-label="GSTIN blank">
                          ________________
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{data.profile.address || "Add registered address"}</dd>
                  </div>
                  <div>
                    <dt>Registration</dt>
                    <dd>{data.profile.registration.replace("_", " ")}</dd>
                  </div>
                </dl>
                {button("Edit invoice settings", settingsForm, true)}
                <p className="shop-footnote">
                  INCYS issues customer invoices. Supplier purchase records are
                  maintained separately.
                </p>
              </section>
            )}
            <section className="panel">
              <div className="section-title">
                <h2>{isStaff ? "Suppliers" : "Your business"}</h2>
                {role === "admin" &&
                  button(
                    "Add supplier",
                    () =>
                      setModal({
                        title: "Add supplier",
                        hint: "Use the email the supplier has already used to sign in to INCYS.",
                        fields: [
                          field("email", "Supplier email", "", "email"),
                          field("name", "Business name"),
                          field(
                            "address",
                            "Business address",
                            "",
                            "textarea",
                            false,
                          ),
                          field("gstin", "GSTIN", "", "text", false),
                        ],
                        submit: (v) => api("shop/suppliers", "POST", v),
                      }),
                    true,
                  )}
              </div>
              <Table
                heads={["Business", "Status", "GSTIN", "Actions"]}
                rows={data.vendors.map((v: any) => [
                  v.name,
                  status(v.status),
                  v.gstin || "—",
                  <div className="row-actions">
                    {canStock && button("Edit details", () => profileForm(v))}
                    {role === "admin" &&
                      button(
                        v.status === "approved" ? "Suspend" : "Approve",
                        () =>
                          act(
                            `vendors/${v.id}`,
                            {
                              status:
                                v.status === "approved"
                                  ? "suspended"
                                  : "approved",
                            },
                            "PATCH",
                          ),
                      )}
                  </div>,
                ])}
              />
            </section>
          </>
        )}
      </div>
      {modal && (
        <FormModal modal={modal} close={() => setModal(null)} done={done} />
      )}
      {supply && (
        <SupplySheet data={data} close={() => setSupply(false)} done={done} />
      )}
      {invoice && (
        <InvoiceView record={invoice} close={() => setInvoice(null)} />
      )}
    </section>
  );
}

function SupplySheet({
  data,
  close,
  done,
}: {
  data: any;
  close: () => void;
  done: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useRef(crypto.randomUUID());
  const [vendor, setVendor] = useState(""),
    [lines, setLines] = useState([
      { key: crypto.randomUUID(), productId: "", quantity: 1, price: "" },
    ]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    return () => trigger?.focus();
  }, []);
  function update(i: number, changes: any) {
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...changes } : l)));
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("shop/supplies", "POST", {
        vendorId: vendor,
        reference: f.get("reference"),
        documentDate: f.get("documentDate"),
        note: f.get("note") || "",
        idempotencyKey: id.current,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPaise: Math.round(Number(l.price) * 100),
        })),
      });
      done();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal-backdrop native-dialog supply-dialog"
      aria-labelledby="supply-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <section className="modal">
        <div className="modal-heading">
          <h2 id="supply-title">Receive supplier stock</h2>
          <button
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={close}
          >
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Supplier
              <select
                required
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value);
                  setLines([
                    {
                      key: crypto.randomUUID(),
                      productId: "",
                      quantity: 1,
                      price: "",
                    },
                  ]);
                }}
              >
                <option value="">Choose supplier</option>
                {data.vendors
                  .filter((v: any) => v.status === "approved")
                  .map((v: any) => (
                    <option value={v.id} key={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Supplier invoice / receipt reference
              <input name="reference" required minLength={2} maxLength={200} />
            </label>
            <label>
              Receipt date
              <input
                type="date"
                name="documentDate"
                required
                defaultValue={today()}
                max={today()}
              />
            </label>
          </div>
          <div className="supply-lines">
            {lines.map((l, i) => (
              <div className="supply-line" key={l.key}>
                <label>
                  Product {i + 1}
                  <select
                    value={l.productId}
                    required
                    onChange={(e) => update(i, { productId: e.target.value })}
                  >
                    <option value="">Choose product</option>
                    {data.products
                      .filter((p: any) => p.vendor_id === vendor)
                      .map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Units
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    required
                    value={l.quantity}
                    onChange={(e) =>
                      update(i, { quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Unit cost (₹, inclusive)
                  <input
                    type="number"
                    min="0.01"
                    max="100000"
                    step="0.01"
                    required
                    value={l.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                  />
                </label>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove product ${i + 1}`}
                  disabled={lines.length === 1 || busy}
                  onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="text-link"
            disabled={lines.length >= 30 || busy}
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  key: crypto.randomUUID(),
                  productId: "",
                  quantity: 1,
                  price: "",
                },
              ])
            }
          >
            <Plus size={17} />
            Add item
          </button>
          <label>
            Note
            <textarea name="note" maxLength={300} rows={2} />
          </label>
          <div className="supply-total">
            <span>Supplier payable</span>
            <strong>
              {money(
                lines.reduce(
                  (n, l) => n + Math.round(Number(l.price) * 100) * l.quantity,
                  0,
                ),
              )}
            </strong>
          </div>
          <label className="check">
            <input type="checkbox" required />I have checked the stock received
            and supplier document.
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Receive stock"}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  );
}
