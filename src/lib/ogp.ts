import { load, type CheerioAPI } from "cheerio";
import { isAmazonUrl } from "@/lib/amazon";
import { formatWorkDisplayTitle } from "@/lib/ogpDisplay";

export type OgpResult = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

/** 多くのサイトはブラウザ UA 以外の HTML/OGP 取得を拒否する */
export const OGP_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[\uFEFF\u200B-\u200D\u2060\u00AD]/g, "");
}

function metaContent(
  $: CheerioAPI,
  prop: string,
  attr: "property" | "name" = "property",
): string | null {
  const raw = $(`meta[${attr}="${prop}"]`).attr("content")?.trim();
  if (!raw) return null;
  return decodeBasicEntities(raw) || null;
}

function firstMetaContent(
  $: CheerioAPI,
  props: { prop: string; attr?: "property" | "name" }[],
): string | null {
  for (const { prop, attr = "property" } of props) {
    const v = metaContent($, prop, attr);
    if (v) return v;
  }
  return null;
}

function linkHref($: CheerioAPI, rel: string): string | null {
  const href = $(`link[rel="${rel}"]`).attr("href")?.trim();
  if (!href) return null;
  return decodeBasicEntities(href) || null;
}

function absolutize(base: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function tryParseDynamicImageJsonKeys(raw: string | null): string | null {
  if (!raw) return null;
  // Amazon など: data-a-dynamic-image='{"https://...jpg":[500,500],...}'
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const firstKey = Object.keys(obj)[0];
    return firstKey || null;
  } catch {
    return null;
  }
}

function pickImageUrl($: CheerioAPI, pageUrl: string): string | null {
  const raw = firstMetaContent($, [
    { prop: "og:image" },
    { prop: "og:image:url" },
    { prop: "og:image:secure_url" },
    { prop: "twitter:image" },
    { prop: "twitter:image:src", attr: "name" },
    { prop: "twitter:image", attr: "name" },
  ]);

  const fromLink = linkHref($, "image_src");
  const fromItem = $('meta[itemprop="image"]').attr("content")?.trim() || null;

  const first = raw || fromLink || fromItem;
  const primary = first ? absolutize(pageUrl, decodeBasicEntities(first)) : null;
  if (primary) return primary;

  // フォールバック: Amazon 系ページは OGP 画像が無いことがある
  // - img#landingImage の data-old-hires / src
  // - data-a-dynamic-image の JSON キー（最初のURL）
  const landing =
    $("#landingImage").attr("data-old-hires")?.trim() ||
    $("#landingImage").attr("src")?.trim() ||
    null;
  const dynamic =
    tryParseDynamicImageJsonKeys($('[data-a-dynamic-image]').first().attr("data-a-dynamic-image") || null) ||
    tryParseDynamicImageJsonKeys($("#landingImage").attr("data-a-dynamic-image") || null);

  const fallback = landing || dynamic;
  const parsedFallback = fallback ? absolutize(pageUrl, decodeBasicEntities(fallback)) : null;
  if (parsedFallback) return parsedFallback;

  // 最終フォールバック: HTML から Amazon 画像CDNっぽいURLを拾う（meta が無い/DOMが変則な場合）
  // NOTE: ロゴ等も混ざり得るが、画像が全く無いよりはマシなため最後に使う。
  const html = $.html();
  const m =
    html.match(/https?:\/\/m\.media-amazon\.com\/images\/I\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/i) ||
    html.match(/https?:\/\/images-na\.ssl-images-amazon\.com\/images\/I\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/i);
  return m?.[0] ? absolutize(pageUrl, m[0]) : null;
}

function pickTitle($: CheerioAPI): string | null {
  const t =
    firstMetaContent($, [
      { prop: "og:title" },
      { prop: "twitter:title" },
      { prop: "twitter:title", attr: "name" },
    ]) ||
    $("title").first().text().trim() ||
    null;
  return t ? decodeBasicEntities(t) : null;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Amazon 商品ページ: OGP だけだと空・不十分なことがあるので #productTitle を使う */
function pickAmazonDomTitle($: CheerioAPI): string | null {
  const el = $("#productTitle").first();
  if (!el.length) return null;
  el.find("script, style, noscript").remove();
  const t = normalizeWhitespace(el.text());
  return t.length >= 2 ? t : null;
}

/** Amazon 商品ページ: OGP が短い・タイトルと同系のことが多いので本文から拾う */
function pickAmazonDomDescription($: CheerioAPI): string | null {
  const selectors = [
    "#bookDescription_feature_div",
    "#productDescription_feature_div",
    "#productDescription",
    '[data-feature-name="bookDescription"]',
  ];
  for (const sel of selectors) {
    const el = $(sel).first();
    if (!el.length) continue;
    el.find("script, style, noscript").remove();
    const text = normalizeWhitespace(el.text());
    if (text.length >= 40) return text.slice(0, 4000);
  }
  return null;
}

function metaDescription($: CheerioAPI): string | null {
  const raw =
    firstMetaContent($, [
      { prop: "og:description" },
      { prop: "description", attr: "name" },
      { prop: "twitter:description" },
      { prop: "twitter:description", attr: "name" },
    ]) || $('meta[itemprop="description"]').attr("content")?.trim() || null;
  return raw ? normalizeWhitespace(decodeBasicEntities(raw)) : null;
}

/** メタの説明がタイトルとほぼ同じ、または短いストア一言のときは DOM 側を優先 */
function shouldPreferDomOverMeta(
  metaDesc: string | null,
  domDesc: string | null,
  title: string | null,
): boolean {
  if (!domDesc) return false;
  if (!metaDesc) return true;
  if (/^amazon\.co\.jp\s*[:：]/i.test(metaDesc) && domDesc.length > 80) return true;
  const mt = (title ?? "").trim().toLowerCase();
  const md = metaDesc.toLowerCase();
  if (mt && (md === mt || md.startsWith(mt.slice(0, Math.min(32, mt.length))))) return true;
  if (metaDesc.length < 80 && domDesc.length >= metaDesc.length * 2) return true;
  return domDesc.length > metaDesc.length + 40;
}

function pickDescription($: CheerioAPI, pageUrl: string, title: string | null): string | null {
  const metaDesc = metaDescription($);
  let domDesc: string | null = null;
  try {
    if (isAmazonUrl(pageUrl)) domDesc = pickAmazonDomDescription($);
  } catch {
    domDesc = null;
  }

  if (shouldPreferDomOverMeta(metaDesc, domDesc, title) && domDesc) return domDesc;
  if (metaDesc) return metaDesc;
  return domDesc;
}

function cleanTitleForHost(title: string | null, pageUrl: string): string | null {
  if (!title) return null;
  let t = title.trim();
  if (!t) return null;

  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (host === "amazon.co.jp" || host.endsWith(".amazon.co.jp")) {
      // e.g. "Amazon.co.jp: プロジェクト・ヘイル・メアリー 下: アンディ・ウィアー: 本"
      t = t.replace(/^amazon\.co\.jp\s*[:：]\s*/i, "");
    } else if (host === "amazon.com" || host.endsWith(".amazon.com")) {
      t = t.replace(/^amazon\.com\s*[:：]\s*/i, "");
    }
  } catch {
    // ignore
  }

  return t || null;
}

export async function fetchOgp(url: string): Promise<OgpResult> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": OGP_BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`OGP fetch failed: ${res.status}`);
  }

  const finalUrl = res.url || url;
  const html = await res.text();
  const $ = load(html);

  let title = cleanTitleForHost(pickTitle($), finalUrl);
  if (isAmazonUrl(finalUrl)) {
    const domTitle = pickAmazonDomTitle($);
    if (domTitle) {
      const t = title?.trim() ?? "";
      const weakOg =
        !t ||
        t.length < 4 ||
        /^amazon(\.co\.jp|\.com)?$/i.test(t) ||
        /^amazon\.co\.jp\s*[|｜:：]/i.test(t);
      if (weakOg) title = domTitle;
    }
    title = cleanTitleForHost(title, finalUrl);
  }

  const description = pickDescription($, finalUrl, title);

  const siteName = metaContent($, "og:site_name");
  const imageUrl = pickImageUrl($, finalUrl);

  const uiTitle = formatWorkDisplayTitle(title, finalUrl);
  if (uiTitle) title = uiTitle;

  return {
    title: title || null,
    description: description || null,
    imageUrl: imageUrl || null,
    siteName: siteName || null,
  };
}
