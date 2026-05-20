import { jaKeywordSoftBreakHints } from "./jaKeywordLineBreak";
import {
  SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE,
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
  if (g.length <= SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE) {
    return [jaKeywordSoftBreakHints(t)];
  }
  const n = SYNAPSE_EDGE_LABEL_TARGET_CHARS_PER_LINE;
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
