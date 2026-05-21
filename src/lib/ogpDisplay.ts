import { amazonAsinFromUrl, isAmazonUrl } from "@/lib/amazon";
import { extractPureWorkTitle, isWeakStreamingPlatformTitle } from "@/lib/pureWorkTitle";

/**
 * ブラウザ直読みはホットリンク等で弾かれるため、自前プロキシ経由で表示する用 URL（クライアント用・軽量）
 */
export function getOgpImageDisplaySrc(imageUrl: string, refPageUrl: string): string {
  const q = new URLSearchParams();
  q.set("url", imageUrl);
  q.set("ref", refPageUrl);
  return `/api/ogp-image?${q.toString()}`;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
}

/**
 * OGP/DB の生タイトルから「純粋な作品名」ラベルを作る（UI・DB保存・名寄せで共通）。
 */
export function formatWorkDisplayTitle(title: string | null | undefined, pageUrl: string): string | null {
  return extractPureWorkTitle(title, pageUrl);
}

/** `resolveContentDisplayTitle` の （Amazon）ASIN フォールバックは作品名として不十分 → 再取得で DOM/OGP を狙う */
function isAmazonSyntheticAsinLabel(label: string, pageUrl: string): boolean {
  if (!isAmazonUrl(pageUrl)) return false;
  const asin = amazonAsinFromUrl(pageUrl);
  if (!asin) return false;
  const n = label.normalize("NFKC").replace(/\s/g, "");
  if (!n.toLowerCase().includes(asin.toLowerCase())) return false;
  return /amazon/i.test(n);
}

/** フォーカス名・接続名として使えない短いラベル（ドメイン名フォールバック等） */
export function isWeakContentTitleLabel(label: string, pageUrl: string): boolean {
  if (isAmazonSyntheticAsinLabel(label, pageUrl)) return true;
  if (isAmazonUrl(pageUrl) && /^Amazon\s*商品$/.test(label.trim())) return true;
  const host = hostLabel(pageUrl);
  if (label === host) {
    try {
      const h = new URL(pageUrl).hostname.toLowerCase();
      if (
        isAmazonUrl(pageUrl) ||
        h.includes("youtube.") ||
        h.includes("netflix.") ||
        h.includes("disneyplus.") ||
        h.includes("hulu.") ||
        h === "video.unext.jp" ||
        h.endsWith(".video.unext.jp") ||
        h.includes("open.spotify.com") ||
        h.includes("music.apple.com") ||
        h.includes("music.youtube.com")
      ) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  if (/^amazon\.co\.jp$/i.test(label) || /^amazon\.com$/i.test(label)) return true;
  if (isWeakStreamingPlatformTitle(label, pageUrl)) return true;
  if (
    label === "YouTube" ||
    label === "Netflix" ||
    label === "Hulu" ||
    label === "U-NEXT" ||
    label === "Spotify" ||
    label === "Apple Music" ||
    label === "YouTube Music"
  ) {
    return true;
  }
  return false;
}

/**
 * OGP タイトルと URL から UI 用の一行ラベルを決定（Amazon は ASIN までフォールバック）。
 */
export function resolveContentDisplayTitle(ogpTitle: string | null | undefined, pageUrl: string): string {
  const formatted = formatWorkDisplayTitle(ogpTitle, pageUrl);
  if (formatted && !isWeakContentTitleLabel(formatted, pageUrl)) {
    return formatted;
  }
  if (isAmazonUrl(pageUrl)) {
    return "Amazon商品";
  }
  return hostLabel(pageUrl);
}
