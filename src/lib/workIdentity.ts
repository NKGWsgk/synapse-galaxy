import { isAmazonUrl } from "@/lib/amazon";
import { extractPureWorkTitle } from "@/lib/pureWorkTitle";

/** 作品境界: 媒体・シーズン・総集編などは別作品。巻・装丁・店 URL は同一。 */
export type WorkMedium = "book" | "video" | "audio" | "unknown";
export type WorkEdition = "standard" | "compilation" | "remake";

export type WorkIdentity = {
  baseTitle: string;
  medium: WorkMedium;
  edition: WorkEdition;
  /** 正規化シーズンキー（例 s1）。無ければ null */
  season: string | null;
};

const VOLUME_TAIL_RE =
  /\s*(?:[（(【]\s*)?(?:第\s*[0-9０-９一二三四五六七八九十百千]+\s*)?[上下](?:巻|册|冊)?(?:\s*[）)】])?\s*$/u;
const VOLUME_NUMBER_TAIL_RE =
  /\s*(?:第\s*[0-9０-９一二三四五六七八九十百千]+\s*(?:巻|册|冊)|[0-9０-９]+\s*(?:巻|册|冊)|Vol\.?\s*[0-9]+)\s*$/iu;

const SEASON_PATTERNS: readonly RegExp[] = [
  /(?:シーズン|Season)\s*([0-9０-９]{1,2})/i,
  /\bS([0-9]{1,2})\b/i,
  /第\s*([0-9０-９]{1,2})\s*(?:シーズン|期)/,
];

const COMPILATION_RE =
  /総集編|完全版|コンプリート|COMPLETE(?:\s+EDITION)?|OMNIBUS|ディレクターズ・?カット/i;
const REMAKE_RE = /リメイク|再製作|リブート/i;

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toAsciiDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
}

export function extractSeasonKey(title: string): string | null {
  for (const re of SEASON_PATTERNS) {
    const m = title.match(re);
    if (!m?.[1]) continue;
    const n = parseInt(toAsciiDigits(m[1]), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99) return `s${n}`;
  }
  return null;
}

export function extractWorkEdition(title: string): WorkEdition {
  if (REMAKE_RE.test(title)) return "remake";
  if (COMPILATION_RE.test(title)) return "compilation";
  return "standard";
}

export function mediumFromUrl(url: string): WorkMedium {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    if (
      h.includes("youtube.com") ||
      h === "youtu.be" ||
      h.includes("netflix.com") ||
      h.includes("disneyplus.com") ||
      h.includes("hulu.com") ||
      h.includes("hulu.jp") ||
      path.includes("/gp/video") ||
      h.includes("primevideo.com")
    ) {
      return "video";
    }
    if (h.includes("open.spotify.com") || h.includes("music.apple.com") || h.includes("music.youtube.com")) {
      return "audio";
    }
    if (isAmazonUrl(url)) {
      if (path.includes("/gp/video") || /(?:dvd|blu-?ray|ブルーレイ)/i.test(path)) return "video";
      return "book";
    }
  } catch {
    // ignore
  }
  return "unknown";
}

/** 巻・部番号を落としたベースタイトル（シーズン表記は残す） */
export function stripVolumeMarkers(title: string): string {
  let s = normalizeWhitespace(title);
  for (let i = 0; i < 6; i++) {
    const next = s.replace(VOLUME_TAIL_RE, "").replace(VOLUME_NUMBER_TAIL_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return normalizeWhitespace(s);
}

function normalizeBaseTitleKey(title: string): string {
  return normalizeWhitespace(title)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[『』「」【】（）()\[\]［］]/g, "")
    .replace(/[・･\s]+/g, " ")
    .trim();
}

/**
 * URL + タイトルから作品同一判定用フィンガープリントを作る。
 * 同一フィンガープリント → 同一 canonical_id（作品）に束ねる。
 */
export function computeWorkFingerprint(
  title: string | null | undefined,
  pageUrl: string,
): string {
  const identity = resolveWorkIdentity(title, pageUrl);
  const titleKey = normalizeBaseTitleKey(identity.baseTitle) || "_untitled";
  const seasonPart = identity.season ?? "-";
  return `v1|${identity.medium}|${identity.edition}|${seasonPart}|${titleKey}`;
}

export function resolveWorkIdentity(
  title: string | null | undefined,
  pageUrl: string,
): WorkIdentity {
  const raw = title?.trim() ?? "";
  const season = raw ? extractSeasonKey(raw) : null;
  const edition = raw ? extractWorkEdition(raw) : "standard";
  const medium = mediumFromUrl(pageUrl);

  const pure = extractPureWorkTitle(raw || null, pageUrl);
  const volStripped = stripVolumeMarkers(pure ?? raw);
  const baseTitle = normalizeWhitespace(volStripped) || pure || raw || pageUrl;

  return { baseTitle, medium, edition, season };
}
