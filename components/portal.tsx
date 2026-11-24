"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomNav, type Destination } from "./app-navigation";
import { BookingSheet } from "./booking-sheet";
import { MotionEmblem } from "./motion-emblem";
import { WellnessArt } from "./wellness-art";
import {
  Leaf,
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingBag,
  Users,
  Wallet,
  MessageSquare,
  ClipboardList,
  Bell,
  LogOut,
  Plus,
  X,
  Check,
  HeartPulse,
  Settings,
  Menu,
  Search,
  FileCheck,
  Package,
  ChevronDown,
  ChevronRight,
  UserRound,
  Smartphone,
} from "lucide-react";
import { api, money, date, logout, preferredRole } from "@/lib/client";
import { FormModal, type Field, type Modal } from "./form-modal";
import { ShopConsole, SupplierBottomNav } from "./shop-console";
import { InvoiceButton } from "./invoice-view";
import { states } from "@/lib/india";
import { QuizComposer } from "./quiz-composer";
import { Documents, DocumentDownload } from "./documents";
const icons: Record<string, any> = {
  account: UserRound,
  shopdesk: ShoppingBag,
  supplies: Package,
  settings: Settings,
  overview: LayoutDashboard,
  appointments: CalendarDays,
  plans: HeartPulse,
  learning: BookOpen,
  teaching: BookOpen,
  admissions: Users,
  shop: ShoppingBag,
  orders: Package,
  inventory: Package,
  vendors: Users,
  enquiries: MessageSquare,
  finance: Wallet,
  team: Users,
  content: ClipboardList,
  audit: FileCheck,
  support: MessageSquare,
  notifications: Bell,
};
const menus: Record<string, string[]> = {
  admin: [
    "overview",
    "shopdesk",
    "appointments",
    "admissions",
    "teaching",
    "vendors",
    "inventory",
    "orders",
    "enquiries",
    "finance",
    "team",
    "content",
    "audit",
    "support",
  ],
  clinician: ["overview", "appointments", "plans", "support"],
  reception: ["overview", "appointments", "enquiries", "support"],
  finance: ["overview", "shopdesk", "finance", "admissions", "support"],
  patient: [
    "overview",
    "learning",
    "appointments",
    "plans",
    "shop",
    "orders",
    "finance",
    "support",
    "notifications",
  ],
  student: [
    "overview",
    "learning",
    "appointments",
    "shop",
    "orders",
    "finance",
    "support",
    "notifications",
  ],
  trainer: ["overview", "teaching", "admissions", "support", "notifications"],
  vendor: [
    "overview",
    "inventory",
    "orders",
    "supplies",
    "finance",
    "settings",
    "support",
    "notifications",
  ],
};
const names: Record<string, string> = {
  account: "Account",
  shopdesk: "Shop management",
  supplies: "Supplies & returns",
  settings: "Business details",
  overview: "Overview",
  appointments: "Appointments",
  plans: "Care plans",
  learning: "My learning",
  teaching: "Academic workspace",
  admissions: "Students & admissions",
  shop: "Wellness store",
  orders: "Orders",
  inventory: "Products & stock",
  vendors: "Vendor partners",
  enquiries: "Enquiries",
  finance: "Payments & statements",
  team: "People & access",
  content: "Content & services",
  audit: "Audit history",
  support: "Support",
  notifications: "Notifications",
};
const roleNames: Record<string, string> = {
  admin: "Institute administration",
  patient: "Patient & customer",
  student: "Student learning",
  trainer: "Faculty workspace",
  vendor: "Vendor partner",
  clinician: "Practitioner workspace",
  reception: "Reception workspace",
  finance: "Finance workspace",
};
const status = (s: string) => (
  <span className={`badge badge-${s}`}>{s?.replaceAll("_", " ")}</span>
);
const opts = (items: any[], label = "name", value = "id") =>
  items.map((x) => ({ value: x[value], label: x[label] }));
const select = (
  name: string,
  label: string,
  options: { value: string; label: string }[],
): Field => ({ name, label, type: "select", options });
function DataTable({
  head,
  rows: rs,
  empty = "Nothing here yet.",
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return rs.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rs.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} data-label={head[j]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">
      <ClipboardList size={30} />
      <h3>{empty}</h3>
    </div>
  );
}
export function Portal({ role }: { role: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const consumer = ["patient", "student"].includes(role);
  const allowedTabs = [
    ...(menus[role] || []),
    ...(["admin", "trainer"].includes(role) ? ["learning"] : []),
    "account",
  ];
  const tab = allowedTabs.includes(searchParams.get("tab") || "")
    ? searchParams.get("tab")!
    : "overview";
  function setTab(next: string) {
    if (!allowedTabs.includes(next)) {
      router.push(
        next === "learning"
          ? "/learn"
          : next === "shop"
            ? "/shop"
            : next === "appointments"
              ? "/care"
              : `/portal/${role}?tab=account`,
      );
      return;
    }
    setSearch("");
    setDetail(null);
    setSidebar(false);
    router.push(`/portal/${role}${next === "overview" ? "" : `?tab=${next}`}`, {
      scroll: true,
    });
  }
  const [data, setData] = useState<any>(null),
    [catalog, setCatalog] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [booking, setBooking] = useState(false),
    [modal, setModal] = useState<Modal | null>(null),
    [demo, setDemo] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [search, setSearch] = useState(""),
    [cart, setCart] = useState<Record<string, number>>({}),
    [detail, setDetail] = useState<any>(null),
    [quizComposer, setQuizComposer] = useState(false),
    [notes, setNotes] = useState<{ id: string; items: any[] } | null>(null);
  const admin = role === "admin",
    trainer = role === "trainer",
    clinician = role === "clinician",
    vendor = role === "vendor";
  const shopView =
    (vendor &&
      [
        "overview",
        "inventory",
        "orders",
        "supplies",
        "finance",
        "settings",
      ].includes(tab)) ||
    (["admin", "finance"].includes(role) &&
      ["shopdesk", "inventory", "orders", "vendors"].includes(tab));
  async function refresh() {
    try {
      const [d, c, config] = await Promise.all([
        api("workspace"),
        api("catalog"),
        api("config"),
      ]);
      if (!d.user.roles.includes(role)) {
        window.location.href = `/portal/${preferredRole(d.user.roles)}`;
        return;
      }
      setData(d);
      setCatalog(c);
      setDemo(config.demo);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [role]);
  useEffect(() => {
    setSearch("");
    if (tab !== "learning") setDetail(null);
  }, [tab]);
  useEffect(() => {
    if (!sidebar) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>(".sidebar");
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],select",
        ) || [],
      ).filter((el) => el.getClientRects().length);
    focusable()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebar(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [sidebar]);
  const act = async (fn: () => Promise<any>, message = "Changes saved.") => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const mutate = (
    path: string,
    body: any = {},
    method = "POST",
    message = "Changes saved.",
  ) => act(() => api(path, method, body), message);
  const open = (
    title: string,
    path: string,
    fields: Field[],
    method = "POST",
  ) => setModal({ title, fields, submit: (v) => api(path, method, v) });
  const filter = (rs: any[]) =>
    rs.filter(
      (r) =>
        !search ||
        JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
    );
  const button = (label: string, fn: () => void, kind = "secondary") => (
    <button
      className={`button tiny ${kind}`}
      onClick={fn}
      disabled={busy || label === "Already applied"}
    >
      {label}
    </button>
  );
  async function pay(referenceType: string, referenceId: string) {
    await act(
      async () => {
        const p = await api("payments", "POST", { referenceType, referenceId });
        if (p.mode === "demo") {
          await api("payments/demo", "POST", { paymentId: p.id });
          return;
        }
        const w = window as any;
        if (!w.Razorpay)
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://checkout.razorpay.com/v1/checkout.js";
            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error("Payment checkout could not load."));
            document.body.appendChild(script);
          });
        const checkout = new w.Razorpay({
          key: p.keyId,
          amount: p.amount_paise,
          currency: p.currency,
          order_id: p.provider_order_id,
          name: "INCYS",
          handler: () => {
            setNotice(
              "Payment submitted. Confirmation appears after provider verification.",
            );
            refresh();
          },
        });
        checkout.open();
      },
      demo
        ? "Simulated payment recorded. No money was collected."
        : "Checkout opened. Payment is confirmed only after provider verification.",
    );
  }
  async function learn(id: string) {
    await act(async () => {
      const course = await api(`enrolments/${id}`);
      router.push(`/portal/${role}?tab=learning`, { scroll: true });
      setDetail(course);
    }, "Course loaded.");
  }
  function askAboutCare() {
    open("Ask about appointments", "tickets", [
      { name: "subject", label: "Subject", value: "Appointment availability" },
      {
        name: "message",
        label: "How can the care team help?",
        type: "textarea",
      },
    ]);
  }
  function book() {
    if (!catalog.services.length || !catalog.practitioners.length) {
      askAboutCare();
      return;
    }
    setBooking(true);
  }
  function newClass() {
    open("Schedule a class", "classes", [
      select("cohortId", "Cohort", opts(data.cohorts)),
      { name: "title", label: "Class title" },
      {
        name: "startsAt",
        label: "Starts (your device time zone)",
        type: "datetime-local",
      },
      {
        name: "durationMinutes",
        label: "Duration in minutes",
        type: "number",
        value: 60,
        min: 10,
        max: 480,
      },
      {
        name: "meetingUrl",
        label: "Private meeting URL (optional)",
        type: "url",
        required: false,
      },
    ]);
  }
  function newAssignment() {
    open("Create an assignment", "assignments", [
      select("cohortId", "Cohort", opts(data.cohorts)),
      { name: "title", label: "Assignment title" },
      { name: "instructions", label: "Instructions", type: "textarea" },
      {
        name: "dueAt",
        label: "Due (your device time zone)",
        type: "datetime-local",
      },
      {
        name: "maxScore",
        label: "Maximum marks",
        type: "number",
        value: 100,
        min: 1,
      },
      {
        name: "passScore",
        label: "Pass marks",
        type: "number",
        value: 60,
        min: 0,
      },
    ]);
  }
  function newProduct() {
    open("Submit a product for review", "products", [
      { name: "name", label: "Product name" },
      { name: "category", label: "Category" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "pricePaise", label: "Price (₹)", type: "money", min: 1 },
      { name: "stock", label: "Available units", type: "number", min: 0 },
      {
        name: "regulated",
        label: "This is a regulated medicinal or supplement product",
        type: "checkbox",
      },
      { name: "licenceReference", label: "Licence reference", required: false },
      { name: "batch", label: "Batch / lot", required: false },
      { name: "expiresOn", label: "Expiry", type: "date", required: false },
    ]);
  }
  const appointmentRows = () =>
    filter(data.appointments).map((a: any) => [
      <div>
        <strong>{a.service_name}</strong>
        <small>
          {role === "patient" || role === "student"
            ? a.practitioner_name
            : a.patient_name}
        </small>
      </div>,
      <div>
        {date(a.starts_at)}
        <small>{a.mode.replace("_", " ")}</small>
      </div>,
      status(a.status),
      <div>
        {money(a.price_paise)}
        <small>{a.payment_status}</small>
      </div>,
      <div className="row-actions">
        {a.status === "confirmed" && (
          <>
            {button("Cancel", () =>
              mutate(`appointments/${a.id}`, { status: "cancelled" }, "PATCH"),
            )}
            {["admin", "clinician", "reception"].includes(role) &&
              button("Complete", () =>
                mutate(
                  `appointments/${a.id}`,
                  { status: "completed" },
                  "PATCH",
                ),
              )}
            {a.patient_id === data.user.id &&
              a.payment_status === "due" &&
              button(
                demo ? "Demo payment" : "Pay",
                () => pay("appointment", a.id),
                "",
              )}
          </>
        )}
        {a.mode === "online" && a.status === "confirmed" && (
          <>
            {["admin", "reception", "clinician"].includes(role) &&
              button("Set meeting", () =>
                open("Set consultation link", `appointments/${a.id}/meeting`, [
                  {
                    name: "meetingUrl",
                    label: "Private HTTPS meeting URL",
                    type: "url",
                  },
                ]),
              )}
            {(clinician || a.patient_id === data.user.id) &&
              button("Join consultation", () =>
                act(async () => {
                  const r = await api(`appointments/${a.id}/join`, "POST", {});
                  window.location.assign(r.url);
                }, "Opening consultation."),
              )}
          </>
        )}
        {(clinician || a.patient_id === data.user.id) &&
          button("Records", () =>
            act(
              async () =>
                setNotes({
                  id: a.id,
                  items: await api(`appointments/${a.id}/notes`),
                }),
              "Records opened.",
            ),
          )}
      </div>,
    ]);
  if (loading)
    return (
      <main className="loading">
        <Leaf size={36} />
        <h2>Opening your workspace…</h2>
      </main>
    );
  if (!data)
    return (
      <main className="loading">
        <h2>Sign in to your institute</h2>
        <p className="error">{error}</p>
        <Link className="button" href="/login">
          Sign in
        </Link>
      </main>
    );
  const cohorts = data.cohorts || [];
  return (
    <div
      className={`app-shell ${consumer ? "consumer-workspace" : "staff-workspace"}`}
    >
      <aside
        className={`sidebar ${sidebar ? "open" : ""}`}
        aria-label="Workspace navigation"
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Close sidebar"
          onClick={() => setSidebar(false)}
        >
          <X size={20} />
        </button>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Leaf />
          </span>
          INCYS<span>Connected institute</span>
        </Link>
        <div className="workspace-label">{roleNames[role]}</div>
        <nav>
          {[...(menus[role] || menus.patient), "account"].map((t) => {
            const Icon = icons[t];
            return (
              <button
                className={tab === t ? "active" : ""}
                aria-current={tab === t ? "page" : undefined}
                key={t}
                onClick={() => {
                  setTab(t);
                  setSearch("");
                  setDetail(null);
                  setSidebar(false);
                }}
              >
                <Icon size={19} />
                {names[t]}
                {t === "notifications" &&
                  data.notifications.some((n: any) => !n.read_at) && (
                    <span className="notification-dot" />
                  )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-profile">
            <span className="avatar">{data.user.name.slice(0, 1)}</span>
            <div>
              <strong>{data.user.name}</strong>
              <small>{roleNames[role]}</small>
            </div>
          </div>
          {data.user.roles.length > 1 && (
            <select
              aria-label="Switch workspace"
              value={role}
              onChange={(e) =>
                (window.location.href = `/portal/${e.target.value}`)
              }
            >
              {data.user.roles.map((r: string) => (
                <option key={r} value={r}>
                  {roleNames[r] || r}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() =>
              act(async () => {
                await logout();
                window.location.href = "/login";
              })
            }
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open sidebar"
              onClick={() => setSidebar(!sidebar)}
            >
              <Menu />
            </button>
            <span>{roleNames[role]}</span>
            <span>/</span>
            <strong>{names[tab]}</strong>
          </div>
          <div className="header-actions">
            <span className="timezone">Times shown in IST</span>
            <Link href="/">Explore INCYS</Link>
            <Link
              href={`/portal/${role}?tab=account`}
              className="avatar small-avatar"
              aria-label="Open account"
            >
              {data.user.name.slice(0, 1)}
            </Link>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            Development preview · Synthetic data · Payments are simulated
          </div>
        )}
        <main className="workspace-content">
          <div className="page-heading" key={tab}>
            <div>
              <h1>
                {tab === "overview"
                  ? `Welcome, ${data.user.name.split(" ")[0]}.`
                  : names[tab]}
              </h1>
            </div>
            <div className="button-row">
              {["patient", "student"].includes(role) &&
                tab === "appointments" &&
                button("Book appointment", book, "")}
              {tab === "teaching" && button("Schedule class", newClass, "")}
              {tab === "support" &&
                button(
                  "New support request",
                  () =>
                    open("New support request", "tickets", [
                      { name: "subject", label: "Subject" },
                      {
                        name: "message",
                        label: "How can we help?",
                        type: "textarea",
                      },
                    ]),
                  "",
                )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              <Check size={17} />
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab !== "overview" && tab !== "account" && !detail && !shopView && (
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="Search this view"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this view…"
              />
            </div>
          )}
          {tab === "account" && (
            <section className="workspace-account">
              <div className="profile-card">
                <span className="avatar">{data.user.name.slice(0, 1)}</span>
                <div>
                  <h2>{data.user.name}</h2>
                  <p>{data.user.email}</p>
                  <small>{roleNames[role]}</small>
                </div>
              </div>
              <div className="account-link-grid">
                {[
                  {
                    tab: "appointments",
                    label: "My appointments",
                    detail: "Bookings & visits",
                    icon: CalendarDays,
                    tint: "mint",
                  },
                  {
                    tab: "learning",
                    label: "My learning",
                    detail: "Courses & progress",
                    icon: BookOpen,
                    tint: "lilac",
                  },
                  {
                    tab: "plans",
                    label: "Care plans",
                    detail: "Your practitioner’s guidance",
                    icon: HeartPulse,
                    tint: "mint",
                  },
                  {
                    tab: "orders",
                    label: "Orders",
                    detail: "Track your purchases",
                    icon: Package,
                    tint: "peach",
                  },
                  {
                    tab: "finance",
                    label: "Payments",
                    detail: "Receipts & statements",
                    icon: Wallet,
                    tint: "blue",
                  },
                  {
                    tab: "notifications",
                    label: "Notifications",
                    detail: "Your latest updates",
                    icon: Bell,
                    tint: "lilac",
                  },
                  {
                    tab: "support",
                    label: "Documents & support",
                    detail: "Files, help & privacy",
                    icon: MessageSquare,
                    tint: "mint",
                  },
                ]
                  .filter((item) => allowedTabs.includes(item.tab))
                  .map((item) => (
                    <button
                      className="context-row"
                      key={item.tab}
                      onClick={() => setTab(item.tab)}
                    >
                      <span className={`icon-tile ${item.tint}`}>
                        <item.icon size={21} />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
              </div>
              {data.user.roles.length > 1 && (
                <label className="workspace-switch">
                  Switch workspace
                  <select
                    value={role}
                    onChange={(e) =>
                      router.push(`/portal/${e.target.value}?tab=account`)
                    }
                  >
                    {data.user.roles.map((r: string) => (
                      <option key={r} value={r}>
                        {roleNames[r] || r}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <details className="install-guide">
                <summary>
                  <Smartphone size={21} />
                  <span>Install INCYS on your phone</span>
                  <ChevronRight size={18} />
                </summary>
                <p>
                  iPhone: open in Safari → Share → Add to Home Screen. Android:
                  open the browser menu → Install app. Your account works across
                  devices.
                </p>
              </details>
              <button
                className="button secondary account-signout"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await logout();
                    window.location.href = "/login";
                  })
                }
              >
                <LogOut size={18} />
                Sign out
              </button>
            </section>
          )}
          {shopView && (
            <ShopConsole
              role={role}
              initialTab={
                tab === "shopdesk"
                  ? "overview"
                  : tab === "vendors"
                    ? "settings"
                    : tab
              }
            />
          )}
          {tab === "overview" && !shopView && (
            <>
              {consumer && (
                <div className="workspace-hero">
                  <section className="wellness-hero">
                    <div className="wellness-copy">
                      <span className="soft-pill">
                        <span /> YOUR SPACE TO FEEL BETTER
                      </span>
                      <h2>
                        A little care.
                        <br />A fresh start.
                      </h2>
                      <p>Your next step is right here.</p>
                      <button className="button" onClick={book}>
                        Book care
                      </button>
                    </div>
                    {admin || role === "finance" ? (
                      <MotionEmblem variant="growth" />
                    ) : (
                      <WellnessArt />
                    )}
                  </section>
                </div>
              )}
              <div className="metric-grid">
                {[
                  {
                    label: vendor
                      ? "Products"
                      : trainer
                        ? "Assigned cohorts"
                        : "Upcoming appointments",
                    value: vendor
                      ? data.vendorProducts.length
                      : trainer
                        ? cohorts.length
                        : data.appointments.filter(
                            (a: any) =>
                              a.status === "confirmed" &&
                              new Date(a.starts_at) > new Date(),
                          ).length,
                    icon: vendor ? Package : CalendarDays,
                    target: vendor
                      ? "inventory"
                      : trainer
                        ? "teaching"
                        : "appointments",
                  },
                  {
                    label: admin
                      ? "Active learners"
                      : vendor
                        ? "Order items"
                        : "My enrolments",
                    value: vendor
                      ? data.orders.length
                      : admin
                        ? data.enrolments.filter(
                            (e: any) => e.status === "active",
                          ).length
                        : data.enrolments.length,
                    icon: BookOpen,
                    target: vendor
                      ? "orders"
                      : admin || trainer
                        ? "admissions"
                        : "learning",
                  },
                  {
                    label:
                      admin || role === "reception"
                        ? "Open enquiries"
                        : "Open support requests",
                    value:
                      admin || role === "reception"
                        ? data.enquiries.filter(
                            (e: any) =>
                              !["closed", "resolved"].includes(e.status),
                          ).length
                        : data.tickets.filter(
                            (t: any) => t.status !== "resolved",
                          ).length,
                    icon: MessageSquare,
                    target:
                      admin || role === "reception" ? "enquiries" : "support",
                  },
                  {
                    label: vendor
                      ? "Vendor payable"
                      : admin || role === "finance"
                        ? "Captured payments"
                        : "Payments made",
                    value: money(
                      vendor
                        ? -(data.vendorLedger || []).reduce(
                            (a: number, l: any) => a + l.amount_paise,
                            0,
                          )
                        : data.payments
                            .filter((p: any) => p.status === "captured")
                            .reduce(
                              (a: number, p: any) => a + p.amount_paise,
                              0,
                            ),
                    ),
                    icon: Wallet,
                    target: "finance",
                  },
                ].map((m) => (
                  <button
                    className="metric"
                    disabled={!allowedTabs.includes(m.target)}
                    key={m.label}
                    onClick={() => {
                      if (menus[role].includes(m.target)) setTab(m.target);
                    }}
                  >
                    <span>
                      <span className="metric-icon">
                        <m.icon size={20} />
                      </span>
                      {m.label}
                    </span>
                    <strong>{m.value}</strong>
                    <small>From your current records</small>
                  </button>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      {trainer
                        ? "Teaching calendar"
                        : vendor
                          ? "Recent order activity"
                          : "Your appointment calendar"}
                    </h2>
                    <button
                      className="text-link"
                      onClick={() =>
                        setTab(
                          trainer
                            ? "teaching"
                            : vendor
                              ? "orders"
                              : "appointments",
                        )
                      }
                    >
                      View all
                    </button>
                  </div>
                  {trainer ? (
                    <DataTable
                      head={["Class", "When", "Status"]}
                      rows={(data.classes || [])
                        .slice(0, 5)
                        .map((c: any) => [
                          c.title,
                          date(c.starts_at),
                          status(c.status),
                        ])}
                    />
                  ) : vendor ? (
                    <DataTable
                      head={["Product", "Quantity", "Status"]}
                      rows={data.orders
                        .slice(0, 5)
                        .map((i: any) => [
                          i.product_name,
                          i.quantity,
                          status(i.status),
                        ])}
                    />
                  ) : (
                    <DataTable
                      head={["Service", "When", "Status"]}
                      rows={data.appointments
                        .filter((a: any) => a.status === "confirmed")
                        .slice(0, 5)
                        .map((a: any) => [
                          <div>
                            <strong>{a.service_name}</strong>
                            <small>{a.practitioner_name}</small>
                          </div>,
                          date(a.starts_at),
                          status(a.status),
                        ])}
                    />
                  )}
                </section>
                <aside className="welcome-card">
                  <span className="round-icon">
                    <Leaf />
                  </span>
                  <p className="eyebrow">MAKE THE MOST OF YOUR SPACE</p>
                  <h2>{studentTitle(role)}</h2>
                  <p>{studentDescription(role)}</p>
                  <button
                    className="button"
                    onClick={() =>
                      setTab(
                        vendor
                          ? "inventory"
                          : trainer
                            ? "teaching"
                            : admin
                              ? "admissions"
                              : role === "student"
                                ? "learning"
                                : "appointments",
                      )
                    }
                  >
                    {vendor
                      ? "Manage products"
                      : trainer
                        ? "Open teaching space"
                        : admin
                          ? "Review admissions"
                          : role === "student"
                            ? "Continue learning"
                            : "View appointments"}
                  </button>
                </aside>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Institute notices</h2>
                  <span className="muted">Updates from the team</span>
                </div>
                {!(data.notices || catalog.announcements).length && (
                  <p className="quiet-empty">
                    You’re all caught up. Institute updates will appear here.
                  </p>
                )}
                {(data.notices || catalog.announcements).map((a: any) => (
                  <article className="notice-item" key={a.id}>
                    <span className="round-icon">
                      <Bell size={18} />
                    </span>
                    <div>
                      <h3>{a.title}</h3>
                      <p>{a.body}</p>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
          {tab === "appointments" && (
            <>
              <section className="panel">
                <DataTable
                  head={[
                    "Service & person",
                    "Schedule",
                    "Status",
                    "Fee",
                    "Actions",
                  ]}
                  rows={appointmentRows()}
                />
              </section>
              {["admin", "reception", "clinician"].includes(role) && (
                <div className="section-toolbar">
                  {button("Add availability", () =>
                    open("Practitioner availability", "availability", [
                      select(
                        "practitionerId",
                        "Practitioner",
                        opts(catalog.practitioners),
                      ),
                      {
                        name: "startsAt",
                        label: "Start (device time zone)",
                        type: "datetime-local",
                      },
                      {
                        name: "endsAt",
                        label: "End (device time zone)",
                        type: "datetime-local",
                      },
                    ]),
                  )}
                </div>
              )}
              <p className="section-note">
                Bookings use the practitioner’s published availability.
                Conflicting times are rejected. Paid cancellations require a
                separate refund review.
              </p>
            </>
          )}
          {tab === "plans" && (
            <>
              <div className="section-toolbar">
                {clinician &&
                  button(
                    "Create care plan",
                    () =>
                      open("Create care plan", "plans", [
                        select(
                          "patientId",
                          "Patient",
                          Array.from(
                            new Map(
                              data.appointments.map((a: any) => [
                                a.patient_id,
                                { value: a.patient_id, label: a.patient_name },
                              ]),
                            ).values(),
                          ) as any,
                        ),
                        { name: "title", label: "Plan title" },
                        {
                          name: "instructions",
                          label: "Practitioner instructions",
                          type: "textarea",
                        },
                        {
                          name: "sessionsTotal",
                          label: "Total sessions",
                          type: "number",
                          min: 1,
                          max: 100,
                        },
                      ]),
                    "",
                  )}
              </div>
              <div className="cards two">
                {filter(data.plans).map((p: any) => (
                  <article className="panel" key={p.id}>
                    <div className="panel-heading">
                      <h3>{p.title}</h3>
                      {status(p.status)}
                    </div>
                    <p className="muted">{p.patient_name}</p>
                    <p className="preserve-text">{p.instructions}</p>
                    <progress
                      max={p.sessions_total}
                      value={p.sessions_completed}
                    />
                    <p>
                      {p.sessions_completed} of {p.sessions_total} sessions
                      completed
                    </p>
                    {clinician &&
                      p.status === "active" &&
                      button("Record session", () =>
                        open(
                          "Record treatment session",
                          `plans/${p.id}/sessions`,
                          [
                            {
                              name: "note",
                              label: "Session note",
                              type: "textarea",
                            },
                          ],
                        ),
                      )}
                  </article>
                ))}
              </div>
              {!data.plans.length && (
                <div className="panel empty">
                  No care plans have been assigned yet.
                </div>
              )}
            </>
          )}
          {tab === "learning" && !detail && (
            <>
              <div className="cards two">
                {filter(data.enrolments).map((e: any) => (
                  <article className="panel course-summary" key={e.id}>
                    <div className="panel-heading">
                      <span className="round-icon">
                        <BookOpen />
                      </span>
                      {status(e.status)}
                    </div>
                    <h2>{e.course_title}</h2>
                    <p>{e.cohort_name}</p>
                    <progress
                      value={e.completed_lessons}
                      max={e.total_lessons || 1}
                    />
                    <p className="muted">
                      {e.completed_lessons} of {e.total_lessons} lessons
                      completed
                    </p>
                    <div className="card-bottom">
                      <span>
                        {money(e.fee_paise - e.paid_paise)} outstanding
                      </span>
                      {["active", "completed"].includes(e.status) &&
                        button("Open course", () => learn(e.id), "")}
                    </div>
                    {e.paid_paise < e.fee_paise &&
                      button(demo ? "Simulate fee payment" : "Pay fees", () =>
                        pay("enrolment", e.id),
                      )}
                  </article>
                ))}
              </div>
              {!data.enrolments.length && !catalog.cohorts.length && (
                <section className="app-empty lilac">
                  <BookOpen size={44} strokeWidth={1.3} />
                  <h2>Your next chapter awaits.</h2>
                  <p>
                    Ask the academic team about upcoming courses and intakes.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      open("Course enquiry", "tickets", [
                        {
                          name: "subject",
                          label: "Subject",
                          value: "Courses & upcoming intakes",
                        },
                        {
                          name: "message",
                          label: "What would you like to study?",
                          type: "textarea",
                        },
                      ])
                    }
                  >
                    Ask about courses
                  </button>
                </section>
              )}
              {catalog.cohorts.length > 0 && (
                <h2 className="spaced-heading">Explore upcoming intakes</h2>
              )}
              <div className="cards two">
                {catalog.cohorts.map((c: any) => (
                  <article className="panel" key={c.id}>
                    <p className="overline">
                      {
                        catalog.courses.find((x: any) => x.id === c.course_id)
                          ?.title
                      }
                    </p>
                    <h3>{c.name}</h3>
                    <p>
                      {date(c.starts_at)} · {c.enrolled}/{c.capacity} places
                    </p>
                    {button(
                      data.enrolments.some((e: any) => e.cohort_id === c.id)
                        ? "Already applied"
                        : "Apply for admission",
                      () =>
                        setModal({
                          title: "Apply for admission",
                          fields: [
                            {
                              name: "consent",
                              label: `I agree to apply for ${c.name} and share my account details with the academic team.`,
                              type: "checkbox",
                              required: true,
                            },
                          ],
                          label: "Submit application",
                          submit: (v) =>
                            api("enrolments", "POST", {
                              cohortId: c.id,
                              consent: v.consent,
                            }),
                        }),
                      "",
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "learning" && detail && (
            <>
              <button className="text-link" onClick={() => setDetail(null)}>
                Back to my courses
              </button>
              <section className="panel">
                <h2>{detail.enrolment.cohort_name}</h2>
                <p className="muted">Your curriculum and learning activities</p>
                {detail.lessons.map((l: any) => (
                  <details className="lesson" key={l.id}>
                    <summary>
                      <span>{l.title}</span>
                      {l.completed_at ? (
                        <span className="badge badge-completed">Completed</span>
                      ) : (
                        <BookOpen size={18} />
                      )}
                    </summary>
                    <p className="preserve-text">{l.content}</p>
                    {l.resource_url && (
                      <a
                        className="text-link"
                        href={l.resource_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open resource
                      </a>
                    )}
                    {!l.completed_at &&
                      detail.enrolment.student_id === data.user.id &&
                      button(
                        "Mark lesson complete",
                        () =>
                          act(async () => {
                            await api(
                              `enrolments/${detail.enrolment.id}/lessons`,
                              "POST",
                              { lessonId: l.id },
                            );
                            setDetail(
                              await api(`enrolments/${detail.enrolment.id}`),
                            );
                          }),
                        "",
                      )}
                  </details>
                ))}
              </section>
              <section className="panel">
                <h2>Live classes</h2>
                <DataTable
                  head={["Class", "Schedule", "Attendance", "Join"]}
                  rows={detail.classes.map((c: any) => [
                    c.title,
                    date(c.starts_at),
                    c.present == null
                      ? "Not recorded"
                      : c.present
                        ? "Present"
                        : "Absent",
                    button("Join class", () =>
                      act(async () => {
                        const r = await api(`classes/${c.id}/join`, "POST", {});
                        window.open(r.url, "_blank", "noopener,noreferrer");
                      }, "Meeting opened."),
                    ),
                  ])}
                />
              </section>
              <section className="panel">
                <h2>Assignments</h2>
                <DataTable
                  head={["Assignment", "Due", "Result", "Action"]}
                  rows={detail.assignments.map((a: any) => [
                    <div>
                      <strong>{a.title}</strong>
                      <small>{a.instructions}</small>
                      {a.document_id && (
                        <DocumentDownload
                          id={a.document_id}
                          filename={a.document_filename}
                        />
                      )}
                    </div>,
                    date(a.due_at),
                    a.score == null ? (
                      a.submission_id ? (
                        "Awaiting grading"
                      ) : (
                        "Not submitted"
                      )
                    ) : (
                      <div>
                        {a.score}/{a.max_score}
                        <small>{a.feedback}</small>
                      </div>
                    ),
                    a.score == null &&
                      detail.enrolment.student_id === data.user.id &&
                      button(
                        a.submission_id ? "Update submission" : "Submit work",
                        () =>
                          setModal({
                            title: a.title,
                            fields: [
                              {
                                name: "body",
                                label: "Your response",
                                type: "textarea",
                                value: a.submission_body,
                              },
                              {
                                name: "documentId",
                                label:
                                  "Attachment (upload in Support → Authorized documents first)",
                                type: "select",
                                value: a.document_id || "none",
                                options: [
                                  { value: "none", label: "No attachment" },
                                  ...(a.document_id &&
                                  !(data.documents || []).some(
                                    (d: any) => d.id === a.document_id,
                                  )
                                    ? [
                                        {
                                          value: a.document_id,
                                          label: a.document_filename,
                                        },
                                      ]
                                    : []),
                                  ...(data.documents || [])
                                    .filter(
                                      (d: any) =>
                                        d.owner_id === data.user.id &&
                                        d.purpose === "assignment_attachment" &&
                                        d.state === "clean",
                                    )
                                    .map((d: any) => ({
                                      value: d.id,
                                      label: d.filename,
                                    })),
                                ],
                              },
                            ],
                            submit: async (v) => {
                              await api(`assignments/${a.id}/submit`, "POST", {
                                ...v,
                                documentId:
                                  v.documentId === "none" ? null : v.documentId,
                              });
                              setDetail(
                                await api(`enrolments/${detail.enrolment.id}`),
                              );
                            },
                          }),
                      ),
                  ])}
                />
              </section>
              <section className="panel">
                <h2>Quizzes & assessments</h2>
                <DataTable
                  head={["Assessment", "Time limit", "Best result", "Action"]}
                  rows={(detail.quizzes || []).map((q: any) => [
                    q.title,
                    `${q.duration_minutes} minutes`,
                    q.best_score == null ? "Not attempted" : `${q.best_score}%`,
                    detail.enrolment.student_id === data.user.id &&
                      button("Start assessment", () =>
                        act(async () => {
                          const a = await api(
                            `quizzes/${q.id}/start`,
                            "POST",
                            {},
                          );
                          setModal({
                            title: `${a.title} · Submit before ${date(a.expiresAt)}`,
                            fields: a.questions.map(
                              (question: any, i: number) =>
                                select(
                                  `answer${i}`,
                                  question.prompt,
                                  question.options.map(
                                    (option: string, j: number) => ({
                                      value: String(j),
                                      label: option,
                                    }),
                                  ),
                                ),
                            ),
                            label: "Submit assessment",
                            submit: async (v) => {
                              const r = await api(
                                `quiz-attempts/${a.id}`,
                                "POST",
                                {
                                  answers: a.questions.map(
                                    (_: any, i: number) =>
                                      Number(v[`answer${i}`]),
                                  ),
                                },
                              );
                              setNotice(
                                `Assessment result: ${r.score}% · ${r.passed ? "Passed" : "Not passed"}`,
                              );
                              setDetail(
                                await api(`enrolments/${detail.enrolment.id}`),
                              );
                            },
                          });
                        }, "Assessment started. The timer is enforced by the server."),
                      ),
                  ])}
                />
              </section>
              {detail.certificate && (
                <section className="panel">
                  <h2>Your certificate</h2>
                  <Link
                    className="button"
                    href={`/verify/${detail.certificate.serial}`}
                  >
                    View and verify certificate
                  </Link>
                </section>
              )}
            </>
          )}
          {tab === "admissions" && (
            <section className="panel">
              <DataTable
                head={[
                  "Student",
                  "Course & intake",
                  "Admission",
                  "Fees",
                  "Actions",
                ]}
                rows={filter(data.enrolments).map((e: any) => [
                  e.student_name,
                  <div>
                    <strong>{e.course_title}</strong>
                    <small>{e.cohort_name}</small>
                  </div>,
                  status(e.status),
                  `${money(e.paid_paise)} / ${money(e.fee_paise)}`,
                  <div className="row-actions">
                    {admin &&
                      e.status === "applied" &&
                      button(
                        "Approve",
                        () =>
                          mutate(
                            `enrolments/${e.id}`,
                            { status: "active" },
                            "PATCH",
                          ),
                        "",
                      )}
                    {admin &&
                      e.status === "active" &&
                      button("Issue certificate", () =>
                        mutate(`enrolments/${e.id}/certificate`, {}),
                      )}
                    {(admin || trainer) &&
                      ["active", "completed"].includes(e.status) &&
                      button("View learning", () => learn(e.id))}
                  </div>,
                ])}
              />
            </section>
          )}
          {tab === "teaching" && (
            <>
              <div className="section-toolbar">
                {button("Create quiz", () => setQuizComposer(true))}
                {button("Create assignment", newAssignment)}
                {button("Add lesson", () =>
                  open("Add curriculum lesson", "lessons", [
                    select(
                      "versionId",
                      "Course version",
                      (data.versions || []).map((v: any) => ({
                        value: v.id,
                        label: `${v.title} · Version ${v.version}`,
                      })),
                    ),
                    { name: "title", label: "Lesson title" },
                    {
                      name: "content",
                      label: "Lesson content",
                      type: "textarea",
                    },
                    {
                      name: "resourceUrl",
                      label: "HTTPS resource link (optional)",
                      type: "url",
                      required: false,
                    },
                    {
                      name: "position",
                      label: "Sequence",
                      type: "number",
                      value: 1,
                      min: 0,
                    },
                  ]),
                )}
                {admin &&
                  button("Create cohort", () =>
                    open("Create cohort", "cohorts", [
                      select(
                        "versionId",
                        "Course version",
                        (data.versions || []).map((v: any) => ({
                          value: v.id,
                          label: `${v.title} · Version ${v.version}`,
                        })),
                      ),
                      { name: "name", label: "Cohort name" },
                      select(
                        "trainerId",
                        "Trainer",
                        opts(
                          data.users.filter((u: any) =>
                            u.roles.includes("trainer"),
                          ),
                        ),
                      ),
                      {
                        name: "capacity",
                        label: "Capacity",
                        type: "number",
                        value: 30,
                        min: 1,
                      },
                      {
                        name: "startsAt",
                        label: "Start (device time zone)",
                        type: "datetime-local",
                      },
                      {
                        name: "attendanceRequired",
                        label: "Required attendance (%)",
                        type: "number",
                        value: 75,
                        min: 0,
                        max: 100,
                      },
                    ]),
                  )}
              </div>
              <section className="panel">
                <h2>Cohorts & teaching calendar</h2>
                <DataTable
                  head={["Class", "Schedule", "Status", "Actions"]}
                  rows={filter(data.classes || []).map((c: any) => [
                    <div>
                      <strong>{c.title}</strong>
                      <small>
                        {cohorts.find((h: any) => h.id === c.cohort_id)?.name}
                      </small>
                    </div>,
                    date(c.starts_at),
                    status(c.status),
                    <div className="row-actions">
                      {button("Attendance", () =>
                        open(
                          "Record attendance",
                          `classes/${c.id}/attendance`,
                          [
                            select(
                              "studentId",
                              "Student",
                              data.enrolments
                                .filter(
                                  (e: any) =>
                                    e.cohort_id === c.cohort_id &&
                                    e.status === "active",
                                )
                                .map((e: any) => ({
                                  value: e.student_id,
                                  label: e.student_name,
                                })),
                            ),
                            {
                              name: "present",
                              label: "Student was present",
                              type: "checkbox",
                              value: true,
                            },
                          ],
                        ),
                      )}
                      {c.status === "scheduled" &&
                        button("Set meeting", () =>
                          open(
                            "Set class meeting",
                            `classes/${c.id}`,
                            [
                              {
                                name: "meetingUrl",
                                label: "Private HTTPS meeting URL",
                                type: "url",
                              },
                            ],
                            "PATCH",
                          ),
                        )}
                      {c.status === "scheduled" &&
                        button("Complete class", () =>
                          mutate(
                            `classes/${c.id}`,
                            { status: "completed" },
                            "PATCH",
                          ),
                        )}
                    </div>,
                  ])}
                />
              </section>
              <section className="panel">
                <h2>Assignment submissions</h2>
                <DataTable
                  head={[
                    "Student",
                    "Assignment",
                    "Response",
                    "Grade",
                    "Actions",
                  ]}
                  rows={filter(data.submissions || []).map((s: any) => [
                    s.student_name,
                    s.assignment_title,
                    <details>
                      <summary>Read response</summary>
                      <p className="preserve-text">{s.body}</p>
                      {s.document_id && (
                        <DocumentDownload
                          id={s.document_id}
                          filename={s.document_filename}
                        />
                      )}
                    </details>,
                    s.score == null ? "Ungraded" : `${s.score}/${s.max_score}`,
                    button("Grade", () =>
                      open(
                        "Grade submission",
                        `submissions/${s.id}`,
                        [
                          {
                            name: "score",
                            label: `Score out of ${s.max_score}`,
                            type: "number",
                            min: 0,
                            max: s.max_score,
                            value: s.score,
                          },
                          {
                            name: "feedback",
                            label: "Feedback",
                            type: "textarea",
                            value: s.feedback,
                          },
                        ],
                        "PATCH",
                      ),
                    ),
                  ])}
                />
              </section>
            </>
          )}
          {tab === "shop" && (
            <>
              {!catalog.products.length && (
                <section className="app-empty peach">
                  <ShoppingBag size={44} strokeWidth={1.3} />
                  <h2>Good things are on their way.</h2>
                  <p>
                    Products will appear here when the institute publishes them.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      open("Product enquiry", "tickets", [
                        {
                          name: "subject",
                          label: "Subject",
                          value: "Wellness products",
                        },
                        {
                          name: "message",
                          label: "What are you looking for?",
                          type: "textarea",
                        },
                      ])
                    }
                  >
                    Ask about products
                  </button>
                </section>
              )}
              {catalog.products.length > 0 &&
                !filter(catalog.products).length && (
                  <div className="app-empty">
                    <Search size={30} />
                    <h2>No matching products.</h2>
                    <button
                      className="button secondary"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </button>
                  </div>
                )}
              <div className="shop-layout">
                <div className="cards two">
                  {filter(catalog.products).map((p: any) => (
                    <article className="panel" key={p.id}>
                      <div className="product-art tint-1">
                        <ShoppingBag size={40} />
                      </div>
                      <p className="overline">{p.category}</p>
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div className="card-bottom">
                        <strong>{money(p.price_paise)}</strong>
                        <button
                          className="button small"
                          disabled={p.stock < 1}
                          onClick={() =>
                            setCart({
                              ...cart,
                              [p.id]: Math.min(p.stock, (cart[p.id] || 0) + 1),
                            })
                          }
                        >
                          Add to cart
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <aside className="panel cart">
                  <h2>Your basket</h2>
                  {Object.entries(cart).map(([id, q]) => {
                    const p = catalog.products.find((p: any) => p.id === id);
                    return (
                      <div className="cart-line" key={id}>
                        <strong>{p?.name}</strong>
                        <div>
                          <button
                            className="icon-button"
                            aria-label={`Remove one ${p?.name}`}
                            onClick={() => {
                              const next = { ...cart };
                              if (q <= 1) delete next[id];
                              else next[id]--;
                              setCart(next);
                            }}
                          >
                            −
                          </button>
                          <span>{q}</span>
                          <span>{money((p?.price_paise || 0) * q)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!Object.keys(cart).length ? (
                    <p className="muted">
                      Add an essential for your daily practice.
                    </p>
                  ) : (
                    <>
                      <div className="card-bottom">
                        <strong>Subtotal</strong>
                        <strong>
                          {money(
                            Object.entries(cart).reduce(
                              (s, [id, q]) =>
                                s +
                                (catalog.products.find((p: any) => p.id === id)
                                  ?.price_paise || 0) *
                                  q,
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                      <button
                        className="button"
                        onClick={() =>
                          setModal({
                            title: "Delivery details",
                            fields: [
                              {
                                name: "name",
                                label: "Recipient name",
                                value: data.user.name,
                              },
                              { name: "phone", label: "Phone" },
                              {
                                name: "line",
                                label: "Street address",
                                type: "textarea",
                              },
                              { name: "city", label: "City" },
                              { name: "postcode", label: "PIN code" },
                              select(
                                "stateCode",
                                "Delivery state",
                                states.map(([value, label]) => ({
                                  value,
                                  label,
                                })),
                              ),
                              {
                                name: "gstin",
                                label: "Buyer GSTIN (optional)",
                                required: false,
                              },
                            ],
                            submit: async (address) => {
                              await api("orders", "POST", {
                                items: Object.entries(cart).map(
                                  ([productId, quantity]) => ({
                                    productId,
                                    quantity,
                                  }),
                                ),
                                address,
                                idempotencyKey: crypto.randomUUID(),
                              });
                              setCart({});
                              setTab("orders");
                              setNotice(
                                "Stock reserved for 30 minutes. Complete payment from your order.",
                              );
                            },
                          })
                        }
                      >
                        Continue to checkout
                      </button>
                      <small>
                        Final prices and availability are verified at checkout.
                      </small>
                    </>
                  )}
                </aside>
              </div>
            </>
          )}
          {tab === "orders" && !shopView && (
            <section className="panel">
              <DataTable
                head={
                  vendor
                    ? [
                        "Product",
                        "Quantity",
                        "Order payment",
                        "Fulfilment",
                        "Actions",
                      ]
                    : ["Order", "Created", "Total", "Status", "Actions"]
                }
                rows={filter(data.orders).map((o: any) =>
                  vendor
                    ? [
                        o.product_name,
                        o.quantity,
                        status(o.order_status),
                        <div>
                          {status(o.status)}
                          <small>{o.tracking_reference}</small>
                        </div>,
                        <div className="row-actions">
                          {o.status === "pending" &&
                            ["paid", "processing"].includes(o.order_status) &&
                            button("Accept", () =>
                              mutate(
                                `order-items/${o.id}`,
                                { status: "accepted" },
                                "PATCH",
                              ),
                            )}
                          {o.status === "accepted" &&
                            button("Ship", () =>
                              setModal({
                                title: "Dispatch order",
                                fields: [
                                  {
                                    name: "trackingReference",
                                    label: "Tracking reference",
                                  },
                                ],
                                submit: (v) =>
                                  api(`order-items/${o.id}`, "PATCH", {
                                    ...v,
                                    status: "shipped",
                                  }),
                              }),
                            )}
                          {o.status === "shipped" &&
                            button("Mark delivered", () =>
                              mutate(
                                `order-items/${o.id}`,
                                { status: "delivered" },
                                "PATCH",
                              ),
                            )}
                        </div>,
                      ]
                    : [
                        <details>
                          <summary>#{o.id.slice(0, 8).toUpperCase()}</summary>
                          {o.items?.map((i: any) => (
                            <p key={i.id}>
                              {i.product_name} × {i.quantity} · {i.status}
                            </p>
                          ))}
                        </details>,
                        date(o.created_at),
                        money(o.total_paise),
                        status(o.status),
                        <div className="row-actions">
                          {o.invoices?.map((invoice: any) => (
                            <InvoiceButton key={invoice.id} id={invoice.id} />
                          ))}
                          {o.status === "pending_payment" &&
                            o.customer_id === data.user.id &&
                            button(
                              demo ? "Demo payment" : "Pay now",
                              () => pay("order", o.id),
                              "",
                            )}
                          {o.status === "pending_payment" &&
                            (admin || o.customer_id === data.user.id) &&
                            button("Cancel", () =>
                              mutate(`orders/${o.id}/cancel`),
                            )}
                        </div>,
                      ],
                )}
              />
            </section>
          )}
          {tab === "inventory" && !shopView && (
            <section className="panel">
              <DataTable
                head={[
                  "Product",
                  "Vendor / category",
                  "Price",
                  "Stock",
                  "Status",
                  "Actions",
                ]}
                rows={filter(
                  vendor ? data.vendorProducts : data.products || [],
                ).map((p: any) => [
                  p.name,
                  p.vendor_name || p.category,
                  money(p.price_paise),
                  p.stock,
                  status(p.status),
                  <div className="row-actions">
                    {admin && p.status === "pending" && (
                      <>
                        {button(
                          "Approve",
                          () =>
                            mutate(
                              `products/${p.id}`,
                              { status: "approved" },
                              "PATCH",
                            ),
                          "",
                        )}
                        {button("Reject", () =>
                          mutate(
                            `products/${p.id}`,
                            { status: "rejected" },
                            "PATCH",
                          ),
                        )}
                      </>
                    )}
                    {vendor &&
                      button("Add stock", () =>
                        open(
                          "Receive stock",
                          `products/${p.id}`,
                          [
                            {
                              name: "addStock",
                              label: "Units received",
                              type: "number",
                              min: 1,
                            },
                          ],
                          "PATCH",
                        ),
                      )}
                  </div>,
                ])}
              />
            </section>
          )}
          {tab === "vendors" && !shopView && (
            <section className="panel">
              <DataTable
                head={["Partner", "Owner", "Commission", "Status", "Actions"]}
                rows={filter(data.vendors || []).map((v: any) => [
                  v.name,
                  v.owner_name,
                  `${v.commission_bps / 100}%`,
                  status(v.status),
                  <div className="row-actions">
                    {v.status !== "approved" &&
                      button(
                        "Approve",
                        () =>
                          mutate(
                            `vendors/${v.id}`,
                            {
                              status: "approved",
                              commissionBps: v.commission_bps,
                            },
                            "PATCH",
                          ),
                        "",
                      )}
                    {v.status === "approved" &&
                      button("Suspend", () =>
                        mutate(
                          `vendors/${v.id}`,
                          {
                            status: "suspended",
                            commissionBps: v.commission_bps,
                          },
                          "PATCH",
                        ),
                      )}
                  </div>,
                ])}
              />
            </section>
          )}
          {tab === "enquiries" && (
            <section className="panel">
              <DataTable
                head={["Person", "Interest", "Message", "Status", "Follow-up"]}
                rows={filter(data.enquiries || []).map((e: any) => [
                  <div>
                    <strong>{e.name}</strong>
                    <small>{e.email}</small>
                  </div>,
                  e.interest,
                  e.message,
                  status(e.status),
                  button("Update", () =>
                    open(
                      "Update enquiry",
                      `enquiries/${e.id}`,
                      [
                        select(
                          "status",
                          "Status",
                          ["new", "contacted", "resolved", "closed"].map(
                            (s) => ({ value: s, label: s }),
                          ),
                        ),
                        {
                          name: "followUpAt",
                          label: "Next follow-up (optional)",
                          type: "datetime-local",
                          required: false,
                        },
                      ],
                      "PATCH",
                    ),
                  ),
                ])}
              />
            </section>
          )}
          {tab === "finance" && !shopView && (
            <>
              <section className="panel">
                <h2>
                  {vendor
                    ? "Commission and payable ledger"
                    : "Payment activity"}
                </h2>
                {vendor ? (
                  <DataTable
                    head={["Date", "Reference", "Vendor credit"]}
                    rows={filter(data.vendorLedger || []).map((l: any) => [
                      date(l.created_at),
                      l.reference_id.slice(0, 8),
                      money(-l.amount_paise),
                    ])}
                  />
                ) : (
                  <DataTable
                    head={[
                      "Reference",
                      "Person",
                      "Amount",
                      "Status",
                      "Created",
                    ]}
                    rows={filter(data.payments).map((p: any) => [
                      `${p.reference_type} · ${p.reference_id.slice(0, 8)}`,
                      p.user_name,
                      money(p.amount_paise),
                      <div>
                        {status(p.status)}
                        {p.reconciliation_reason && (
                          <small>{p.reconciliation_reason}</small>
                        )}
                      </div>,
                      date(p.created_at),
                    ])}
                  />
                )}
              </section>
              {!vendor && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Refund requests</h2>
                    {button("Request a refund", () =>
                      open("Request a full refund", "refunds", [
                        select(
                          "paymentId",
                          "Captured payment",
                          data.payments
                            .filter((p: any) => p.status === "captured")
                            .map((p: any) => ({
                              value: p.id,
                              label: `${p.reference_type} · ${money(p.amount_paise)} · ${p.id.slice(0, 8)}`,
                            })),
                        ),
                        { name: "reason", label: "Reason", type: "textarea" },
                      ]),
                    )}
                  </div>
                  <DataTable
                    head={["Customer", "Amount", "Reason", "Status", "Action"]}
                    rows={(data.refunds || []).map((r: any) => [
                      r.customer_name,
                      money(r.amount_paise),
                      r.reason,
                      status(r.status),
                      (admin || role === "finance") &&
                        r.status === "requested" &&
                        r.requested_by !== data.user.id &&
                        button(
                          "Approve refund",
                          () => mutate(`refunds/${r.id}/approve`, {}),
                          "",
                        ),
                    ])}
                  />
                </section>
              )}
              <p className="section-note">
                {vendor
                  ? "Payable entries show accounting allocations; they are not confirmation of a bank payout."
                  : "Payment status is updated from verified provider events. In demo mode, transactions are simulated."}
              </p>
            </>
          )}
          {tab === "team" && (
            <section className="panel">
              <DataTable
                head={["Person", "Email", "Access", "Status", "Action"]}
                rows={filter(data.users || []).map((u: any) => [
                  u.name,
                  u.email,
                  u.roles.join(", "),
                  status(u.active ? "active" : "disabled"),
                  u.id !== data.user.id &&
                    button("Manage access", () =>
                      open(
                        "Manage access",
                        `users/${u.id}`,
                        [
                          {
                            name: "roles",
                            label: "Roles",
                            type: "roles",
                            options: Object.keys(roleNames).map((r) => ({
                              value: r,
                              label: roleNames[r],
                            })),
                            value: u.roles,
                          },
                          {
                            name: "active",
                            label: "Account is active",
                            type: "checkbox",
                            value: u.active,
                          },
                        ],
                        "PATCH",
                      ),
                    ),
                ])}
              />
            </section>
          )}
          {tab === "content" && (
            <>
              <div className="section-toolbar">
                {button(
                  "Create announcement",
                  () =>
                    open("Create announcement", "announcements", [
                      { name: "title", label: "Title" },
                      { name: "body", label: "Message", type: "textarea" },
                      select("audience", "Audience", [
                        { value: "public", label: "Public" },
                        { value: "student", label: "Students" },
                        { value: "staff", label: "Staff" },
                      ]),
                      {
                        name: "published",
                        label: "Publish this announcement",
                        type: "checkbox",
                      },
                    ]),
                  "",
                )}
                {button("Add service", () =>
                  open("Add a service", "services", [
                    { name: "name", label: "Service name" },
                    { name: "category", label: "Category" },
                    {
                      name: "description",
                      label: "Description",
                      type: "textarea",
                    },
                    {
                      name: "durationMinutes",
                      label: "Duration (minutes)",
                      type: "number",
                      min: 15,
                      max: 240,
                      value: 45,
                    },
                    { name: "pricePaise", label: "Fee (₹)", type: "money" },
                    select(
                      "practitionerId",
                      "Assigned practitioner",
                      opts(
                        data.users.filter((u: any) =>
                          u.roles.includes("clinician"),
                        ),
                      ),
                    ),
                  ]),
                )}
                {button("New curriculum version", () =>
                  open("New curriculum version", "course-versions", [
                    select(
                      "courseId",
                      "Course",
                      opts(data.courses || [], "title"),
                    ),
                    {
                      name: "syllabus",
                      label: "Version syllabus",
                      type: "textarea",
                    },
                  ]),
                )}
                {button("Create course", () =>
                  open("Create a course", "courses", [
                    { name: "title", label: "Course title" },
                    { name: "category", label: "Category" },
                    {
                      name: "description",
                      label: "Description",
                      type: "textarea",
                    },
                    { name: "duration", label: "Duration" },
                    { name: "feePaise", label: "Fee (₹)", type: "money" },
                    { name: "syllabus", label: "Syllabus", type: "textarea" },
                    {
                      name: "published",
                      label: "Publish after academic review",
                      type: "checkbox",
                    },
                  ]),
                )}
              </div>
              <section className="panel">
                <h2>Announcements</h2>
                <DataTable
                  head={["Title", "Audience", "Publication", "Action"]}
                  rows={filter(data.announcements || []).map((a: any) => [
                    a.title,
                    a.audience,
                    status(a.published ? "published" : "draft"),
                    button(a.published ? "Unpublish" : "Publish", () =>
                      mutate(
                        `announcements/${a.id}`,
                        { published: !a.published },
                        "PATCH",
                      ),
                    ),
                  ])}
                />
              </section>
              <section className="panel">
                <h2>Course catalogue</h2>
                <DataTable
                  head={["Programme", "Duration", "Fee", "Status", "Action"]}
                  rows={filter(data.courses || []).map((c: any) => [
                    c.title,
                    c.duration,
                    money(c.fee_paise),
                    status(c.published ? "published" : "draft"),
                    button(c.published ? "Unpublish" : "Publish", () =>
                      mutate(
                        `courses/${c.id}`,
                        { published: !c.published },
                        "PATCH",
                      ),
                    ),
                  ])}
                />
              </section>
            </>
          )}
          {tab === "audit" && (
            <section className="panel">
              <DataTable
                head={["Action", "Actor", "Record", "Time"]}
                rows={filter(data.audit || []).map((a: any) => [
                  a.action,
                  a.actor_name || "System",
                  a.resource_id.slice(0, 12),
                  date(a.created_at),
                ])}
              />
            </section>
          )}
          {tab === "support" && (
            <>
              <section className="panel">
                <h2>Privacy requests</h2>
                <DataTable
                  head={["Person", "Request", "Status", "Response"]}
                  rows={(data.privacyRequests || []).map((r: any) => [
                    r.user_name,
                    <div>
                      <strong>{r.request_type}</strong>
                      <p>{r.message}</p>
                    </div>,
                    status(r.status),
                    <div>
                      {r.response || "Under review"}
                      {admin &&
                        button("Review", () =>
                          open(
                            "Review privacy request",
                            `privacy-requests/${r.id}`,
                            [
                              select(
                                "status",
                                "Status",
                                ["reviewing", "completed", "declined"].map(
                                  (v) => ({ value: v, label: v }),
                                ),
                              ),
                              {
                                name: "response",
                                label: "Response and action taken",
                                type: "textarea",
                                value: r.response,
                              },
                            ],
                            "PATCH",
                          ),
                        )}
                    </div>,
                  ])}
                />
              </section>
              <Documents documents={data.documents || []} refresh={refresh} />
              <div className="section-toolbar">
                {button("Request account data review", () =>
                  open("Privacy request", "privacy-requests", [
                    select("requestType", "Request type", [
                      { value: "access", label: "Access my data" },
                      { value: "correction", label: "Correct my data" },
                      { value: "erasure", label: "Request deletion" },
                    ]),
                    {
                      name: "message",
                      label: "Request details",
                      type: "textarea",
                    },
                  ]),
                )}
              </div>
              <section className="panel">
                <DataTable
                  head={["Subject", "Message", "Status", "Response"]}
                  rows={filter(data.tickets).map((t: any) => [
                    <div>
                      <strong>{t.subject}</strong>
                      <small>{t.user_name}</small>
                    </div>,
                    t.message,
                    status(t.status),
                    <div>
                      {t.response || "Awaiting a response"}
                      {admin &&
                        button("Respond", () =>
                          open(
                            "Respond to request",
                            `tickets/${t.id}`,
                            [
                              select(
                                "status",
                                "Status",
                                ["open", "in_progress", "resolved"].map(
                                  (s) => ({
                                    value: s,
                                    label: s.replace("_", " "),
                                  }),
                                ),
                              ),
                              {
                                name: "response",
                                label: "Response",
                                type: "textarea",
                                value: t.response,
                              },
                            ],
                            "PATCH",
                          ),
                        )}
                    </div>,
                  ])}
                />
              </section>
            </>
          )}
          {tab === "notifications" && (
            <section className="panel">
              {data.notifications.length ? (
                data.notifications.map((n: any) => (
                  <article className="notice-item" key={n.id}>
                    <span className="round-icon">
                      <Bell size={18} />
                    </span>
                    <div>
                      <h3>{n.title}</h3>
                      <p>{n.body}</p>
                      <small>{date(n.created_at)}</small>
                    </div>
                    {!n.read_at &&
                      button("Mark read", () =>
                        mutate(`notifications/${n.id}`, {}, "PATCH"),
                      )}
                  </article>
                ))
              ) : (
                <div className="empty">You’re all caught up.</div>
              )}
            </section>
          )}
          {["patient", "student"].includes(role) && tab === "overview" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Explore your institute</h2>
                <span className="muted">Learning and partnerships</span>
              </div>
              <div className="button-row">
                {button("Browse course intakes", () => setTab("learning"))}
                {!data.user.roles.includes("vendor") &&
                  button("Apply as a vendor", () =>
                    open("Vendor partnership application", "vendors", [
                      { name: "name", label: "Business name" },
                      {
                        name: "description",
                        label: "Describe your business and product categories",
                        type: "textarea",
                      },
                    ]),
                  )}
              </div>
            </section>
          )}
        </main>
      </div>
      {vendor ? (
        <SupplierBottomNav tab={tab} />
      ) : (
        <BottomNav
          active={
            (tab === "overview"
              ? "home"
              : ["appointments", "plans"].includes(tab)
                ? "care"
                : ["learning", "teaching", "admissions"].includes(tab)
                  ? "learn"
                  : [
                        "shop",
                        "inventory",
                        "shopdesk",
                        "vendors",
                        "orders",
                      ].includes(tab)
                    ? "shop"
                    : "account") as Destination
          }
          links={{
            home: `/portal/${role}`,
            care: allowedTabs.includes("appointments")
              ? `/portal/${role}?tab=appointments`
              : "/care",
            learn: allowedTabs.includes("learning")
              ? `/portal/${role}?tab=learning`
              : allowedTabs.includes("teaching")
                ? `/portal/${role}?tab=teaching`
                : "/learn",
            shop: allowedTabs.includes("shop")
              ? `/portal/${role}?tab=shop`
              : ["admin", "finance"].includes(role)
                ? `/portal/${role}?tab=shopdesk`
                : "/shop",
            account: `/portal/${role}?tab=account`,
          }}
        />
      )}
      {booking && (
        <BookingSheet
          catalog={catalog}
          close={() => setBooking(false)}
          done={() => {
            setNotice("Appointment confirmed. Your booking is in Care.");
            refresh();
            setTab("appointments");
          }}
          requestHelp={askAboutCare}
        />
      )}
      {quizComposer && (
        <QuizComposer
          cohorts={cohorts}
          close={() => setQuizComposer(false)}
          done={() => {
            refresh();
            setNotice("Assessment created.");
          }}
        />
      )}
      {modal && (
        <FormModal
          modal={modal}
          close={() => setModal(null)}
          done={() => {
            setNotice("Saved successfully.");
            refresh();
          }}
        />
      )}
      {notes && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Clinical record"
          >
            <div className="modal-heading">
              <h2>Encounter records</h2>
              <button
                className="icon-button"
                aria-label="Close records"
                onClick={() => setNotes(null)}
              >
                <X />
              </button>
            </div>
            {notes.items.length ? (
              notes.items.map((n) => (
                <article className="clinical-note" key={n.id}>
                  <p className="preserve-text">{n.body}</p>
                  <small>
                    {n.author_name} · {date(n.created_at)}
                    {n.supersedes_id ? " · Amendment" : ""}
                  </small>
                </article>
              ))
            ) : (
              <p className="muted">No clinical notes have been recorded.</p>
            )}
            {clinician &&
              button(
                "Add clinical note",
                () => {
                  const id = notes.id;
                  setNotes(null);
                  open("Add clinical note", `appointments/${id}/notes`, [
                    {
                      name: "body",
                      label: "Clinical note (append-only)",
                      type: "textarea",
                    },
                  ]);
                },
                "",
              )}
          </section>
        </div>
      )}
    </div>
  );
}
function studentTitle(role: string) {
  return role === "student"
    ? "A little progress, every day."
    : role === "vendor"
      ? "Your products. A shared community."
      : role === "trainer"
        ? "Make every class count."
        : role === "admin"
          ? "Keep your institute moving."
          : "Your next step starts here.";
}
function studentDescription(role: string) {
  return role === "student"
    ? "Your lessons. Your next step."
    : role === "vendor"
      ? "Stock, sales and your account with INCYS."
      : role === "trainer"
        ? "Teach, review and connect."
        : role === "admin"
          ? "Care, learning and business at a glance."
          : "Keep appointments, follow-ups and your learning together in one connected space.";
}
