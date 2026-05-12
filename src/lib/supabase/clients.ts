import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Legacy JWT の `role`（sb_* キーでは使わない） */
function jwtRole(key: string): string | undefined {
  if (!key.startsWith("eyJ")) return undefined;
  try {
    const mid = key.split(".")[1];
    if (!mid) return undefined;
    const json = Buffer.from(mid.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    return payload.role;
  } catch {
    return undefined;
  }
}

export type SynapseRow = {
  id: string;
  user_id: string | null;
  source_url: string;
  target_url: string;
  description: string;
  keywords: string[];
  likes_count: number;
  /** 理系度 0〜10（AIが接続の文脈から推定） */
  dim_rika:   number | null;
  /** 文系度 0〜10 */
  dim_bunkei: number | null;
  /** 芸術度 0〜10 */
  dim_art:    number | null;
  /** 時間軸 -5（歴史）〜 +5（未来） */
  dim_time:   number | null;
  created_at: string;
  updated_at: string;
};

export type ContentMetadataRow = {
  id: string;
  url: string;
  canonical_id: string;
  purchase_links: Record<string, unknown>;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  created_at: string;
  updated_at: string;
};

export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です");
  }
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY に Secret（sb_secret_…）が入っています。Publishable（sb_publishable_…）または Legacy の anon（eyJ…）をここに、Secret は SUPABASE_SERVICE_ROLE_KEY に置いてください。",
    );
  }
  const role = jwtRole(key);
  if (role === "service_role") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY に service_role 用 JWT が入っています。anon / publishable 用キーと入れ替えてください。",
    );
  }
  return createClient(url, key);
}

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
  }
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY に publishable（sb_publishable_…）が入っています。Secret（sb_secret_…）または Legacy の service_role JWT を設定してください。",
    );
  }
  const role = jwtRole(key);
  if (role === "anon") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY に anon 用 JWT が入っています。service_role または sb_secret_… に差し替えてください。",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Authorization: Bearer <access_token> 付きの anon クライアント（ユーザー特定用） */
export function createAuthedAnonClient(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です");
  }
  if (!accessToken.trim()) {
    throw new Error("accessToken is empty");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
