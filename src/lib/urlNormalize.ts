import { isAmazonUrl, withAmazonAffiliate } from "@/lib/amazon";

/** Amazon: /dp/ASIN または /gp/product/ASIN から ASIN を抜く */
function amazonAsin(url: URL): string | null {
  const path = url.pathname;
  const dp = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (dp?.[1]) return dp[1].toUpperCase();
  return null;
}

/**
 * シナプス endpoint（source/target）比較用の正規化。
 * - 非Amazon: そのまま（affiliate 付与のみ amazon で揃える）
 * - Amazon: ホスト + ASIN へ畳み込み（長いタイトル付きURLとも一致）
 */
export function normalizeSynapseEndpoint(raw: string): string {
  const withAff = withAmazonAffiliate(raw.trim());
  try {
    const u = new URL(withAff);
    if (!isAmazonUrl(withAff)) {
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
      const bare = `https://${baseHost}/dp/${asin}`;
      // tag 無し行（手入力/旧データ）と tag 付きフォーカスを一致させる
      return withAmazonAffiliate(bare);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return withAff;
  }
}
