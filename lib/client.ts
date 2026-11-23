"use client";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
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
export const firebaseEnabled = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
);
export async function authHeaders(): Promise<Record<string, string>> {
  if (!firebaseEnabled) return {};
  await auth().authStateReady();
  const token = await auth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function auth() {
  if (!getApps().length)
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  return getAuth();
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (firebaseEnabled) {
    await auth().authStateReady();
    const token = await auth().currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`/api/v1/${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.fields?.length
        ? `${data.error} ${data.fields.map((f: any) => `${f.path}: ${f.message}`).join(" ")}`
        : data.error || "Request failed.",
    );
  return data;
}
export async function signIn(email: string, password: string) {
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
  if (firebaseEnabled) await signOut(auth());
  else await api("auth/logout", "POST", {});
}
export class AuthenticatorChallenge extends Error {
  constructor(public resolver: MultiFactorResolver) {
    super("Enter the code from your authenticator app.");
  }
}
export async function confirmAuthenticator(
  challenge: AuthenticatorChallenge,
  code: string,
) {
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
export async function startAuthenticatorSetup() {
  const user = auth().currentUser;
  if (!user?.emailVerified)
    throw new Error("Sign in with a verified email first.");
  return TotpMultiFactorGenerator.generateSecret(
    await multiFactor(user).getSession(),
  );
}
export async function finishAuthenticatorSetup(
  secret: TotpSecret,
  code: string,
) {
  const user = auth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  await multiFactor(user).enroll(
    TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
    "INCYS authenticator",
  );
  await signOut(auth());
}
export async function resetPassword(email: string) {
  if (!firebaseEnabled)
    throw new Error(
      "Password reset requires the configured identity provider.",
    );
  await sendPasswordResetEmail(auth(), email);
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
