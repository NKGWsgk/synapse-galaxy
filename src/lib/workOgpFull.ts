import { isAdequateWorkOgpMini, isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { lookupWorkEndpoint, type WorkEndpointMap } from "@/lib/workEndpoint";
import { fetchOgpMiniPayload, ogpMiniCache, type OgpMini } from "@/lib/workOgpMini";

type OgpFull = {
  title: string | null;
  imageUrl: string | null;
  description: string | null;
};

function workOgpFullFromMap(
  url: string,
  workMap: WorkEndpointMap,
  workKey?: string,
): OgpFull | null {
  const info = lookupWorkEndpoint(url, workMap, workKey);
  if (!info) return null;
  const pageUrl = info.representativeUrl || url;
  if (!isAdequateWorkOgpMini(info.title, info.imageUrl, pageUrl)) return null;
  return { title: info.title, imageUrl: info.imageUrl, description: null };
}

export async function fetchWorkOgpFull(
  url: string,
  workMap: WorkEndpointMap = {},
  workKey?: string,
): Promise<OgpFull | null> {
  const fromMap = workOgpFullFromMap(url, workMap, workKey);
  if (fromMap?.title && (fromMap.imageUrl ?? "").trim()) {
    ogpMiniCache.set(url, { title: fromMap.title, imageUrl: fromMap.imageUrl });
    return fromMap;
  }

  async function load(refresh: boolean): Promise<OgpFull | null> {
    const qs = new URLSearchParams({ url });
    if (refresh) qs.set("refresh", "1");
    const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
    const data = (await r.json()) as {
      error?: string;
      title?: string | null;
      imageUrl?: string | null;
      description?: string | null;
    };
    if (data.error) return fromMap;
    const result: OgpFull = {
      title: data.title ?? fromMap?.title ?? null,
      imageUrl: data.imageUrl ?? fromMap?.imageUrl ?? null,
      description: data.description ?? null,
    };
    ogpMiniCache.set(url, { title: result.title, imageUrl: result.imageUrl });
    const label = resolveContentDisplayTitle(result.title, url);
    if (!refresh && (isWeakContentTitleLabel(label, url) || !(result.imageUrl ?? "").trim())) {
      return load(true);
    }
    return result;
  }

  try {
    return await load(false);
  } catch {
    return fromMap;
  }
}

export type { OgpMini };
