import { createServiceClient, type SynapseRow } from "@/lib/supabase/clients";
import { endpointDisplayTitle, endpointWorkKey, lookupWorkEndpoint } from "@/lib/workEndpoint";
import { buildWorkEndpointMap } from "@/lib/workResolve";

export type UserGalaxyWork = { title: string; imageUrl: string | null; degree: number };

export type UserGalaxy = {
  displayName: string;
  postCount: number;
  worksCount: number;
  totalLikes: number;
  /** つながりの多い順（先頭がハブ） */
  works: UserGalaxyWork[];
};

/** 共有用の表示名。メールアドレスは公開しない。 */
export function publicDisplayName(meta: Record<string, unknown> | undefined): string {
  const n = (meta?.nickname as string | undefined)?.trim() || (meta?.full_name as string | undefined)?.trim();
  return n || "ユーザー";
}

/** ユーザーページ共有（OGP・シェア文面）用に、投稿数・作品数・主な作品をまとめて取得する。ユーザーがいなければ null。 */
export async function loadUserGalaxy(userId: string): Promise<UserGalaxy | null> {
  const supabase = createServiceClient();
  const { data: userResult, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !userResult?.user) return null;

  const { data } = await supabase
    .from("synapses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const synapses = (data ?? []) as SynapseRow[];

  const workMap = await buildWorkEndpointMap(supabase, synapses.flatMap((s) => [s.source_url, s.target_url]));
  const byKey = new Map<string, { url: string; degree: number }>();
  for (const s of synapses) {
    for (const url of [s.source_url, s.target_url]) {
      const key = endpointWorkKey(url, workMap);
      const cur = byKey.get(key);
      if (cur) cur.degree += 1;
      else byKey.set(key, { url, degree: 1 });
    }
  }
  const works = [...byKey.entries()]
    .sort((a, b) => b[1].degree - a[1].degree)
    .map(([key, v]) => ({
      title: endpointDisplayTitle(v.url, workMap),
      imageUrl: lookupWorkEndpoint(v.url, workMap, key)?.imageUrl ?? null,
      degree: v.degree,
    }));

  return {
    displayName: publicDisplayName(userResult.user.user_metadata),
    postCount: synapses.length,
    worksCount: byKey.size,
    totalLikes: synapses.reduce((sum, s) => sum + (s.likes_count ?? 0), 0),
    works,
  };
}
