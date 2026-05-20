import { GoogleGenAI } from "@google/genai";
import { sanitizeEdgeKeywordBreakOutput } from "../edgeKeywordDisplay";
import {
  SYNAPSE_EDGE_AI_BREAK_FROM_CHARS,
  SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE,
  SYNAPSE_EDGE_LABEL_TARGET_CHARS_PER_LINE,
  SYNAPSE_EDGE_TITLE_MAX_CHARS,
} from "../synapseLimits";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export { sanitizeEdgeKeywordBreakOutput } from "../edgeKeywordDisplay";

/**
 * グラフ pill 用の改行は Gemini のみ（検証は sanitize）。API 失敗時は1行のまま flat を返す。
 */
export async function suggestEdgeKeywordLineBreak(original: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const enabled = process.env.GEMINI_EDGE_KEYWORD_BREAK === "1";
  if (!enabled || !apiKey) return original;

  const trimmed = original.normalize("NFC").trimEnd().replace(/\r/g, "");
  const flatForBreak = trimmed.replace(/\n/g, "");
  const graphemes = [...flatForBreak];
  if (!flatForBreak || graphemes.length > SYNAPSE_EDGE_TITLE_MAX_CHARS || graphemes.length < 2) {
    return original;
  }
  if (graphemes.length < SYNAPSE_EDGE_AI_BREAK_FROM_CHARS) {
    return original;
  }

  const systemInstruction =
    "あなたは、知識グラフ上の短いラベル文に「どこで改行するか」とだけ答えます。" +
    "説明や前置き、マークダウンは書かず、求められた形式の JSON だけを返してください。";

  const userMessage = [
    `渡す文は ${SYNAPSE_EDGE_AI_BREAK_FROM_CHARS} 文字以上だけです（それ未満はこちらに来ません）。`,
    `また、このラベルはシステム上「最大 ${SYNAPSE_EDGE_TITLE_MAX_CHARS} 文字（Unicode で数えた字数）」までです。入力はすでにその範囲内です。改行を入れても増えるのは改行1文字分だけで、字数の上限ルールは変わりません。`,
    `2行に分けるときは必ず「どちらの行も ${SYNAPSE_EDGE_LABEL_MAX_CHARS_PER_LINE} 文字以内（Unicode で数えた字数）」にしてください。目安は各行およそ ${SYNAPSE_EDGE_LABEL_TARGET_CHARS_PER_LINE} 文字までで、なるべく均等に近い改行位置が望ましいです。この条件を満たせないときだけ改行なしで返してください。`,
    "極端に横に長い1行はグラフ上で他のカードと重なります。短文でも改行をはさんだほうがよいときは積極的に2行にしてください。",
    "適切な位置がない・切ると不自然なとき・各行18文字以内にできないときだけ、改行なしで返してください。",
    "",
    "次のどちらか一方だけです。",
    "・改行なし：入力の文字列を1文字も変えずにそのまま返す（formatted は入力と完全一致）。",
    "・改行あり：入力と同じ並びに、改行をちょうど1つだけはさむ（追加・削除・入れ替え・空白の変更はしない）。",
    "",
    "切らないほうがよい位置の例です。",
    "・カタカナ語の途中（例：コンピュータ、サバイブ、DEEP）。",
    "・ひらがなだけの語の途中（例：「わかる」「映画」が分断されるところ）。",
    "・英字や数字が続いている部分の途中。",
    "・どちらかの行が「へ」など助詞1文字だけになるところ。",
    "",
    "切ってよい例：句読点の直後、意味の小さなまとまりの境目、スペースの後。",
    "",
    '答えは JSON だけ。{"formatted":"…"} の形。改行を入れてよいのはその1文字分だけ。',
    '例：{"formatted":"1行目\\n2行目"}',
    "",
    "テキスト:",
    flatForBreak,
  ].join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    let response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>> | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: modelId(),
          contents: userMessage,
          config: {
            systemInstruction,
            temperature: 0.15,
            maxOutputTokens: 128,
            responseMimeType: "application/json",
          },
        });
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const retryable = msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE");
        if (retryable && attempt < 3) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        throw e;
      }
    }
    if (!response) {
      return flatForBreak;
    }

    const raw = response.text;
    if (typeof raw !== "string" || !raw.trim()) {
      return flatForBreak;
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return flatForBreak;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const out = sanitizeEdgeKeywordBreakOutput(flatForBreak, parsed.formatted ?? parsed.title);
    return out.includes("\n") ? out : flatForBreak;
  } catch (err) {
    console.error("[gemini/edgeKeywordBreak]", err);
    return flatForBreak;
  }
}
