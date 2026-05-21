import { NextResponse } from "next/server";
import { isAmazonUrl } from "@/lib/amazon";
import { stripSynapseAffiliate, withSynapseAffiliate } from "@/lib/synapseAffiliate";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { fetchOgpResilient, needsImageRefresh, needsTitleRefresh, pureTitleForResponse } from "@/lib/ogpResolve";
import { createAnonClient, createServiceClient, type ContentMetadataRow } from "@/lib/supabase/clients";
import { upsertContentMetadata } from "@/lib/workResolve";

/** 画像キャッシュは活かしつつ、概要が空・Amazon の短いメタだけならライブ取得で上書きする */
function needsDescriptionRefresh(desc: string | null | undefined, pageUrl: string): boolean {
  const d = desc?.trim() ?? "";
  if (!d) return true;
  if (/^amazon\.co\.jp\s*[:：]/i.test(d)) return true;
  try {
    if (isAmazonUrl(pageUrl) && d.length < 160) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const url = reqUrl.searchParams.get("url");
  const forceRefresh = reqUrl.searchParams.get("refresh") === "1";
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  try {
    const normalizedUrl = normalizeSynapseEndpoint(url);

    const supabase = createAnonClient();
    const candidates = Array.from(
      new Set([normalizedUrl, url, stripSynapseAffiliate(url), withSynapseAffiliate(normalizedUrl)]),
    );
    let cached: ContentMetadataRow | null = null;

    for (const u of candidates) {
      const { data } = await supabase
        .from("contents_metadata")
        .select("*")
        .eq("url", u)
        .maybeSingle();
      if (data) {
        cached = data as ContentMetadataRow;
        break;
      }
    }

    // 画像・概要が揃っていても、タイトルが汎用ホスト名だけならライブ取得する（refresh=1 で常にライブ）
    if (
      !forceRefresh &&
      cached?.image_url &&
      !needsImageRefresh(cached.image_url) &&
      !needsDescriptionRefresh(cached.description, normalizedUrl) &&
      !needsTitleRefresh(cached.title, normalizedUrl)
    ) {
      const pureTitle = pureTitleForResponse(cached.title, normalizedUrl);
      const storedTitle = cached.title?.trim() ?? null;
      if (pureTitle && storedTitle && pureTitle !== storedTitle) {
        try {
          const service = createServiceClient();
          await upsertContentMetadata(service, normalizedUrl, {
            title: pureTitle,
            description: cached.description,
            imageUrl: cached.image_url,
            siteName: cached.site_name,
          });
        } catch {
          // noop — 表示は pureTitle で返す
        }
      }
      return NextResponse.json({
        title: pureTitle,
        description: cached.description,
        imageUrl: cached.image_url,
        siteName: cached.site_name,
      });
    }

    const og = await fetchOgpResilient(normalizedUrl);

    const merged = {
      title: pureTitleForResponse(og.title ?? cached?.title ?? null, normalizedUrl),
      description:
        og.description && (!cached?.description || og.description.length > cached.description.length)
          ? og.description
          : (cached?.description ?? og.description ?? null),
      imageUrl: og.imageUrl ?? cached?.image_url ?? null,
      siteName: og.siteName ?? cached?.site_name ?? null,
    };

    try {
      const service = createServiceClient();
      await upsertContentMetadata(service, normalizedUrl, {
        title: merged.title,
        description: merged.description,
        imageUrl: merged.imageUrl,
        siteName: merged.siteName,
      });
    } catch {
      // noop
    }

    return NextResponse.json(merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
