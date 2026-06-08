// NEXT_PUBLIC_ はブラウザにも届く（クライアントコンポーネント用）
// AMAZON_AFFILIATE_TAG はサーバー専用（API Route 等）
const DEFAULT_TAG =
  process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG?.trim() ||
  process.env.AMAZON_AFFILIATE_TAG?.trim() ||
  "";

export function isAmazonUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === "amazon.co.jp" ||
      h.endsWith(".amazon.co.jp") ||
      h === "amazon.com" ||
      h.endsWith(".amazon.com") ||
      h === "amzn.to" ||
      h.endsWith(".amzn.to")
    );
  } catch {
    return false;
  }
}

/** Amazon URL からアフィリエイト `tag` を除去（共有・表示・DB 保存用）。 */
export function stripAmazonAffiliate(url: string): string {
  if (!isAmazonUrl(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("tag");
    return u.toString();
  } catch {
    return url;
  }
}

/** Amazon ドメインの URL に `tag` を付与（既存 tag は上書き）。タグ未設定時は URL をそのまま返す。 */
export function withAmazonAffiliate(url: string, tag: string = DEFAULT_TAG): string {
  if (!isAmazonUrl(url)) return url;
  if (!tag) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("tag", tag);
    return u.toString();
  } catch {
    return url;
  }
}

/** Prime Video 作品ページ（amazon.co.jp/gp/video/detail/… または primevideo.com） */
export function isPrimeVideoPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const h = u.hostname.toLowerCase();
    return h.includes("primevideo.com") || (h.includes("amazon.") && path.includes("/gp/video"));
  } catch {
    return false;
  }
}

/** OGP タイトルが Prime Video 作品ページ由来か（「を観る | Prime Video」等） */
export function isPrimeVideoTitleText(title: string | null | undefined): boolean {
  const t = title?.trim();
  if (!t) return false;
  if (/prime\s*video|プライム\s*ビデオ/i.test(t)) return true;
  if (/を\s*(?:観|見|視聴)\s*る(?:\s*[|｜]|$)/u.test(t)) return true;
  return false;
}

/** スクレイプ HTML が Prime Video 作品ページか（pv-target-images ポスター） */
export function isPrimeVideoHtml(html: string | null | undefined): boolean {
  return !!html && /pv-target-images/i.test(html);
}

/** URL・HTML・OGP タイトルから Prime Video 作品ページかを判定 */
export function isPrimeVideoContent(
  url: string,
  hints?: { html?: string | null; title?: string | null },
): boolean {
  if (isPrimeVideoPageUrl(url)) return true;
  if (hints?.html && isPrimeVideoHtml(hints.html)) return true;
  if (hints?.title && isPrimeVideoTitleText(hints.title)) return true;
  return false;
}

/** Prime Video 作品の正規 URL（ホストは参照 URL に合わせる） */
export function canonicalPrimeVideoPageUrl(asin: string, refUrl?: string): string {
  let host = "www.amazon.co.jp";
  if (refUrl) {
    try {
      const h = new URL(refUrl).hostname.toLowerCase();
      if (h.includes("amazon.com") && !h.includes("amazon.co.jp")) host = "www.amazon.com";
      else if (h.includes("amazon.")) host = new URL(refUrl).hostname;
    } catch {
      /* default */
    }
  }
  return `https://${host}/gp/video/detail/${asin.toUpperCase()}`;
}

/**
 * Amazon メディア URL の正規形。
 * Prime Video は `/gp/video/detail/{ASIN}` に統一（`/dp/B0…` は商品ページ扱いになり OGP が壊れるため）。
 */
export function canonicalAmazonMediaUrl(rawUrl: string, title?: string | null): string {
  try {
    const u = new URL(rawUrl.trim());
    if (!isAmazonUrl(rawUrl)) return rawUrl.trim();

    const videoMatch = u.pathname.match(/\/gp\/video\/detail\/([A-Z0-9]{10})/i);
    if (videoMatch?.[1]) {
      return canonicalPrimeVideoPageUrl(videoMatch[1], rawUrl);
    }

    const asin = amazonAsinFromUrl(rawUrl);
    if (asin && isPrimeVideoTitleText(title)) {
      return canonicalPrimeVideoPageUrl(asin, rawUrl);
    }

    return rawUrl.trim();
  } catch {
    return rawUrl.trim();
  }
}

/** 商品 / Prime Video ページの ASIN（表示・OGP 補完用） */
export function amazonAsinFromUrl(url: string): string | null {
  const product = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})\b/i);
  if (product?.[1]) return product[1].toUpperCase();
  const video = url.match(/\/gp\/video\/detail\/([A-Z0-9]{10})\b/i);
  if (video?.[1]) return video[1].toUpperCase();
  return null;
}
