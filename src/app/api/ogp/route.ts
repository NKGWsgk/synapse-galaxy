import { NextResponse } from "next/server";
import { amazonAsinFromUrl, isAmazonUrl } from "@/lib/amazon";
import { stripSynapseAffiliate, withSynapseAffiliate } from "@/lib/synapseAffiliate";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { fetchOgp } from "@/lib/ogp";
import { extractPureWorkTitle } from "@/lib/pureWorkTitle";
import { createAnonClient, createServiceClient, type ContentMetadataRow } from "@/lib/supabase/clients";
import { upsertContentMetadata } from "@/lib/workResolve";

/** ISBN-10 → ISBN-13 変換（先頭に"978"を付け、チェックデジットを再計算） */
function isbn10ToIsbn13(isbn10: string): string {
  const digits = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return digits + check;
}

function cleanTitleForHost(title: string | null, pageUrl: string): string | null {
  if (!title) return null;
  let t = title.trim();
  if (!t) return null;

  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (host === "amazon.co.jp" || host.endsWith(".amazon.co.jp")) {
      t = t.replace(/^amazon\.co\.jp\s*[:：]\s*/i, "");
    } else if (host === "amazon.com" || host.endsWith(".amazon.com")) {
      t = t.replace(/^amazon\.com\s*[:：]\s*/i, "");
    }
  } catch {
    // ignore
  }

  return t || null;
}

function pureTitleForResponse(title: string | null | undefined, pageUrl: string): string | null {
  const t = title ?? null;
  return extractPureWorkTitle(t, pageUrl) ?? cleanTitleForHost(t, pageUrl);
}

/** タイトルが商品名・動画名として使えないときはライブ取得で直す（キャッシュに site 名だけ残っているケース） */
function needsTitleRefresh(title: string | null | undefined, pageUrl: string): boolean {
  const t = title?.trim() ?? "";
  if (!t) return true;
  if (t.length < 2) return true;

  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    const tl = t.toLowerCase();

    if (isAmazonUrl(pageUrl)) {
      if (/^amazon\.co\.jp$/i.test(t)) return true;
      if (/^amazon\.com$/i.test(t)) return true;
      if (tl === "amazon") return true;
      // OGP が「Amazon.co.jp | 本題…」のとき、DB に先頭だけ残っていると表示が壊れる
      if (/^amazon\.co\.jp\s*\|/i.test(t)) return true;
      const asin = amazonAsinFromUrl(pageUrl);
      // （Amazon）ASIN フォールバックが DB に保存されているケース（全角・半角どちらも）
      if (asin && /^[（(]\s*amazon\s*[）)]/i.test(t.normalize("NFKC"))) return true;
      const alnum = t.replace(/[^a-z0-9]/gi, "");
      if (asin && alnum.length <= 12 && alnum.toUpperCase().endsWith(asin.toUpperCase())) return true;
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      if (tl === "youtube" || t === "YouTube") return true;
    }
    if (host.includes("netflix.com")) {
      if (tl === "netflix") return true;
    }
    if (host.includes("disneyplus.com")) {
      if (tl === "disney+" || tl === "disney plus" || tl === "disneyplus") return true;
    }
    if (host.includes("hulu.com") || host.includes("hulu.jp")) {
      if (tl === "hulu") return true;
    }
    if (host === "video.unext.jp" || host.endsWith(".video.unext.jp")) {
      if (tl === "u-next" || tl === "unext" || t === "U-NEXT") return true;
    }
    if (host.includes("open.spotify.com")) {
      if (tl === "spotify") return true;
    }
    if (host.includes("music.apple.com")) {
      if (tl === "apple music") return true;
    }
    if (host.includes("music.youtube.com")) {
      if (tl === "youtube music") return true;
    }
    if (host.includes("amazon.co.jp") && pageUrl.includes("/gp/video")) {
      if (tl.includes("prime video") && t.length < 24) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

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

    // Amazon はbot対策で 503 等を返すことがある → 失敗しても OpenBD で補完できるよう try-catch で囲む
    let og: Awaited<ReturnType<typeof fetchOgp>> = { title: null, description: null, imageUrl: null, siteName: null };
    try {
      og = await fetchOgp(normalizedUrl);
    } catch (e) {
      if (!isAmazonUrl(normalizedUrl)) throw e; // Amazon 以外は上位の catch へ
      // Amazon の場合は無視して OpenBD フォールバックへ続行
    }

    // Amazon: OpenBD（日本書籍データベース）でタイトル・表紙を補完
    if (isAmazonUrl(normalizedUrl) && (needsTitleRefresh(og.title, normalizedUrl) || !og.imageUrl)) {
      const asin = amazonAsinFromUrl(normalizedUrl);
      if (asin) {
        try {
          const r = await fetch(`https://api.openbd.jp/v1/get?isbn=${asin}`, { signal: AbortSignal.timeout(5000) });
          const [book] = (await r.json()) as [{ summary?: { title?: string; author?: string } } | null];
          if (book?.summary?.title && needsTitleRefresh(og.title, normalizedUrl)) {
            og.title = book.summary.title;
          }
        } catch { /* noop */ }

        // OpenBD 表紙画像（ISBN-10 / ISBN-13 両方試す）
        if (!og.imageUrl) {
          // ISBN-10 → ISBN-13 変換を試みる（先頭が数字のASIN = 書籍ISBN）
          const isbn13 = asin.match(/^\d{10}$/)
            ? isbn10ToIsbn13(asin)
            : null;
          // ISBN-13 があればそちら優先、なければ ISBN-10 のまま
          og.imageUrl = `https://cover.openbd.jp/${isbn13 ?? asin}.jpg`;
        }
      }
    }

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
