import type { SupabaseClient } from "@supabase/supabase-js";

export function getGoogleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id || null;
}

/** layout の JSON script から Client ID を読む（クライアント専用フォールバック） */
export function readGoogleClientIdFromPage(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const el = document.getElementById("sg-public-config");
    if (!el?.textContent) return null;
    const parsed = JSON.parse(el.textContent) as { googleClientId?: string };
    return parsed.googleClientId?.trim() || null;
  } catch {
    return null;
  }
}

export function resolveGoogleClientId(explicit?: string | null): string | null {
  return explicit?.trim() || readGoogleClientIdFromPage() || getGoogleClientId();
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
