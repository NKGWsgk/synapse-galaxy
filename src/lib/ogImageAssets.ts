import { OGP_BROWSER_UA } from "@/lib/ogp";

/** OGP 画像生成用の共通処理（サーバー専用）。 */

/** 必要な文字だけの日本語フォント（TTF）を Google Fonts から取る。User-Agent を付けないと TTF が返る。 */
export async function loadJpFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const chars = Array.from(new Set(text)).join("");
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(chars)}`,
      { signal: AbortSignal.timeout(6000) },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** 表紙画像を data URI にして渡す（失敗・非対応形式なら null → 文字だけのカードにする） */
export async function loadCoverDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": OGP_BROWSER_UA, Accept: "image/jpeg,image/png,image/*;q=0.8" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (type !== "image/jpeg" && type !== "image/png") return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 512 || buf.byteLength > 3 * 1024 * 1024) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/** 生成に失敗したときの代替（サイト共通の OGP 画像） */
export async function fallbackOgpResponse(): Promise<Response> {
  const res = await fetch(new URL("/ogp.jpg", process.env.NEXT_PUBLIC_SITE_URL || "https://synapse-galaxy.vercel.app"));
  return new Response(await res.arrayBuffer(), { headers: { "Content-Type": "image/jpeg" } });
}

export function clipText(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
