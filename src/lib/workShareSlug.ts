const SLUG_MAX = 48;

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

export function shareSlugKey(slug: string): string {
  return slug.normalize("NFC").toLowerCase();
}

/** カタカナ音写っぽい slug（kuiinzu-gyanbitto, raion 等）を検出。 */
export function isLikelyKatakanaRomajiSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  if (/uu|ii|ou$|ei$|ui$/.test(s)) return true;
  if (/(?:tto|ddo|bbu|ggu|kku|ppu|ssu|zzu|ffu|jji)$/.test(s)) return true;
  if (/(?:gya|gyu|gyo|kya|kyu|kyo|sha|shu|shi|chi|tsu|nya|nyo|raion|kui|heiru|meari|puro|gyan|bitto)/.test(s)) {
    return true;
  }
  return false;
}

export function isAcceptableShareSlug(slug: string): boolean {
  const s = slug.trim();
  return s.length >= 3 && !isLikelyKatakanaRomajiSlug(s);
}
