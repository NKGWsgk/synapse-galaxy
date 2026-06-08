import { isAmazonUrl } from "@/lib/amazon";
import { stripSynapseAffiliate } from "@/lib/synapseAffiliate";

/** Amazon: /dp/ASIN または /gp/product/ASIN から ASIN を抜く */
function amazonAsin(url: URL): string | null {
  const path = url.pathname;
  const dp = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (dp?.[1]) return dp[1].toUpperCase();
  return null;
}

/** Prime Video: /gp/video/detail/ASIN から ASIN を抜く */
function amazonPrimeVideoAsin(url: URL): string | null {
  const m = url.pathname.match(/\/gp\/video\/detail\/([A-Z0-9]{10})/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function amazonBaseHost(host: string, fallbackHost: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === "amazon.co.jp" || h.endsWith("amazon.co.jp")) return "www.amazon.co.jp";
  if (h === "amazon.com" || h.endsWith("amazon.com")) return "www.amazon.com";
  return fallbackHost;
}

/**
 * シナプス endpoint（source/target）比較用の正規化。
 * - 非Amazon: そのまま（hash 除去）
 * - Amazon: ホスト + ASIN へ畳み込み（アフィリエイト tag は含めない）
 */
export function normalizeSynapseEndpoint(raw: string): string {
  const cleaned = stripSynapseAffiliate(raw.trim());
  try {
    const u = new URL(cleaned);
    if (!isAmazonUrl(cleaned)) {
      u.hash = "";
      if (u.hostname.toLowerCase().includes("netflix.com")) {
        const id = u.pathname.match(/\/(?:title|watch)\/(\d+)/)?.[1];
        if (id) return `https://www.netflix.com/title/${id}`;
        u.search = "";
      }
      return u.toString();
    }
    const baseHost = amazonBaseHost(u.hostname, u.hostname);
    const videoAsin = amazonPrimeVideoAsin(u);
    if (videoAsin) {
      return `https://${baseHost}/gp/video/detail/${videoAsin}`;
    }
    const asin = amazonAsin(u);
    if (asin) {
      return `https://${baseHost}/dp/${asin}`;
    }
    u.hash = "";
    u.searchParams.delete("tag");
    return u.toString();
  } catch {
    return cleaned;
  }
}
