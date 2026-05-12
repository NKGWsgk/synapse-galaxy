import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export type KeywordExtractionOk = { ok: true; keywords: string[] };
export type KeywordExtractionErr = { ok: false; message: string; status?: number };

/**
 * 自由記述から短いキーワード（ビッグワード）を日本語で抽出。3〜8 語程度。
 */
export async function extractKeywordsFromDescription(
  description: string,
): Promise<KeywordExtractionOk | KeywordExtractionErr> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です", status: 401 };
  }

  const systemInstruction = `あなたはキーワード抽出器です。入力は日本語の短い文章（コンテンツ同士の接続理由）です。
出力は JSON のみ。スキーマ: {"keywords": string[]}
- keywords は 3〜6 個。各要素は **2〜3語の短い文**にする（例：「身体と寓話」「記憶による再構成」「ロッキーと言語」）。単語1個だけの要素は避ける
- 接続の骨子が伝わるよう、「AとB」「AによるB」「AからBへ」など、**中黒・助詞を使った名詞句**にする。各要素は全角15文字前後まで
- 重複禁止。一般的すぎる「もの」「こと」だけの句は避ける
- 文頭だけに偏らず、中盤・結論の概念も含める`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId(),
      contents: description.trim(),
      config: {
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, message: "応答が空です" };
    }

    const parsed = JSON.parse(text) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) {
      return { ok: false, message: "keywords 配列がありません" };
    }

    const keywords = parsed.keywords
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim())
      .slice(0, 12);

    return { ok: true, keywords };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini/keywords]", err);
    return { ok: false, message: msg };
  }
}

export type BatchItem = { index: number; description: string };

/**
 * 複数件を1リクエストで抽出（シード用）。返却は index 順と同じ長さ。
 */
export async function extractKeywordsBatch(
  items: BatchItem[],
): Promise<
  | { ok: true; results: { index: number; keywords: string[] }[] }
  | KeywordExtractionErr
> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です", status: 401 };
  }

  const systemInstruction = `各要素について接続理由テキストからキーワード配列を作る。
出力 JSON スキーマのみ: {"results": [{"index": number, "keywords": string[]}, ...]}
- index は入力と同じ数値
- 各 keywords は 3〜6 個。各文字列は **2〜3語の極短い文**（例：「省エネと感動」「比喩と科学」）で、単語1個は避ける
- 「AとB」「AによるB」など接続の論点が一読で残る表現にする
- 文頭に偏らせない。中盤・結論の対比も必ず1つ以上入れる`;

  const userPayload = JSON.stringify({ items }, null, 0);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId(),
      contents: userPayload,
      config: {
        systemInstruction,
        temperature: 0.25,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, message: "応答が空です" };
    }

    const parsed = JSON.parse(text) as { results?: unknown };
    if (!Array.isArray(parsed.results)) {
      return { ok: false, message: "results 配列がありません" };
    }

    const results = parsed.results
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rec = r as { index?: unknown; keywords?: unknown };
        if (typeof rec.index !== "number" || !Array.isArray(rec.keywords)) return null;
        const keywords = rec.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim())
          .slice(0, 12);
        return { index: rec.index, keywords };
      })
      .filter((x): x is { index: number; keywords: string[] } => x !== null);

    return { ok: true, results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini/keywords batch]", err);
    return { ok: false, message: msg };
  }
}
