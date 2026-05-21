import { isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { ogpMiniCache } from "@/components/galaxy/FocusCompass";

type OgpFull = {
  title: string | null;
  imageUrl: string | null;
  description: string | null;
};

export async function fetchWorkOgpFull(url: string): Promise<OgpFull | null> {
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
    if (data.error) return null;
    const result: OgpFull = {
      title: data.title ?? null,
      imageUrl: data.imageUrl ?? null,
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
    return null;
  }
}
