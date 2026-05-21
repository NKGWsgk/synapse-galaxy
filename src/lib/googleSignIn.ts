import type { SupabaseClient } from "@supabase/supabase-js";

export function getGoogleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id || null;
}

export async function signInWithGoogleIdToken(
  supabase: SupabaseClient,
  credential: string,
  nonce?: string,
) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    ...(nonce ? { nonce } : {}),
  });
  if (error) throw error;
  return data;
}
