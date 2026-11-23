"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./auth-config";
let instance: SupabaseClient | undefined;
export function supabaseBrowser() {
  if (!supabaseConfig.url || !supabaseConfig.key)
    throw new Error("Sign-in is not configured yet.");
  return (instance ??= createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: { flowType: "pkce", detectSessionInUrl: true },
  }));
}
