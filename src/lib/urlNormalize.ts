import { isAmazonUrl, stripAmazonAffiliate } from "@/lib/amazon";

/** Amazon: /dp/ASIN または /gp/product/ASIN から ASIN を抜く */
function amazonAsin(url: URL): string | null {
  const path = url.pathname;
  const dp = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (dp?.[1]) return dp[1].toUpperCase();
  return null;
}

/**
 * シナプス endpoint（source/target）比較用の正規化。
 * - 非Amazon: そのまま（hash 除去）
 * - Amazon: ホスト + ASIN へ畳み込み（アフィリエイト tag は含めない）
 */
export function normalizeSynapseEndpoint(raw: string): string {
  const cleaned = stripAmazonAffiliate(raw.trim());
  try {
    const u = new URL(cleaned);
    if (!isAmazonUrl(cleaned)) {
      u.hash = "";
      return u.toString();
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const asin = amazonAsin(u);
    if (asin) {
      const baseHost =
        host === "amazon.co.jp" || host.endsWith("amazon.co.jp")
          ? "www.amazon.co.jp"
          : host === "amazon.com" || host.endsWith("amazon.com")
            ? "www.amazon.com"
            : u.hostname;
      return `https://${baseHost}/dp/${asin}`;
    }
    u.hash = "";
    u.searchParams.delete("tag");
    return u.toString();
  } catch {
    return cleaned;
  }
}
