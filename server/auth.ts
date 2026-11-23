import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { one, pool, transaction, audit } from "./db";
import { requireThat, AppError } from "./errors";
export type User = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  active: boolean;
  phone: string | null;
};
export const isDemo = () =>
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
export const has = (user: User, ...roles: string[]) =>
  user.roles.some((role) => roles.includes(role));
export function allow(user: User, ...roles: string[]) {
  requireThat(
    has(user, ...roles),
    403,
    "You do not have permission for this action.",
  );
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function matches(password: string, stored?: string) {
  const [salt, hash] = (
    stored || "00000000000000000000000000000000:" + "0".repeat(128)
  ).split(":");
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function throttle(key: string, limit: number, seconds: number) {
  const result = await one(
    `INSERT INTO rate_limits(key,attempts,reset_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.attempts+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING attempts`,
    [key, seconds],
  );
  requireThat(
    result && result.attempts <= limit,
    429,
    "Too many attempts. Please try again later.",
  );
}
export async function login(email: string, password: string) {
  requireThat(
    process.env.AUTH_MODE === "local" && process.env.NODE_ENV !== "production",
    403,
    "Use the configured identity provider to sign in.",
  );
  await throttle(`login:${email}`, 15, 900);
  const user = await one("SELECT * FROM users WHERE email=$1", [email]);
  const valid = matches(password, user?.password_hash);
  requireThat(
    user && user.active && valid,
    401,
    "Email or password is incorrect.",
  );
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [tokenHash(token), user.id],
  );
  return { token, user: safeUser(user) };
}
export function safeUser(user: Record<string, any>): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    active: user.active,
    phone: user.phone,
  };
}
export async function authenticate(request: Request): Promise<User> {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("incys_session="))
    ?.slice(14);
  if (process.env.AUTH_MODE === "firebase") {
    requireThat(bearer, 401, "Please sign in.");
    if (!getApps().length)
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(bearer, true);
    } catch {
      throw new AppError(
        401,
        "Your session has expired. Please sign in again.",
      );
    }
    requireThat(
      decoded.email_verified && decoded.email,
      403,
      "Verify your email address before continuing.",
    );
    let user = await one("SELECT * FROM users WHERE firebase_uid=$1", [
      decoded.uid,
    ]);
    if (!user) {
      // Never attach an existing privileged account by email alone.
      requireThat(
        !(await one("SELECT id FROM users WHERE email=$1", [
          decoded.email.toLowerCase(),
        ])),
        403,
        "Ask an administrator to link this account to your identity.",
      );
      user = await one(
        "INSERT INTO users(firebase_uid,email,name) VALUES($1,$2,$3) RETURNING *",
        [
          decoded.uid,
          decoded.email.toLowerCase(),
          decoded.name || decoded.email.split("@")[0],
        ],
      );
    }
    requireThat(user?.active, 403, "This account is disabled.");
    if (
      user.roles.some((r: string) =>
        [
          "admin",
          "reception",
          "clinician",
          "trainer",
          "finance",
          "vendor",
        ].includes(r),
      )
    ) {
      requireThat(
        decoded.firebase?.sign_in_second_factor,
        403,
        "Multi-factor authentication is required for staff and vendor accounts.",
      );
    }
    return safeUser(user);
  }
  requireThat(
    process.env.AUTH_MODE === "local" && process.env.NODE_ENV !== "production",
    503,
    "Production authentication is not configured.",
  );
  const token = bearer || cookie;
  requireThat(token, 401, "Please sign in.");
  const user = await one(
    `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND u.active`,
    [tokenHash(token)],
  );
  requireThat(user, 401, "Your session has expired. Please sign in again.");
  return safeUser(user);
}
export async function register(name: string, email: string, password: string) {
  requireThat(
    process.env.AUTH_MODE === "local" && process.env.NODE_ENV !== "production",
    403,
    "Use the configured identity provider to register.",
  );
  await throttle(`signup:${email}`, 5, 3600);
  return transaction(async (db) => {
    requireThat(
      !(await one("SELECT id FROM users WHERE email=$1", [email], db)),
      409,
      "An account already exists for this email.",
    );
    const user = await one(
      "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING *",
      [name, email, hashPassword(password)],
      db,
    );
    await db.query(
      "INSERT INTO consents(user_id,purpose,version,granted) VALUES($1,'account','1',true)",
      [user!.id],
    );
    await audit(db, user!.id, "account.created", user!.id);
    return safeUser(user!);
  });
}
