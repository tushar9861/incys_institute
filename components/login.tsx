"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Brand } from "./app-navigation";
import { WellnessArt } from "./wellness-art";
import { supabaseBrowser } from "@/lib/supabase-client";
import {
  api,
  signIn,
  signInGoogle,
  signInDestination,
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
    [demo, setDemo] = useState(false),
    [googleEnabled, setGoogleEnabled] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [challenge, setChallenge] = useState<AuthenticatorChallenge | null>(null),
    [secret, setSecret] = useState<AuthenticatorSecret | null>(null),
    [recovery, setRecovery] = useState(false),
    [qr, setQr] = useState(""),
    [code, setCode] = useState("");
  useEffect(() => {
    api("config")
      .then((c) => {
        setDemo(c.demo);
        setGoogleEnabled(c.googleSignIn);
      })
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
    setNotice("");
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
      window.location.href = signInDestination(r.user.roles);
    } catch (e) {
      if (e instanceof AuthenticatorChallenge) {
        setChallenge(e);
        setError("");
      } else if ((e as Error).message.startsWith("Verification email sent")) {
        setNotice((e as Error).message);
        setSignup(false);
        setPassword("");
      } else setError((e as Error).message);
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
        <Brand />
        <div>
          <p className="micro-label">WELCOME TO YOUR WELLBEING</p>
          <h1>
            A little more balance.
            <br />A space that’s yours.
          </h1>
          <p>Your care and learning, connected.</p>
        </div>
        <WellnessArt />
        <small className="login-promise">
          <ShieldCheck size={19} /> Your records. Your private space.
        </small>
      </section>
      <section className="login-form">
        <Link className="text-link" href="/">
          Back to home
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
                ? "Use at least 12 characters for your password."
                : "Your care, courses and everyday essentials."}
        </p>
        {!secret && !challenge && !recovery && googleEnabled && (
          <>
            <button
              className="button google-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  const r = await signInGoogle();
                  window.location.href = signInDestination(r.user.roles);
                } catch (e) {
                  if (e instanceof AuthenticatorChallenge) setChallenge(e);
                  else setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.01v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"
                />
              </svg>
              Continue with Google
            </button>
            <div className="auth-divider">or use your email</div>
          </>
        )}
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
                <span className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={signup ? "new-password" : "current-password"}
                    required
                    minLength={signup ? 12 : 1}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
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
                setNotice("");
              }}
            >
              {signup
                ? "Already registered? Sign in"
                : "New here? Create an account"}
            </button>
            {hostedAuthEnabled && !signup && (
              <button
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    setError("Enter your email address first.");
                    return;
                  }
                  setBusy(true);
                  setError("");
                  setNotice("");
                  try {
                    await resetPassword(email);
                    setNotice(
                      "If the account exists, a password reset email will be sent.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
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
