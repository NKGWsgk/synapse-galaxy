import { isAmazonUrl } from "@/lib/amazon";

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function amazonPipeLeadSegment(s: string): boolean {
  return /^amazon(\.co\.jp|\.com)?$/i.test(s.trim());
}

/** パイプ/コロン区切りの1セグメントがプラットフォーム名だけか */
function isPlatformOnlySegment(seg: string): boolean {
  const s = seg.trim();
  if (!s) return true;
  return (
    /^(amazon(\.co\.jp|\.com)?|netflix|hulu|disney\+?|disney\s*plus|disneyplus|prime\s*video|プライム\s*ビデオ|u-?next|ユーネクスト|youtube|spotify|apple\s*music|youtube\s*music|楽天|rakuten|audible)$/i.test(
      s,
    ) || /公式サイト/i.test(s)
  );
}

/** 著者・メディア種別・通販ノイズだけのセグメント */
function isMetadataOnlySegment(seg: string): boolean {
  const s = seg.trim();
  if (!s) return true;
  if (isPlatformOnlySegment(s)) return true;
  if (/^(本|Kindleストア|Kindle版|DVD|Blu-ray|ブルーレイ|CD|コミック|コミック\(紙\)|Audible|オーディオブック)$/i.test(s)) {
    return true;
  }
  if (/^amazon/i.test(s) && s.length < 24) return true;
  if (/通販|￥|円|ポイント/i.test(s) && s.length < 40) return true;
  return false;
}

/** 出版社・レーベル（ハヤカワ文庫SF 等） */
const PUBLISHER_IMPRINT_RE =
  /(?:ハヤカワ(?:文庫(?:SF|JA)?|ノヴェルス)|講談社|角川|新潮|文春|集英|筑摩|岩波|光文|PHP|創元|中公文|ポプラ|祥伝|徳間|実業之|幻冬|双葉|早川|小学館|秋田|講談社)文庫(?:SF|JA|ノヴェルス)?|[\u4e00-\u9fff\u30a0-\u30ffー]{2,12}文庫(?:SF|JA|ノヴェルス)?|[\u4e00-\u9fff]{2,12}新書/gu;

const BRACKETED_IMPRINT_RE = /【[^】]*(?:文庫|新書|ノヴェルス|レーベル)[^】]*】/g;
const PAREN_IMPRINT_RE = /[（(][^）)]*(?:文庫|新書|ノヴェルス)[^）)]*[）)]/g;

const MEDIA_TYPE_SUFFIX_RE =
  /:\s*(本|Kindleストア|Kindle版|DVD|Blu-ray|ブルーレイ|CD|コミック|コミック\(紙\)|Audible|オーディオブック)\s*$/i;

/** 末尾の視聴アクション（閉じ括弧・引用符の直前でも可） */
const WATCH_ACTION_SUFFIX_RE =
  /\s*を(?:観|見|聴|視聴)(?:する|る)?(?:\s*[」』】\])]+)?\s*$/u;

const OUTER_WRAP_RE = /^[\s「『【\[(〈《]+|[\s」』】\])〉》]+$/gu;

/** 巻次・上下巻（末尾のみ。作品名の一部は残す） */
const VOLUME_SUFFIX_RE =
  /\s*(?:[（(【]\s*)?(?:第\s*[0-9０-９一二三四五六七八九十百千]+\s*)?[上下](?:巻|册|冊)?(?:\s*[）)】])?\s*$/u;

function stripPublisherImprints(t: string): string {
  return normalizeWhitespace(
    t
      .replace(BRACKETED_IMPRINT_RE, " ")
      .replace(PAREN_IMPRINT_RE, " ")
      .replace(PUBLISHER_IMPRINT_RE, " ")
      .replace(/\s+/g, " "),
  );
}

function stripPlatformPrefixes(t: string): string {
  return normalizeWhitespace(
    t
      .replace(/^amazon\.co\.jp\s*[:：|｜]\s*/i, "")
      .replace(/^amazon\.com\s*[:：|｜]\s*/i, "")
      .replace(/^amazon\s*[:：|｜]\s*/i, "")
      .replace(/\s*\|\s*YouTube\s*$/i, "")
      .trim(),
  );
}

function pickBestContentSegment(segments: string[]): string | null {
  const content = segments
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !isMetadataOnlySegment(s));
  if (content.length === 0) return null;
  if (content.length === 1) return content[0]!;
  // 最長の非メタセグメントを作品名とみなす（著者名より長いことが多い）
  return content.sort((a, b) => b.length - a.length)[0]!;
}

function stripAmazonCatalogSegments(t: string): string {
  let s = t;
    const pipeSegs = s.split(/\s*[|｜]\s*/).map((x) => x.trim()).filter(Boolean);
  if (pipeSegs.length >= 2) {
    const tail = pipeSegs[pipeSegs.length - 1] ?? "";
    if (amazonPipeLeadSegment(pipeSegs[0] ?? "")) {
      s = pipeSegs[1] ?? s;
    } else if (
      pipeSegs.length >= 3 ||
      /Amazon|通販|￥|円|ポイント/i.test(tail) ||
      /(^|\s)本(\s|$)/.test(pipeSegs[1] ?? "")
    ) {
      const picked = pickBestContentSegment(pipeSegs);
      if (picked) s = picked;
    }
  }

  s = s.replace(MEDIA_TYPE_SUFFIX_RE, "").trim();

  const colonParts = s
    .split(/\s*:\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (colonParts.length >= 2) {
    if (!amazonPipeLeadSegment(colonParts[0] ?? "")) {
      const picked = pickBestContentSegment(colonParts);
      if (picked) s = picked;
    } else {
      s = colonParts[1] ?? s;
    }
  }

  return s;
}

function stripStreamingPipeSegments(t: string, pageUrl: string): string {
  let s = t;
  if (!s.includes("|")) return s;

  try {
    const h = new URL(pageUrl).hostname.toLowerCase();
    const platformTail =
      (h.includes("netflix.com") && /netflix/i.test(s)) ||
      (h.includes("disneyplus.com") && /disney|ディズニー/i.test(s)) ||
      ((h.includes("hulu.com") || h.includes("hulu.jp")) && /hulu/i.test(s)) ||
      ((h.includes("primevideo.com") || (h.includes("amazon.") && pageUrl.includes("/gp/video"))) &&
        /prime\s*video|プライム\s*ビデオ|amazon/i.test(s)) ||
      ((h === "video.unext.jp" || h.endsWith(".video.unext.jp")) && /u-?next|ユーネクスト/i.test(s));

    if (platformTail) {
      const parts = s.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
      const picked = pickBestContentSegment(parts);
      if (picked) s = picked;
    }
  } catch {
    // ignore
  }

  return s;
}

/** Netflix 等が付ける外側の「」『』を剥がす（を観る除去の前に必要） */
function stripOuterWrappers(t: string): string {
  let s = normalizeWhitespace(t);
  for (let i = 0; i < 4; i++) {
    const next = s.replace(OUTER_WRAP_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function stripGlobalSuffixes(t: string): string {
  let s = t;
  for (let i = 0; i < 4; i++) {
    const next = normalizeWhitespace(
      s
        .replace(WATCH_ACTION_SUFFIX_RE, "")
        .replace(VOLUME_SUFFIX_RE, "")
        .replace(MEDIA_TYPE_SUFFIX_RE, "")
        .trim(),
    );
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * OGP/DB の生タイトルから「純粋な作品名」だけを抜き出す。
 * - プラットフォーム名（Amazon, Netflix 等）を除く
 * - 出版社・レーベル名（ハヤカワ文庫SF 等）を除く
 * - 「を見る」「を観る」等を除く
 * - 末尾の 上/下（巻）を除く
 */
export function extractPureWorkTitle(title: string | null | undefined, pageUrl: string): string | null {
  const raw = title?.trim();
  if (!raw) return null;

  let t = stripOuterWrappers(raw);
  t = stripPlatformPrefixes(t);

  if (isAmazonUrl(pageUrl)) {
    t = stripAmazonCatalogSegments(t);
  } else {
    t = stripStreamingPipeSegments(t, pageUrl);
  }

  t = stripPublisherImprints(t);
  t = stripGlobalSuffixes(t);
  t = stripPublisherImprints(t);

  return t.length >= 1 ? normalizeWhitespace(t) : null;
}
