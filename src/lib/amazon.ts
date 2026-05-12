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

/** 商品ページの ASIN（表示フォールバック用） */
export function amazonAsinFromUrl(url: string): string | null {
  const m = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})\b/i);
  return m?.[1] ?? null;
}
