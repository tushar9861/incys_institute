import { supabaseProjectUrl } from "./supabase";
import publicConfig from "../config/supabase.web.json";
let cached: { value: boolean; expires: number; url: string } | undefined;
// This endpoint exposes provider availability only, never OAuth credentials.
// Checking the hosted provider avoids offering a button that cannot create an app session.
export async function googleSignInAvailable(): Promise<boolean> {
  if (process.env.GOOGLE_SIGN_IN_ENABLED === "false") return false;
  if (process.env.AUTH_MODE === "firebase")
    return process.env.GOOGLE_SIGN_IN_ENABLED === "true";
  if (process.env.AUTH_MODE !== "supabase") return false;
  const url = supabaseProjectUrl();
  if (cached?.url === url && cached.expires > Date.now()) return cached.value;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey:
          process.env.SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey,
      },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const settings = response.ok ? await response.json() : null;
    const value = settings?.external?.google === true;
    cached = { value, url, expires: Date.now() + 60000 };
    return value;
  } catch {
    return false;
  }
}
