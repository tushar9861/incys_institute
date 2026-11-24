"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HeartPulse,
  BookOpen,
  ShoppingBag,
  CalendarDays,
  MapPin,
  ChevronRight,
  Search,
  SlidersHorizontal,
  MessageCircle,
  ShieldCheck,
  Clock3,
  Sparkles,
  UserRound,
  Smartphone,
  ArrowUpRight,
  RotateCw,
} from "lucide-react";
import { api, money, preferredRole } from "@/lib/client";
import { BottomNav, Brand, type Destination } from "./app-navigation";
import { Breathe } from "./breathe";
import { WellnessArt } from "./wellness-art";
import { EnquirySheet } from "./enquiry-sheet";
const sections = {
  care: {
    label: "Care",
    title: "A little care. A better you.",
    subtitle: "Find the right support for your wellbeing.",
    empty: "Let’s find your starting point.",
    detail: "Contact the care team for services and availability.",
    interest: "Care & appointments",
    icon: HeartPulse,
    collection: "services",
    tint: "mint",
  },
  learn: {
    label: "Learn",
    title: "Make room to grow.",
    subtitle: "Explore yoga and naturopathy programmes.",
    empty: "Your next chapter starts here.",
    detail: "Ask the academic team about programmes and upcoming intakes.",
    interest: "Courses & admissions",
    icon: BookOpen,
    collection: "courses",
    tint: "lilac",
  },
  shop: {
    label: "Shop",
    title: "Small things. Daily wellbeing.",
    subtitle: "Essentials to support your everyday practice.",
    empty: "Good things are on their way.",
    detail: "Products will appear here when the institute publishes them.",
    interest: "Wellness products",
    icon: ShoppingBag,
    collection: "products",
    tint: "peach",
  },
} as const;
export function PublicSite({ view = "home" }: { view?: Destination }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [enquiry, setEnquiry] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(view === "account"),
    [accountError, setAccountError] = useState(""),
    [intent, setIntent] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await api("catalog"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (view !== "account") load();
    api("config")
      .then((c) => setDemo(c.demo))
      .catch(() => {});
  }, [view]);
  useEffect(() => {
    if (view !== "account") return;
    const requested =
      new URLSearchParams(window.location.search).get("intent") || "";
    const target = [
      "appointments",
      "learning",
      "shop",
      "support",
      "orders",
    ].includes(requested)
      ? requested
      : "account";
    setIntent(target);
    api("me")
      .then((user) => {
        window.location.replace(
          `/portal/${preferredRole(user.roles)}?tab=${target}`,
        );
      })
      .catch((e) => {
        if (e.status !== 401)
          setAccountError(
            "We couldn’t open your account. Try again or sign in.",
          );
      })
      .finally(() => setAccountLoading(false));
  }, [view]);
  const section =
    view === "care" || view === "learn" || view === "shop"
      ? sections[view]
      : null;
  const items: any[] = section ? data?.[section.collection] || [] : [];
  const categories = [
    "All",
    ...new Set(items.map((x) => x.category).filter(Boolean)),
  ] as string[];
  const filtered = items.filter(
    (x) =>
      (category === "All" || x.category === category) &&
      `${x.name || x.title} ${x.description || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className={`consumer-app view-${view}`}>
      <a className="skip-link" href="#app-content">
        Skip to content
      </a>
      <header className="consumer-header">
        <Brand />
        <div className="consumer-header-right">
          <span className="location-label">
            <MapPin size={14} /> Balasore, Odisha
          </span>
          <button
            className="icon-button"
            aria-label="Contact institute"
            onClick={() => setEnquiry("General enquiry")}
          >
            <MessageCircle size={21} />
          </button>
          <Link
            href="/account"
            className="profile-button"
            aria-label="Open account"
          >
            <UserRound size={21} />
          </Link>
        </div>
      </header>
      {demo && (
        <div className="demo-banner">
          Development preview · Sample data · Simulated payments
        </div>
      )}
      <main id="app-content" className="consumer-main">
        {view === "home" && (
          <>
            <div className="home-greeting">
              <div>
                <p className="micro-label">YOUR EVERYDAY WELLBEING</p>
                <h1>
                  Feel more like <em>you.</em>
                </h1>
                <p>Care, learning and a little room to breathe.</p>
              </div>
              <span className="greeting-spark">
                <Sparkles size={25} />
              </span>
            </div>
            <section className="wellness-hero">
              <div className="wellness-copy">
                <span className="soft-pill">
                  <span /> WELLNESS, AT YOUR PACE
                </span>
                <h2>
                  Feel good.
                  <br />
                  Find your balance.
                </h2>
                <p>Find your next step with INCYS.</p>
                <Link href="/care" className="button">
                  Explore care
                </Link>
                <span className="hero-footnote">
                  <MapPin size={13} /> Rooted in Balasore
                </span>
              </div>
              <WellnessArt />
            </section>
            <section className="quick-destinations" aria-label="Quick actions">
              {[
                {
                  label: "Book care",
                  detail: "Find your support",
                  href: "/care",
                  icon: HeartPulse,
                  color: "mint",
                },
                {
                  label: "Explore courses",
                  detail: "Keep growing",
                  href: "/learn",
                  icon: BookOpen,
                  color: "lilac",
                },
                {
                  label: "Wellness shop",
                  detail: "Daily essentials",
                  href: "/shop",
                  icon: ShoppingBag,
                  color: "peach",
                },
                {
                  label: "My activity",
                  detail: "All in one place",
                  href: "/account",
                  icon: CalendarDays,
                  color: "blue",
                },
              ].map(({ label, detail, href, icon: Icon, color }) => (
                <Link className="quick-destination" href={href} key={href}>
                  <span className={`icon-tile ${color}`}>
                    <Icon size={25} />
                  </span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </Link>
              ))}
            </section>
            <div className="home-secondary">
              <Breathe />
              <Link className="journey-card" href="/account">
                <span className="icon-tile lilac">
                  <CalendarDays />
                </span>
                <div>
                  <h3>Your journey, together.</h3>
                  <p>Bookings, learning and orders.</p>
                </div>
                <ChevronRight size={20} />
              </Link>
            </div>
            <div className="section-title">
              <div>
                <span className="micro-label">A SPACE FOR YOU</span>
                <h2>Find your next step</h2>
              </div>
              <span className="mini-wordmark">incys / everyday</span>
            </div>
            <div className="discovery-grid">
              <Link className="discovery-card learn-discovery" href="/learn">
                <div>
                  <span className="micro-label">LEARN WITH INCYS</span>
                  <h3>
                    Curiosity looks
                    <br />
                    good on you.
                  </h3>
                  <span className="inline-link">
                    Explore programmes <ArrowUpRight size={17} />
                  </span>
                </div>
                <div className="discovery-symbol">
                  <BookOpen strokeWidth={1.2} />
                </div>
              </Link>
              <button
                className="discovery-card care-discovery"
                onClick={() => setEnquiry("Help choosing care or a course")}
              >
                <div>
                  <span className="micro-label">HERE TO HELP</span>
                  <h3>
                    Not sure where
                    <br />
                    to begin?
                  </h3>
                  <span className="inline-link">
                    Talk to the institute <MessageCircle size={17} />
                  </span>
                </div>
                <div className="discovery-symbol">
                  <HeartPulse strokeWidth={1.2} />
                </div>
              </button>
            </div>
            {(data?.announcements || []).length > 0 && (
              <section className="announcement-list">
                <div className="section-title">
                  <h2>From the institute</h2>
                </div>
                {data.announcements.map((a: any) => (
                  <article key={a.id}>
                    <h3>{a.title}</h3>
                    <p>{a.body}</p>
                  </article>
                ))}
              </section>
            )}
            {error && (
              <div className="load-error" role="alert">
                <p>Institute updates couldn’t load.</p>
                <button className="text-link" onClick={load}>
                  <RotateCw size={16} /> Try again
                </button>
              </div>
            )}
          </>
        )}
        {section && (
          <>
            <div className="browse-heading">
              <span className={`icon-tile ${section.tint}`}>
                <section.icon />
              </span>
              <p className="micro-label">INCYS {section.label.toUpperCase()}</p>
              <h1>{section.title}</h1>
              <p>{section.subtitle}</p>
            </div>
            <div className="browse-tools">
              <label className="browse-search">
                <Search size={20} />
                <input
                  aria-label={`Search ${section.label.toLowerCase()}`}
                  placeholder={`Search ${section.label === "Care" ? "services" : section.label === "Learn" ? "courses" : "products"}…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {categories.length > 1 && (
                <label className="category-filter">
                  <SlidersHorizontal size={18} />
                  <select
                    aria-label="Category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {loading ? (
              <div
                className="skeleton-grid"
                role="status"
                aria-label="Loading catalogue"
              >
                {[1, 2, 3].map((i) => (
                  <div className="skeleton-card" key={i} />
                ))}
                <span className="sr-only">Loading catalogue…</span>
              </div>
            ) : error ? (
              <div className="app-empty" role="alert">
                <RotateCw size={36} />
                <h2>Let’s try that again.</h2>
                <p>We couldn’t load the catalogue. Check your connection.</p>
                <button className="button" onClick={load}>
                  Retry
                </button>
              </div>
            ) : !items.length ? (
              <div className={`app-empty ${section.tint}`}>
                <span className="empty-illustration">
                  <section.icon size={52} strokeWidth={1.2} />
                  <Sparkles size={23} />
                </span>
                <h2>{section.empty}</h2>
                <p>{section.detail}</p>
                <button
                  className="button"
                  onClick={() => setEnquiry(section.interest)}
                >
                  {view === "shop" ? "Ask about products" : "Contact the team"}
                </button>
              </div>
            ) : !filtered.length ? (
              <div className="app-empty">
                <Search size={36} />
                <h2>No matches yet.</h2>
                <p>Try a different search or category.</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("All");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="browse-grid">
                {filtered.map((item: any, i: number) => (
                  <article className="browse-card" key={item.id}>
                    <div className={`browse-art ${section.tint}`}>
                      <section.icon size={54} strokeWidth={1.1} />
                      <span className="art-ring" />
                      <span className="browse-category">
                        {item.category || section.label}
                      </span>
                    </div>
                    <div className="browse-card-body">
                      <h2>{item.name || item.title}</h2>
                      <p>{item.description}</p>
                      {view !== "shop" && (
                        <span className="item-meta">
                          <Clock3 size={14} />
                          {view === "care"
                            ? `${item.duration_minutes} minutes`
                            : item.duration || "Ask about the programme"}
                        </span>
                      )}
                      <div className="browse-card-bottom">
                        <strong>
                          {money(
                            view === "learn"
                              ? item.fee_paise
                              : item.price_paise,
                          )}
                        </strong>
                        <Link
                          className="button small"
                          href={`/account?intent=${view === "care" ? "appointments" : view === "learn" ? "learning" : "shop"}`}
                        >
                          {view === "care"
                            ? "Book care"
                            : view === "learn"
                              ? "View intakes"
                              : "Shop"}
                        </Link>
                      </div>
                      <button
                        className="text-link item-question"
                        onClick={() =>
                          setEnquiry(
                            `${section.label}: ${item.name || item.title}`.slice(
                              0,
                              100,
                            ),
                          )
                        }
                      >
                        Ask a question
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <Link
              className="context-row"
              href={`/account?intent=${view === "care" ? "appointments" : view === "learn" ? "learning" : "orders"}`}
            >
              <span className={`icon-tile ${section.tint}`}>
                <CalendarDays size={21} />
              </span>
              <span>
                <strong>
                  {view === "care"
                    ? "My appointments"
                    : view === "learn"
                      ? "My learning"
                      : "My orders"}
                </strong>
                <small>Pick up where you left off</small>
              </span>
              <ChevronRight size={20} />
            </Link>
          </>
        )}
        {view === "account" && (
          <div className="account-welcome">
            <div className="account-art">
              <Brand compact />
              <span className="account-art-ring" />
            </div>
            <p className="micro-label">YOUR INCYS</p>
            <h1>
              One account.
              <br />
              Your whole journey.
            </h1>
            <p>Keep your care, learning and orders together.</p>
            {accountLoading ? (
              <p role="status">Opening your account…</p>
            ) : (
              <>
                <Link className="button" href={`/login?intent=${intent}`}>
                  Sign in or create account
                </Link>
                {accountError && (
                  <p role="alert" className="error">
                    {accountError}
                  </p>
                )}
              </>
            )}
            <div className="account-benefits">
              <span>
                <ShieldCheck />
                Private records
              </span>
              <span>
                <CalendarDays />
                Easy bookings
              </span>
              <span>
                <BookOpen />
                Your learning
              </span>
            </div>
            <div className="account-options">
              <button
                className="context-row"
                onClick={() => setEnquiry("Account & sign-in help")}
              >
                <span className="icon-tile mint">
                  <MessageCircle />
                </span>
                <span>
                  <strong>Need a hand?</strong>
                  <small>Contact the institute</small>
                </span>
                <ChevronRight size={20} />
              </button>
              <details className="install-guide">
                <summary>
                  <Smartphone size={21} />
                  <span>Keep INCYS on your home screen</span>
                  <ChevronRight size={18} />
                </summary>
                <p>
                  On iPhone: open in Safari, tap Share, then Add to Home Screen.
                  On Android: open the browser menu and choose Install app or
                  Add to Home screen.
                </p>
              </details>
            </div>
          </div>
        )}
        <footer className="consumer-footer">
          <Brand compact />
          <span>
            Institute of Nature Cure & Yogic Science
            <br />
            <small>Balasore, Odisha</small>
          </span>
          <button
            className="text-link"
            onClick={() => setEnquiry("General enquiry")}
          >
            Get in touch
          </button>
        </footer>
      </main>
      <BottomNav active={view} />
      {enquiry && (
        <EnquirySheet interest={enquiry} close={() => setEnquiry(null)} />
      )}
    </div>
  );
}
