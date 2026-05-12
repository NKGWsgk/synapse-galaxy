import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let singleton: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です");
  }
  singleton = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return singleton;
}

