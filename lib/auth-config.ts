export const authMode =
  process.env.NEXT_PUBLIC_AUTH_MODE ||
  (process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    ? "firebase"
    : "local");
export const hostedAuthEnabled =
  authMode === "firebase" || authMode === "supabase";
export const supabaseEnabled = authMode === "supabase";
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || registeredSupabase.url,
  key:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    registeredSupabase.publishableKey,
};
import registeredSupabase from "@/config/supabase.web.json";
