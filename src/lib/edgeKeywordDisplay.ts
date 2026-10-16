import { jaKeywordSoftBreakHints } from "./jaKeywordLineBreak";
import {
  SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE,
  SYNAPSE_EDGE_LABEL_MIN_CHARS_PER_LINE,
  SYNAPSE_EDGE_LABEL_TARGET_CHARS_PER_LINE,
} from "./synapseLimits";

export type EdgeKeywordRenderPlan =
  | { mode: "hints"; raw: string }
  | { mode: "explicit"; lines: readonly [string, string] };

/**
 * 2行のどちらかが「ひらがな助詞のみ1グリフ」なら読みやすさが崩れやすい（例: 1行目「…世界」+ 2行目「へ」のみ）。
 */
export function isLoneAssistParticleSegment(fragment: string): boolean {
  const seg = [...fragment.normalize("NFC").trim()];
  if (seg.length !== 1) return false;
  /** ひらがな typical 孤立助詞 */
  return /^[へがはをにもでのとものやかねばゃゅょっ]$/u.test(seg[0]!);
}

/**
 * AI が入れた単一改行のみ許可できるか検証し、許可できるときだけ sanitized を返す。
 * （並べ替え・文字の増減は一切認めない）
 */
export function sanitizeEdgeKeywordBreakOutput(original: string, formatted: unknown): string {
  if (typeof formatted !== "string") return original;
  const cand = formatted.normalize("NFC").trim();
  const flat = cand.replace(/\n/g, "");
  if (flat !== original) return original;
  const newlines = (cand.match(/\n/g) ?? []).length;
  if (newlines === 0) return original;

  const i = cand.indexOf("\n");
  const head = cand.slice(0, i).trimEnd();
  const tail = cand.slice(i + 1).replace(/\n/g, "").trimStart();
  if (!head || !tail) return original;
  if (`${head}${tail}` !== original) return original;
  if (isLoneAssistParticleSegment(tail) || isLoneAssistParticleSegment(head)) return original;
  const headG = [...head];
  const tailG = [...tail];
  if (headG.length > SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE || tailG.length > SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE) {
    return original;
  }
  return `${head}\n${tail}`;
}

const EDGE_KEYWORD_BREAK_AFTER = new Set(["、", "。", "，", ",", ".", "：", ":", "；", ";"]);

const EDGE_KEYWORD_BREAK_AFTER_PHRASES = [
  "に対して",
  "について",
  "によって",
  "としての",
  "からの",
  "ために",
  "という",
  "ような",
  "として",
  "から",
  "まで",
  "より",
  "への",
  "には",
  "では",
  "でも",
  "とは",
  "にも",
  "ため",
  "と",
  "や",
  "が",
  "は",
  "を",
  "に",
  "で",
  "の",
].sort((a, b) => [...b].length - [...a].length);

function isKatakanaLike(ch: string): boolean {
  return /^[ァ-ヴー]$/u.test(ch);
}

function isAsciiWord(ch: string): boolean {
  return /^[A-Za-z0-9]$/u.test(ch);
}

function isHiragana(ch: string): boolean {
  return /^[ぁ-ん]$/u.test(ch);
}

function isSmallKanaOrMark(ch: string): boolean {
  return /^[ゃゅょっャュョッー゛゜]$/u.test(ch);
}

function isProtectedRunBreak(prev: string | undefined, next: string | undefined): boolean {
  if (!prev || !next) return true;
  if (isSmallKanaOrMark(next)) return true;
  if (isKatakanaLike(prev) && isKatakanaLike(next)) return true;
  if (isAsciiWord(prev) && isAsciiWord(next)) return true;
  if (isHiragana(prev) && isHiragana(next)) return true;
  return false;
}

function breakRank(head: string, tail: string, hintedPositions: Set<number>): number | null {
  const last = [...head].at(-1);
  if (last && EDGE_KEYWORD_BREAK_AFTER.has(last)) return 0;
  if (EDGE_KEYWORD_BREAK_AFTER_PHRASES.some((phrase) => head.endsWith(phrase))) return 1;
  if (/^[「『（(【\[]/u.test(tail)) return 2;
  if (hintedPositions.has([...head].length)) return 3;
  return null;
}

function zwspBreakPositions(raw: string): Set<number> {
  const hinted = jaKeywordSoftBreakHints(raw);
  const positions = new Set<number>();
  let n = 0;
  for (const ch of [...hinted]) {
    if (ch === "\u200b") {
      positions.add(n);
    } else {
      n++;
    }
  }
  return positions;
}

/**
 * 日本語として自然な位置で最大2行に分ける（AI 失敗時・表示フォールバック・保存前の決定論的改行）。
 * 10文字以上は、句読点・助詞/接続表現・soft break hint の順に候補を探す。
 */
export function findEdgeKeywordTwoLineSplit(flat: string): readonly [string, string] | null {
  const t = flat.normalize("NFC").replace(/\u200b/g, "");
  const all = [...t];
  if (all.length < 10) return null;
  const minPerLine = SYNAPSE_EDGE_LABEL_MIN_CHARS_PER_LINE;
  const maxPerLine = SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE;
  const targetPerLine = SYNAPSE_EDGE_LABEL_TARGET_CHARS_PER_LINE;
  const hintedPositions = zwspBreakPositions(t);

  type Cand = { head: string; tail: string; score: number };
  let best: Cand | null = null;

  for (let i = 1; i < all.length; i++) {
    const head = all.slice(0, i).join("");
    const tail = all.slice(i).join("");
    if (!head || !tail || `${head}${tail}` !== t) continue;
    if (isLoneAssistParticleSegment(head) || isLoneAssistParticleSegment(tail)) continue;

    const headG = [...head];
    const tailG = [...tail];
    if (
      headG.length < minPerLine ||
      tailG.length < minPerLine ||
      headG.length > maxPerLine ||
      tailG.length > maxPerLine ||
      isProtectedRunBreak(all[i - 1], all[i])
    ) {
      continue;
    }

    const rank = breakRank(head, tail, hintedPositions);
    if (rank == null) continue;
    const imbalance = Math.abs(headG.length - tailG.length);
    const longest = Math.max(headG.length, tailG.length);
    const overTarget = Math.max(0, longest - targetPerLine);
    const score = rank * 1000 + overTarget * 60 + imbalance * 8 + Math.abs(i - all.length / 2);
    const cand: Cand = { head, tail, score };
    if (!best || cand.score < best.score) best = cand;
  }

  if (best) return [best.head, best.tail];

  if (all.length > maxPerLine) {
    const midpoint = Math.ceil(all.length / 2);
    for (let distance = 0; distance <= all.length; distance++) {
      for (const i of [midpoint - distance, midpoint + distance]) {
        if (i <= 0 || i >= all.length) continue;
        const head = all.slice(0, i).join("");
        const tail = all.slice(i).join("");
        const headG = [...head];
        const tailG = [...tail];
        if (
          headG.length >= minPerLine &&
          tailG.length >= minPerLine &&
          headG.length <= maxPerLine &&
          tailG.length <= maxPerLine &&
          !isProtectedRunBreak(all[i - 1], all[i]) &&
          !isLoneAssistParticleSegment(head) &&
          !isLoneAssistParticleSegment(tail)
        ) {
          return [head, tail];
        }
      }
    }
  }

  return null;
}

/**
 * keywords[0] などの接続短題の表示計画。
 * - DB に U+000A があると explicit。
 * - 改行位置は AI＋保存結果のみ（ローカルでは足さない）。
 */
export function getEdgeKeywordRenderPlan(raw: string): EdgeKeywordRenderPlan {
  const t = raw.normalize("NFC").replace(/\r/g, "\n");
  const i = t.indexOf("\n");
  if (i < 0) return { mode: "hints", raw: t };
  const head = t.slice(0, i).trimEnd();
  const tail = t.slice(i + 1).replace(/\n/g, "").trimStart();
  if (!head || !tail) {
    const flat = head || tail ? `${head}${tail}` : t.replace(/\n/g, "");
    return { mode: "hints", raw: flat };
  }
  if (isLoneAssistParticleSegment(tail) || isLoneAssistParticleSegment(head)) {
    return { mode: "hints", raw: `${head}${tail}` };
  }
  return { mode: "explicit", lines: [head, tail] };
}

/**
 * グラフ pill / コンパス用の行配列。
 * 2行は DB（AI）の \\n のみ。\\n が無い行は ZWSP ヒント付き1行（CSS 折返し用）。幅は GraphView 側の font 調整。
 */
/** 狭い pill 用: 1行が長すぎると SVG でも HTML でもはみ出すため、表示だけ 2 行に分割（DB 文字列は変えない） */
function splitEdgeLabelForPillDisplay(flat: string): string[] {
  const t = flat.normalize("NFC").replace(/\u200b/g, "");
  const g = [...t];
  const punctSplit = findEdgeKeywordTwoLineSplit(t);
  if (punctSplit) return [...punctSplit];
  if (g.length <= SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE) {
    return [jaKeywordSoftBreakHints(t)];
  }
  const n = Math.ceil(g.length / 2);
  return [g.slice(0, n).join(""), g.slice(n).join("")];
}

export function getEdgeKeywordPillLines(keyword: string): string[] {
  const plan = getEdgeKeywordRenderPlan(keyword);
  if (plan.mode === "explicit") {
    const a = plan.lines[0];
    const b = plan.lines[1];
    if ([...a].length <= SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE && [...b].length <= SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE) {
      return [a, b];
    }
    return splitEdgeLabelForPillDisplay(`${a}${b}`);
  }
  return splitEdgeLabelForPillDisplay(plan.raw.replace(/\n/g, ""));
}
