"use client";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig, firebaseEnabled } from "./firebase-config";
import { supabaseEnabled } from "./auth-config";
import { supabaseBrowser } from "./supabase-client";
export { firebaseEnabled } from "./firebase-config";
export { hostedAuthEnabled, supabaseEnabled } from "./auth-config";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
  sendPasswordResetEmail,
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type MultiFactorError,
  type TotpSecret,
} from "firebase/auth";
export async function authHeaders(): Promise<Record<string, string>> {
  if (supabaseEnabled) {
    const { data, error } = await supabaseBrowser().auth.getSession();
    if (error) throw error;
    return data.session
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  }
  if (!firebaseEnabled) return {};
  await auth().authStateReady();
  const token = await auth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function auth() {
  if (!getApps().some((app) => app.name === "[DEFAULT]"))
    initializeApp(firebaseConfig);
  return getAuth();
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  Object.assign(headers, await authHeaders());
  const response = await fetch(`/api/v1/${path}`, {
    method,
    signal: AbortSignal.timeout(90000),
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({
    error: "The service is temporarily unavailable. Please try again.",
  }));
  if (!response.ok)
    throw new ApiError(
      data.fields?.length
        ? `${data.error} ${data.fields.map((f: any) => `${f.path}: ${f.message}`).join(" ")}`
        : data.error || "Request failed.",
      response.status,
    );
  return data;
}
// Firebase handles Google's popup; Supabase remains the single application session.
// Neither Firebase access tokens nor an email address grant access to app records.
export async function signInGoogle() {
  if (!supabaseEnabled && !firebaseEnabled)
    throw new Error("Google sign-in is available on the hosted app.");
  const provider = new GoogleAuthProvider();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(nonce),
  );
  const hashedNonce = Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  provider.setCustomParameters({
    prompt: "select_account",
    nonce: hashedNonce,
  });
  // The transient Firebase session is separate from any legacy Firebase app session.
  const googleAuth = supabaseEnabled
    ? getAuth(
        getApps().find((app) => app.name === "incys-google") ||
          initializeApp(firebaseConfig, "incys-google"),
      )
    : auth();
  if (supabaseEnabled) await setPersistence(googleAuth, inMemoryPersistence);
  try {
    const result = await signInWithPopup(googleAuth, provider);
    if (supabaseEnabled) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.idToken)
        throw new Error(
          "Google didn’t return a sign-in credential. Please try again.",
        );
      const { error } = await supabaseBrowser().auth.signInWithIdToken({
        provider: "google",
        token: credential.idToken,
        nonce,
      });
      if (error) throw error;
      const { data, error: factorsError } =
        await supabaseBrowser().auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      if (data.totp.length)
        throw new AuthenticatorChallenge(undefined, data.totp[0].id);
    }
    return { user: await api("me") };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    )
      throw new Error(
        "Sign-in was closed. You can try again when you’re ready.",
      );
    if (code === "auth/popup-blocked")
      throw new Error(
        "Allow the Google sign-in window in your browser, then try again.",
      );
    if (code === "auth/multi-factor-auth-required") {
      if (supabaseEnabled)
        throw new Error(
          "This Google identity has an additional Firebase verification requirement. Use your existing email sign-in or contact the institute for help.",
        );
      throw new AuthenticatorChallenge(
        getMultiFactorResolver(googleAuth, error as MultiFactorError),
      );
    }
    throw error;
  } finally {
    if (supabaseEnabled) await signOut(googleAuth).catch(() => {});
  }
}
export function signInDestination(roles: string[]) {
  const intent = new URLSearchParams(window.location.search).get("intent");
  return `/portal/${preferredRole(roles)}${intent && ["appointments", "learning", "shop", "orders", "support", "account"].includes(intent) ? `?tab=${intent}` : ""}`;
}
export async function signIn(email: string, password: string) {
  if (supabaseEnabled) {
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    const { data, error: factorsError } =
      await supabaseBrowser().auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    if (data.totp.length)
      throw new AuthenticatorChallenge(undefined, data.totp[0].id);
    return { user: await api("me") };
  }
  if (firebaseEnabled) {
    try {
      await signInWithEmailAndPassword(auth(), email, password);
    } catch (e) {
      if ((e as { code: string }).code === "auth/multi-factor-auth-required")
        throw new AuthenticatorChallenge(
          getMultiFactorResolver(auth(), e as MultiFactorError),
        );
      throw e;
    }
    return { user: await api("me") };
  }
  return api("auth/login", "POST", { email, password });
}
export async function signUp(name: string, email: string, password: string) {
  if (supabaseEnabled) {
    const { error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: {
        data: { name, account_consent: true },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
    throw new Error(
      "Verification email sent. Verify your email, then sign in.",
    );
  }
  if (firebaseEnabled) {
    const result = await createUserWithEmailAndPassword(
      auth(),
      email,
      password,
    );
    await updateProfile(result.user, { displayName: name });
    await sendEmailVerification(result.user);
    throw new Error(
      "Verification email sent. Verify your email, then sign in.",
    );
  }
  await api("auth/register", "POST", { name, email, password, consent: true });
  return signIn(email, password);
}
export async function logout() {
  if (supabaseEnabled) {
    const { error } = await supabaseBrowser().auth.signOut({ scope: "local" });
    if (error) throw error;
  } else if (firebaseEnabled) await signOut(auth());
  else await api("auth/logout", "POST", {});
}
export class AuthenticatorChallenge extends Error {
  constructor(
    public resolver?: MultiFactorResolver,
    public factorId?: string,
  ) {
    super("Enter the code from your authenticator app.");
  }
}
export async function confirmAuthenticator(
  challenge: AuthenticatorChallenge,
  code: string,
) {
  if (challenge.factorId && supabaseEnabled) {
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({
      factorId: challenge.factorId,
      code,
    });
    if (error) throw error;
    return { user: await api("me") };
  }
  if (!challenge.resolver) throw new Error("Please sign in again.");
  const factor = challenge.resolver.hints.find(
    (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
  if (!factor)
    throw new Error(
      "This account needs its registered authentication method. Contact your administrator.",
    );
  await challenge.resolver.resolveSignIn(
    TotpMultiFactorGenerator.assertionForSignIn(factor.uid, code),
  );
  return { user: await api("me") };
}
export type AuthenticatorSecret = {
  secretKey: string;
  generateQrCodeUrl: (email: string, issuer: string) => string;
  firebase?: TotpSecret;
  factorId?: string;
};
export async function startAuthenticatorSetup(): Promise<AuthenticatorSecret> {
  if (supabaseEnabled) {
    const client = supabaseBrowser();
    const { data: current, error: listError } =
      await client.auth.mfa.listFactors();
    if (listError) throw listError;
    for (const factor of current.all.filter(
      (f) => f.status === "unverified" && f.factor_type === "totp",
    )) {
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "INCYS authenticator",
      issuer: "INCYS",
    });
    if (error) throw error;
    return {
      secretKey: data.totp.secret,
      generateQrCodeUrl: () => data.totp.uri,
      factorId: data.id,
    };
  }
  const user = auth().currentUser;
  if (!user?.emailVerified)
    throw new Error("Sign in with a verified email first.");
  const secret = await TotpMultiFactorGenerator.generateSecret(
    await multiFactor(user).getSession(),
  );
  return {
    secretKey: secret.secretKey,
    generateQrCodeUrl: (email, issuer) =>
      secret.generateQrCodeUrl(email, issuer),
    firebase: secret,
  };
}
export async function finishAuthenticatorSetup(
  secret: AuthenticatorSecret,
  code: string,
) {
  if (supabaseEnabled && secret.factorId) {
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({
      factorId: secret.factorId,
      code,
    });
    if (error) throw error;
    await logout();
    return;
  }
  const user = auth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  await multiFactor(user).enroll(
    TotpMultiFactorGenerator.assertionForEnrollment(secret.firebase!, code),
    "INCYS authenticator",
  );
  await signOut(auth());
}
export async function resetPassword(email: string) {
  if (supabaseEnabled) {
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/login` },
    );
    if (error) throw error;
    return;
  }
  if (!firebaseEnabled)
    throw new Error(
      "Password reset requires the configured identity provider.",
    );
  await sendPasswordResetEmail(auth(), email);
}
export async function setRecoveredPassword(password: string) {
  const { error } = await supabaseBrowser().auth.updateUser({ password });
  if (error) throw error;
  await logout();
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
export const preferredRole = (roles: string[]) =>
  [
    "admin",
    "clinician",
    "reception",
    "finance",
    "trainer",
    "vendor",
    "student",
    "patient",
  ].find((r) => roles.includes(r)) || "patient";
