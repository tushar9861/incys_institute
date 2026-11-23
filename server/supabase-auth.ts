import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { one, transaction, audit } from "./db";
import { AppError, requireThat } from "./errors";
import { supabaseServer } from "./supabase";

const identityClaims = z.object({
  sub: z.string().uuid(),
  session_id: z.string().uuid(),
  aal: z.enum(["aal1", "aal2"]),
});
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifiedSupabaseClaims(
  token: string,
  issuer: string,
  jwks: JWTVerifyGetKey,
) {
  try {
    requireThat(token.length <= 16384, 401, "Invalid identity token.");
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: "authenticated",
      algorithms: ["ES256", "RS256"],
      requiredClaims: ["exp", "sub", "session_id", "aal"],
    });
    return identityClaims.parse(payload);
  } catch {
    throw new AppError(401, "Your session has expired. Please sign in again.");
  }
}

export async function authenticateSupabase(token: string) {
  const client = supabaseServer();
  const url = (process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL)!.replace(/\/$/, "");
  const issuer = `${url}/auth/v1`;
  if (!keys.has(issuer))
    keys.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
        timeoutDuration: 10000,
      }),
    );
  const claims = await verifiedSupabaseClaims(token, issuer, keys.get(issuer)!);
  const { data, error } = await client.auth.getUser(token);
  requireThat(
    !error && data.user?.id === claims.sub,
    401,
    "Your session has expired. Please sign in again.",
  );
  const identity = data.user;
  requireThat(
    !identity.deleted_at &&
      (!identity.banned_until ||
        Date.parse(identity.banned_until) <= Date.now()),
    403,
    "This account is disabled.",
  );
  requireThat(
    identity.email && identity.email_confirmed_at,
    403,
    "Verify your email address before continuing.",
  );
  const active = await one(
    "SELECT is_supabase_session_active($1::uuid,$2::uuid) AS active",
    [identity.id, claims.session_id],
  );
  requireThat(
    active?.active,
    401,
    "Your session has expired. Please sign in again.",
  );
  let user = await one("SELECT * FROM users WHERE supabase_uid=$1", [
    identity.id,
  ]);
  if (!user) {
    user = await transaction(async (db) => {
      requireThat(
        !(await one(
          "SELECT id FROM users WHERE email=$1 AND supabase_uid IS DISTINCT FROM $2::uuid",
          [identity.email!.toLowerCase(), identity.id],
          db,
        )),
        403,
        "Ask an administrator to link this account to your identity.",
      );
      const result = await one(
        "INSERT INTO users(supabase_uid,email,name) VALUES($1,$2,$3) ON CONFLICT(supabase_uid) DO UPDATE SET supabase_uid=excluded.supabase_uid RETURNING *",
        [
          identity.id,
          identity.email!.toLowerCase(),
          String(
            identity.user_metadata?.name || identity.email!.split("@")[0],
          ).slice(0, 100),
        ],
        db,
      );
      await audit(db, result!.id, "account.identity_linked", result!.id, {
        provider: "supabase",
      });
      return result;
    });
  }
  requireThat(user?.active, 403, "This account is disabled.");
  if (
    identity.factors?.some((factor) => factor.status === "verified") ||
    user.roles.some((role: string) =>
      [
        "admin",
        "reception",
        "clinician",
        "trainer",
        "finance",
        "vendor",
      ].includes(role),
    )
  ) {
    requireThat(
      claims.aal === "aal2",
      403,
      "Multi-factor authentication is required. Complete authenticator verification on the website.",
    );
  }
  return user;
}
