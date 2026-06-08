import { isAdequateWorkOgpMini, isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { lookupWorkEndpoint, type WorkEndpointMap } from "@/lib/workEndpoint";

export type OgpMini = { title: string | null; imageUrl: string | null };

export const ogpMiniCache = new Map<string, OgpMini>();

function cacheKey(url: string): string {
  return url.trim();
}

export function workOgpMiniFromMap(
  url: string,
  workMap: WorkEndpointMap,
  workKey?: string,
): OgpMini | null {
  const info = lookupWorkEndpoint(url, workMap, workKey);
  if (!info) return null;
  const pageUrl = info.representativeUrl || url;
  const mini: OgpMini = { title: info.title, imageUrl: info.imageUrl };
  if (!isAdequateWorkOgpMini(mini.title, mini.imageUrl, pageUrl)) return null;
  return mini;
}

export async function fetchOgpMiniPayload(url: string): Promise<OgpMini | null> {
  async function load(refresh: boolean): Promise<OgpMini | null> {
    const qs = new URLSearchParams({ url });
    if (refresh) qs.set("refresh", "1");
    const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
    const j = (await r.json()) as { error?: string; title?: string | null; imageUrl?: string | null };
    if (j.error) return null;
    return { title: j.title ?? null, imageUrl: j.imageUrl ?? null };
  }

  const o = await load(false);
  if (!o) return null;

  const label = resolveContentDisplayTitle(o.title, url);
  if (isWeakContentTitleLabel(label, url) || !(o.imageUrl ?? "").trim()) {
    const o2 = await load(true);
    if (o2) {
      ogpMiniCache.set(cacheKey(url), o2);
      return o2;
    }
  }

  ogpMiniCache.set(cacheKey(url), o);
  return o;
}

/**
 * workMap（DB）を優先し、不足時だけ /api/ogp にフォールバックする。
 * フォールバック側も弱いタイトル・画像なしなら refresh=1 で再試行する。
 */
export async function resolveWorkOgpMini(opts: {
  url: string;
  workMap?: WorkEndpointMap;
  workKey?: string;
}): Promise<OgpMini> {
  const { url, workMap = {}, workKey } = opts;
  const key = cacheKey(url);

  const cached = ogpMiniCache.get(key);
  if (cached && isAdequateWorkOgpMini(cached.title, cached.imageUrl, url, { requireImage: true })) {
    return cached;
  }

  const fromMap = workOgpMiniFromMap(url, workMap, workKey);
  if (fromMap) {
    ogpMiniCache.set(key, fromMap);
    return fromMap;
  }

  const fetched = await fetchOgpMiniPayload(url);
  return fetched ?? { title: null, imageUrl: null };
}
