// NEXT_PUBLIC_ はブラウザにも届く（クライアントコンポーネント用）
// UNEXT_AFFILIATE_* はサーバー専用（API Route 等）
const DEFAULT_CID =
  process.env.NEXT_PUBLIC_UNEXT_AFFILIATE_CID?.trim() ||
  process.env.UNEXT_AFFILIATE_CID?.trim() ||
  "";

const DEFAULT_UTM_SOURCE =
  process.env.NEXT_PUBLIC_UNEXT_AFFILIATE_UTM_SOURCE?.trim() ||
  process.env.UNEXT_AFFILIATE_UTM_SOURCE?.trim() ||
  "";

/** U-NEXT 作品・トップページ（video.unext.jp / www.video.unext.jp） */
export function isUnextUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "video.unext.jp" || h.endsWith(".video.unext.jp");
  } catch {
    return false;
  }
}

const UNEXT_AFFILIATE_KEYS = ["cid", "utm_source", "utm_medium", "utm_campaign", "adid", "rid", "s"] as const;

/** U-NEXT URL からアフィリエイト用クエリを除去（共有・表示・DB 保存用）。 */
export function stripUnextAffiliate(url: string): string {
  if (!isUnextUrl(url)) return url;
  try {
    const u = new URL(url);
    for (const key of UNEXT_AFFILIATE_KEYS) {
      u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** U-NEXT URL に提携パラメータを付与（既存値は上書き）。CID 未設定時は URL をそのまま返す。 */
export function withUnextAffiliate(url: string, cid: string = DEFAULT_CID): string {
  if (!isUnextUrl(url)) return url;
  if (!cid) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("cid", cid);
    if (DEFAULT_UTM_SOURCE) u.searchParams.set("utm_source", DEFAULT_UTM_SOURCE);
    return u.toString();
  } catch {
    return url;
  }
}
