import type { SupabaseClient } from "@supabase/supabase-js";

/** サーバー実行時: NEXT_PUBLIC_* または GOOGLE_CLIENT_ID から解決 */
export function resolveGoogleClientIdFromEnv(): string | null {
  const id =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim();
  return id || null;
}

export function getGoogleClientId(): string | null {
  return resolveGoogleClientIdFromEnv();
}

/** layout の JSON script から Client ID を読む（クライアント専用フォールバック） */
export function readGoogleClientIdFromPage(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const el = document.getElementById("sg-public-config");
    if (!el?.textContent) return null;
    const parsed = JSON.parse(el.textContent) as { googleClientId?: string | null };
    const id = parsed.googleClientId;
    return typeof id === "string" ? id.trim() || null : null;
  } catch {
    return null;
  }
}

export function resolveGoogleClientId(explicit?: string | null): string | null {
  return explicit?.trim() || readGoogleClientIdFromPage() || getGoogleClientId();
}

/** /api/auth/google-config から Client ID を取得（Vercel 本番向けフォールバック） */
export async function fetchGoogleClientIdFromApi(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/google-config", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { googleClientId?: string | null };
    const id = data.googleClientId;
    return typeof id === "string" ? id.trim() || null : null;
  } catch {
    return null;
  }
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
