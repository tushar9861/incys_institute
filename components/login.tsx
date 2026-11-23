"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Leaf, ShieldCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-client";
import {
  api,
  signIn,
  signUp,
  preferredRole,
  hostedAuthEnabled,
  supabaseEnabled,
  setRecoveredPassword,
  type AuthenticatorSecret,
  AuthenticatorChallenge,
  confirmAuthenticator,
  startAuthenticatorSetup,
  finishAuthenticatorSetup,
  resetPassword,
} from "@/lib/client";
export function Login() {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [demo, setDemo] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [challenge, setChallenge] = useState<AuthenticatorChallenge | null>(null),
    [secret, setSecret] = useState<AuthenticatorSecret | null>(null),
    [recovery, setRecovery] = useState(false),
    [qr, setQr] = useState(""),
    [code, setCode] = useState("");
  useEffect(() => {
    api("config")
      .then((c) => setDemo(c.demo))
      .catch(() => {});
    if (supabaseEnabled) {
      const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      });
      return () => data.subscription.unsubscribe();
    }
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (recovery) {
        await setRecoveredPassword(password);
        setRecovery(false);
        setPassword("");
        setNotice("Password updated. Sign in with your new password.");
        return;
      }
      if (secret) {
        await finishAuthenticatorSetup(secret, code);
        setSecret(null);
        setQr("");
        setCode("");
        setNotice(
          "Authenticator added. Sign in again to verify your new second factor.",
        );
        return;
      }
      const r = challenge
        ? await confirmAuthenticator(challenge, code)
        : signup
          ? await signUp(String(f.get("name")), email, password)
          : await signIn(email, password);
      window.location.href = `/portal/${preferredRole(r.user.roles)}`;
    } catch (e) {
      if (e instanceof AuthenticatorChallenge) setChallenge(e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setup() {
    setBusy(true);
    setError("");
    try {
      const s = await startAuthenticatorSetup();
      const q = await import("qrcode");
      setQr(await q.toDataURL(s.generateQrCodeUrl(email, "INCYS")));
      setSecret(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Link href="/" className="brand light">
          <Leaf />
          INCYS<span>Institute of Nature Cure & Yogic Science</span>
        </Link>
        <div>
          <p className="eyebrow">Your connected wellness space</p>
          <h1>
            A little more balance.
            <br />A world of possibilities.
          </h1>
          <p>
            Care for your wellbeing. Deepen your learning. Stay connected with
            your institute.
          </p>
          <div className="login-promise">
            <ShieldCheck size={24} />
            <span>
              Your records are shared only with the people authorized to help
              you.
            </span>
          </div>
        </div>
        <small>Balasore, Odisha</small>
      </section>
      <section className="login-form">
        <Link className="text-link" href="/">
          Back to institute
        </Link>
        <h2>
          {recovery
            ? "Choose a new password"
            : secret
              ? "Set up your authenticator"
              : challenge
                ? "Verify your sign-in"
                : signup
                  ? "Create your account"
                  : "Welcome back"}
        </h2>
        <p className="muted">
          {secret
            ? "Scan this code with your authenticator app, then enter its six-digit code."
            : challenge
              ? "Enter the code from your registered authenticator app."
              : signup
                ? "Start your learning and wellness journey."
                : "Sign in to continue to your workspace."}
        </p>
        <form onSubmit={submit}>
          {secret && (
            <>
              <img
                src={qr}
                alt="Authenticator enrollment QR code"
                width={200}
                height={200}
              />
              <p>
                Manual setup key:{" "}
                <code className="preserve-text">{secret.secretKey}</code>
              </p>
            </>
          )}
          {recovery ? (
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          ) : secret || challenge ? (
            <label>
              Authenticator code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                autoFocus
              />
            </label>
          ) : (
            <>
              {signup && (
                <label>
                  Full name
                  <input
                    name="name"
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  minLength={signup ? 12 : 1}
                />
              </label>
              {signup && (
                <label className="check">
                  <input type="checkbox" required />I agree to create an
                  institute account for booking, learning and support.
                </label>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy
              ? "Please wait…"
              : recovery
                ? "Update password"
                : secret
                  ? "Enable authenticator"
                  : challenge
                    ? "Verify code"
                    : signup
                      ? "Create account"
                      : "Sign in"}
          </button>
        </form>
        {hostedAuthEnabled &&
          error.includes("Multi-factor authentication is required") && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={setup}
            >
              Set up authenticator
            </button>
          )}
        {!secret && !challenge && !recovery && (
          <>
            <button
              className="text-link"
              onClick={() => {
                setSignup(!signup);
                setError("");
              }}
            >
              {signup
                ? "Already registered? Sign in"
                : "New here? Create an account"}
            </button>
            {hostedAuthEnabled && !signup && (
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    await resetPassword(email);
                    setNotice(
                      "If the account exists, a password reset email will be sent.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Reset password
              </button>
            )}
          </>
        )}
        {(secret || challenge) && (
          <button
            className="text-link"
            onClick={() => {
              setSecret(null);
              setChallenge(null);
              setCode("");
              setQr("");
              setError("");
            }}
          >
            Back to sign-in
          </button>
        )}
        {demo && (
          <div className="demo-login">
            <strong>Development preview</strong>
            <p>Synthetic accounts and simulated payments.</p>
            <div className="chips">
              {[
                "patient",
                "student",
                "trainer",
                "vendor",
                "admin",
                "clinician",
                "reception",
                "finance",
              ].map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    setSignup(false);
                    setEmail(`${role}@demo.incys.local`);
                    setPassword("local-demo-only-change-me");
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
            <small>Sample passwords are for local development only.</small>
          </div>
        )}
      </section>
    </main>
  );
}
