import { amazonAsinFromUrl, isAmazonUrl } from "@/lib/amazon";

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

function amazonPipeLeadSegment(s: string): boolean {
  return /^amazon(\.co\.jp|\.com)?$/i.test(s.trim());
}

function streamingHostnameFlags(pageUrl: string): {
  netflix: boolean;
  disney: boolean;
  hulu: boolean;
  primeVideo: boolean;
  unext: boolean;
} {
  try {
    const h = new URL(pageUrl).hostname.toLowerCase();
    return {
      netflix: h.includes("netflix.com"),
      disney: h.includes("disneyplus.com"),
      hulu: h.includes("hulu.com") || h.includes("hulu.jp"),
      primeVideo: h.includes("primevideo.com") || (h.includes("amazon.") && pageUrl.includes("/gp/video")),
      unext: h === "video.unext.jp" || h.endsWith(".video.unext.jp"),
    };
  } catch {
    return { netflix: false, disney: false, hulu: false, primeVideo: false, unext: false };
  }
}

/**
 * 「イカゲーム を観る | Netflix ( ネットフリックス ) 公式サイト」のような OGP タイトルから作品名だけ残す。
 */
function stripStreamingCatalogTitle(t: string, pageUrl: string): string {
  let s = normalizeWhitespace(t);
  const { netflix, disney, hulu, primeVideo, unext } = streamingHostnameFlags(pageUrl);

  if (netflix && s.includes("|")) {
    const parts = s.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && /netflix/i.test(parts.slice(1).join(" "))) {
      s = parts[0]!;
    }
  }
  if (disney && s.includes("|")) {
    const parts = s.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && /disney|ディズニー/i.test(parts.slice(1).join(" "))) {
      s = parts[0]!;
    }
  }
  if (hulu && s.includes("|")) {
    const parts = s.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && /hulu/i.test(parts.slice(1).join(" "))) {
      s = parts[0]!;
    }
  }
  if (primeVideo && s.includes("|")) {
    const parts = s.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && /prime\s*video|プライム\s*ビデオ|amazon/i.test(parts.slice(1).join(" "))) {
      s = parts[0]!;
    }
  }
  if (unext && s.includes("|")) {
    const parts = s.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && /u-?next|ユーネクスト/i.test(parts.slice(1).join(" "))) {
      s = parts[0]!;
    }
  }

  if (netflix) {
    s = s.replace(/\s*を観\s*る\s*$/u, "").replace(/\s*を見\s*る\s*$/u, "").trim();
  }
  if (disney) {
    s = s.replace(/\s*を観\s*る\s*$/u, "").replace(/\s*を見\s*る\s*$/u, "").trim();
  }
  if (hulu) {
    s = s.replace(/\s*を観\s*る\s*$/u, "").replace(/\s*を見\s*る\s*$/u, "").trim();
  }
  if (unext) {
    s = s.replace(/\s*を観\s*る\s*$/u, "").replace(/\s*を見\s*る\s*$/u, "").trim();
  }

  return normalizeWhitespace(s);
}

/**
 * UI 専用。OGP/DB の生タイトルから「作品名」寄りの短いラベルを作る。
 * `canonical_id` や Supabase の `title` カラムには使わないこと。
 */
export function formatWorkDisplayTitle(title: string | null | undefined, pageUrl: string): string | null {
  const raw = title?.trim();
  if (!raw) return null;

  let t = normalizeWhitespace(raw);

  if (isAmazonUrl(pageUrl)) {
    // 「Amazon.co.jp | 作品名 | 著者 | …」のように先頭がストア名だけの行がある
    const pipeSegs = t.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
    if (pipeSegs.length >= 2) {
      const tail = pipeSegs[pipeSegs.length - 1] ?? "";
      if (amazonPipeLeadSegment(pipeSegs[0] ?? "")) {
        t = pipeSegs[1] ?? t;
      } else if (
        pipeSegs.length >= 3 ||
        /Amazon|通販|￥|円|ポイント/i.test(tail) ||
        /(^|\s)本(\s|$)/.test(pipeSegs[1] ?? "")
      ) {
        t = pipeSegs[0] ?? t;
      }
    }

    t = t
      .replace(
        /:\s*(本|Kindleストア|Kindle版|DVD|Blu-ray|ブルーレイ|CD|コミック|コミック\(紙\)|Audible|オーディオブック)\s*$/i,
        "",
      )
      .trim();

    const parts = t
      .split(/\s*:\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2 && !amazonPipeLeadSegment(parts[0] ?? "")) {
      t = parts[0]!;
    } else if (parts.length >= 2 && amazonPipeLeadSegment(parts[0] ?? "")) {
      t = parts[1] ?? t;
    }
  } else {
    t = t.replace(/\s*\|\s*YouTube\s*$/i, "").trim();
    t = stripStreamingCatalogTitle(t, pageUrl);
  }

  return t ? normalizeWhitespace(t) : null;
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
