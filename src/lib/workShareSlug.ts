import { toRomaji } from "wanakana";

const SLUG_MAX = 48;
const LATIN_STOP = new Set([
  "amazon", "netflix", "watch", "official", "prime", "video", "youtube",
  "spotify", "disney", "hulu", "unext", "kindle", "audible", "trailer",
]);

/** ASCII kebab-case（共有 URL 用）。 */
export function slugifyAscii(raw: string, maxLen = SLUG_MAX): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
}

/** OGP タイトルに混ざる英語フレーズを優先抽出（YouTube / 海外作品など）。 */
function extractLatinPhrase(title: string): string | null {
  const matches = title.match(/[A-Za-z][A-Za-z0-9'’\-]*(?:\s+[A-Za-z0-9'’\-]+)*/g);
  if (!matches?.length) return null;

  const candidates = matches
    .map((m) => m.trim())
    .filter((m) => m.length >= 3)
    .filter((m) => !LATIN_STOP.has(m.toLowerCase().split(/\s+/)[0] ?? ""));

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.length - a.length)[0]!;
}

const KATAKANA_RUN = /[\u30A0-\u30FFー]+/g;

/** カタカナ主体タイトル（翻訳書名など）→ romaji スラッグ。 */
function katakanaRomajiPhrase(title: string): string | null {
  const runs = title.match(KATAKANA_RUN);
  if (!runs?.length) return null;

  const parts = title
    .split(/[・･·/|｜：:\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && /^[\u30A0-\u30FFー]+$/.test(p));

  const source = parts.length > 0 ? parts : runs;
  const picked =
    source.length > 1 && source.join("").length > 18
      ? [source[source.length - 1]!]
      : source;

  const romaji = picked.map((p) => toRomaji(p)).join(" ").trim();
  const slug = slugifyAscii(romaji);
  return slug.length >= 3 ? slug : null;
}

/** タイトル全体から読める部分だけ romaji 化（ひらがな・カタカナ混在向け）。 */
function looseRomajiPhrase(title: string): string | null {
  const romaji = toRomaji(title.replace(/[・･·]/g, " "))
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const slug = slugifyAscii(romaji);
  return slug.length >= 3 ? slug : null;
}

/**
 * 作品タイトル → 英語（ASCII）共有スラッグ。
 * 1. タイトル中の英語語句  2. カタカナの romaji  3. その他 romaji 化
 */
export function workTitleToShareSlug(title: string): string | null {
  const trimmed = title.normalize("NFC").trim();
  if (!trimmed) return null;

  const latin = extractLatinPhrase(trimmed);
  if (latin) {
    const slug = slugifyAscii(latin);
    if (slug.length >= 3) return slug;
  }

  const katakana = katakanaRomajiPhrase(trimmed);
  if (katakana) return katakana;

  return looseRomajiPhrase(trimmed);
}

export function shareSlugKey(slug: string): string {
  return slug.normalize("NFC").toLowerCase();
}
