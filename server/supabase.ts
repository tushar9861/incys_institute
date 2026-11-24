import { createClient } from "@supabase/supabase-js";
import { requireThat } from "./errors";
import registeredSupabase from "../config/supabase.web.json";

export function supabaseProjectUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    registeredSupabase.url
  ).replace(/\/$/, "");
}

export function supabaseServer(admin = false) {
  const url = supabaseProjectUrl();
  const key = admin
    ? process.env.SUPABASE_SECRET_KEY
    : process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      registeredSupabase.publishableKey;
  requireThat(
    url && key && new URL(url).protocol === "https:",
    503,
    "The identity and storage service is not configured.",
  );
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
}
