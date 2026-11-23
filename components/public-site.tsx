"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Leaf,
  BookOpen,
  HeartPulse,
  CalendarDays,
  MapPin,
  Phone,
  ShoppingBag,
  Check,
  Menu,
} from "lucide-react";
import { api, money } from "@/lib/client";
export function PublicSite() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [demo, setDemo] = useState(false),
    [nav, setNav] = useState(false);
  useEffect(() => {
    api("catalog")
      .then(setData)
      .catch((e) => setError(e.message));
    api("config")
      .then((c) => setDemo(c.demo))
      .catch(() => {});
  }, []);
  async function enquire(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      await api("enquiries", "POST", {
        name: f.get("name"),
        email: f.get("email"),
        interest: f.get("interest"),
        message: f.get("message"),
        consent: true,
      });
      setMessage("Thank you. Your enquiry is with the institute team.");
      form.reset();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="public-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Leaf />
          </span>
          INCYS<span>Learning & wellbeing</span>
        </Link>
        <button
          className="mobile-menu icon-button"
          aria-label="Toggle navigation"
          onClick={() => setNav(!nav)}
        >
          <Menu />
        </button>
        <nav className={nav ? "open" : ""}>
          <a href="#care">Wellness & care</a>
          <a href="#learn">Learn with us</a>
          <a href="#store">Wellness store</a>
          <a href="#contact">Contact</a>
        </nav>
        <Link href="/login" className="button small">
          My institute
        </Link>
      </header>
      {demo && (
        <div className="demo-banner">
          Development preview · Sample courses, prices and accounts · No real
          payments
        </div>
      )}
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> ROOTED IN CARE. INSPIRED BY LEARNING.
            </p>
            <h1>
              Make space for
              <br />a healthier <em>you.</em>
            </h1>
            <p className="hero-description">
              Explore thoughtful wellness care, build a lasting yoga practice,
              and learn with a community that grows with you.
            </p>
            <div className="button-row">
              <Link href="/login" className="button">
                Book a consultation
              </Link>
              <a href="#learn" className="button secondary">
                Explore programmes
              </a>
            </div>
            <div className="hero-meta">
              <MapPin size={17} /> Balasore, Odisha <span>•</span> In person &
              online
            </div>
          </div>
          <div className="hero-art">
            <div className="sun-disc" />
            <svg viewBox="0 0 400 380" aria-hidden="true">
              <path
                d="M30 330 Q80 180 200 300 Q310 130 390 330"
                fill="#c0d3ba"
              />
              <path
                d="M75 343 Q50 180 130 100 M92 270 Q25 245 41 208 Q100 198 92 270 M112 211 Q180 199 176 150 Q111 145 112 211 M123 150 Q80 120 103 70 Q147 86 123 150"
                fill="#577b61"
                stroke="#577b61"
                strokeWidth="6"
              />
              <circle cx="247" cy="127" r="27" fill="#e2af86" />
              <path
                d="M222 149 Q248 170 270 147 L289 239 L215 239Z"
                fill="#315c48"
              />
              <path
                d="M226 168 Q209 228 160 232 M267 168 Q295 228 337 230"
                fill="none"
                stroke="#e2af86"
                strokeWidth="17"
                strokeLinecap="round"
              />
              <path
                d="M223 230 Q151 261 186 286 Q240 309 280 277 Q335 261 279 234"
                fill="#243f34"
              />
              <path
                d="M163 234 L183 233 M330 230 L348 235"
                stroke="#e2af86"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M157 310 Q253 294 344 313"
                stroke="#9fba94"
                strokeWidth="15"
                strokeLinecap="round"
              />
            </svg>
            <div className="art-note">
              <span className="round-icon">
                <Leaf size={20} />
              </span>
              <div>
                <strong>Find your everyday balance</strong>
                <span>One practice. One step. One day at a time.</span>
              </div>
            </div>
            <span className="art-caption">
              WELLNESS IS A PRACTICE, NOT A DESTINATION.
            </span>
          </div>
        </section>
        <div className="trust-strip">
          <span>
            <HeartPulse /> Care that starts with you
          </span>
          <span>
            <BookOpen /> Learning with a purpose
          </span>
          <span>
            <CalendarDays /> Connected at every step
          </span>
        </div>
        {error && (
          <p className="error container" role="alert">
            {error}
          </p>
        )}
        <section className="section container" id="care">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR WELLBEING, YOUR WAY</p>
              <h2>Care for every next step.</h2>
            </div>
            <p>
              Discover our services and connect with the institute to find a
              suitable starting point.
            </p>
          </div>
          <div className="cards four">
            {(data?.services || []).map((s: any, i: number) => (
              <article className="service-card" key={s.id}>
                <span className={`round-icon tint-${i % 3}`}>
                  <HeartPulse />
                </span>
                <span className="overline">{s.category}</span>
                <h3>{s.name}</h3>
                <p>{s.description}</p>
                <div className="card-bottom">
                  <span>
                    {s.duration_minutes} min · {money(s.price_paise)}
                  </span>
                  <Link href="/login">Book</Link>
                </div>
              </article>
            ))}
          </div>
          {!data && !error && <p className="muted">Loading services…</p>}
        </section>
        <section className="learning-section" id="learn">
          <div className="container section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">STAY CURIOUS. KEEP GROWING.</p>
                <h2>Learning that moves you forward.</h2>
              </div>
              <Link href="/login" className="button secondary">
                Student sign in
              </Link>
            </div>
            <div className="cards three">
              {(data?.courses || []).map((c: any, i: number) => (
                <article className="course-card" key={c.id}>
                  <div className={`course-cover cover-${i}`}>
                    <BookOpen size={48} strokeWidth={1} />
                    <span>{c.category}</span>
                  </div>
                  <div className="course-content">
                    <p className="overline">{c.duration} · Guided learning</p>
                    <h3>{c.title}</h3>
                    <p>{c.description}</p>
                    <div className="card-bottom">
                      <strong>{money(c.fee_paise)}</strong>
                      <Link href="/login">View intakes</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="section-note">
              Course details, award authority and eligibility should be
              confirmed with the academic office before applying.
            </p>
          </div>
        </section>
        <section className="section container" id="store">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SUPPORT YOUR DAILY PRACTICE</p>
              <h2>Thoughtful essentials.</h2>
            </div>
            <Link href="/login" className="text-link">
              Shop in your account
            </Link>
          </div>
          <div className="cards four">
            {(data?.products || []).slice(0, 4).map((p: any, i: number) => (
              <article className="product-card" key={p.id}>
                <div className={`product-art tint-${i % 3}`}>
                  <ShoppingBag size={52} strokeWidth={1} />
                </div>
                <p className="overline">{p.category}</p>
                <h3>{p.name}</h3>
                <div className="card-bottom">
                  <strong>{money(p.price_paise)}</strong>
                  <span className="muted">
                    {p.stock > 0 ? "Available" : "Out of stock"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="contact-section container" id="contact">
          <div>
            <p className="eyebrow">LET’S FIND YOUR NEXT STEP</p>
            <h2>
              A conversation
              <br />
              is a good beginning.
            </h2>
            <p>
              Questions about a service, course or your account? Leave an
              enquiry and the institute team will follow up.
            </p>
            <p className="contact-detail">
              <MapPin size={20} /> Chidiapolo, Vivekananda Marg,
              <br />
              Balasore, Odisha 756001
            </p>
            <a href="tel:+919437267278" className="contact-detail">
              <Phone size={18} /> +91 94372 67278
            </a>
          </div>
          <form onSubmit={enquire} className="contact-form">
            <div className="form-grid">
              <label>
                Your name
                <input name="name" required minLength={2} />
              </label>
              <label>
                Email address
                <input type="email" name="email" required />
              </label>
            </div>
            <label>
              I’m interested in
              <select name="interest">
                <option>Wellness consultation</option>
                <option>Yoga classes</option>
                <option>Course admissions</option>
                <option>Vendor partnership</option>
                <option>General enquiry</option>
              </select>
            </label>
            <label>
              How can we help?
              <textarea
                name="message"
                required
                minLength={5}
                rows={3}
                placeholder="Please avoid sharing medical records in this form."
              />
            </label>
            <label className="check">
              <input type="checkbox" required />I agree to be contacted about
              this enquiry.
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Sending…" : "Send enquiry"}
            </button>
            {message && <p role="status">{message}</p>}
          </form>
        </section>
      </main>
      <footer className="public-footer">
        <div className="brand">
          <Leaf />
          INCYS<span>Institute of Nature Cure & Yogic Science</span>
        </div>
        <p>Learning. Care. Community.</p>
        <span>Balasore, Odisha</span>
      </footer>
    </>
  );
}
