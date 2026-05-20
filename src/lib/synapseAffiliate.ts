import { stripAmazonAffiliate, withAmazonAffiliate } from "@/lib/amazon";
import { stripUnextAffiliate, withUnextAffiliate } from "@/lib/unext";

/** シナプス outbound リンク用（Amazon tag + U-NEXT 提携パラメータ）。 */
export function withSynapseAffiliate(url: string): string {
  return withUnextAffiliate(withAmazonAffiliate(url));
}

/** DB 正規化・OGP キャッシュ照合前のクリーン URL。 */
export function stripSynapseAffiliate(url: string): string {
  return stripUnextAffiliate(stripAmazonAffiliate(url));
}
