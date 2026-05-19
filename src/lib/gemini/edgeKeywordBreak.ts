import { GoogleGenAI } from "@google/genai";
import { SYNAPSE_EDGE_TITLE_MAX_CHARS } from "@/lib/synapseLimits";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
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
  return `${head}\n${tail}`;
}

/**
 * グラフpill向けに、許可されていれば単一の改行位置を Gemini に提案させる。
 * GEMINI_EDGE_KEYWORD_BREAK=1 かつ GEMINI_API_KEY があるときのみ有効。
 * 失敗時は original を返す。
 */
export async function suggestEdgeKeywordLineBreak(original: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const enabled = process.env.GEMINI_EDGE_KEYWORD_BREAK === "1";
  if (!enabled || !apiKey) return original;

  const trimmed = original.normalize("NFC").trimEnd();
  if (
    !trimmed ||
    [...trimmed].length > SYNAPSE_EDGE_TITLE_MAX_CHARS ||
    trimmed.includes("\n")
  ) {
    return original;
  }

  const systemInstruction = `あなたは日本語・英数字が混じる短文の「改行位置」だけを決めるアシスタントです。
許可されている操作は次のどちらか1つだけです。
1) **改行を入れない**（formatted は入力と完全に同一の文字列）
2) **改行 U+000A をちょうど1個だけ追加**した文字列（それ以外の文字の追加・削除・並べ替え・空白の増減は禁止）

要件:
- 狭いpillで最大2行として読みやすい位置にのみ改行すること。
- **語や助詞・カタカナ語や英単語のちょうど中間でのぶった切り**や、ひと文字だけの行／行末に助詞だけが孤立する並びを避ける。
- formatted の文字コードポイント列は、許可されている操作のみで入力から得られること。

出力は JSON のみ: {"formatted": string}`;

  const userPayload = JSON.stringify({
    max_visual_lines: 2,
    /** 入力はユーザーが済ませている前提。許可できるのは単一 LF の追加のみ。 */
    text: trimmed,
  });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId(),
      contents: userPayload,
      config: {
        systemInstruction,
        temperature: 0.15,
        maxOutputTokens: 128,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text;
    if (typeof raw !== "string" || !raw.trim()) return original;

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return original;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return sanitizeEdgeKeywordBreakOutput(trimmed, parsed.formatted ?? parsed.title);
  } catch (err) {
    console.error("[gemini/edgeKeywordBreak]", err);
    return original;
  }
}
