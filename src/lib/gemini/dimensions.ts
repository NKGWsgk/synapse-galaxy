import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export type SynapseDimensions = {
  /** 理系度: 科学・論理・データ・証明が中心か（0〜10） */
  dim_rika: number;
  /** 文系度: 物語・思想・感情・人文が中心か（0〜10） */
  dim_bunkei: number;
  /** 芸術度: 映像美・デザイン・世界観・美学が中心か（0〜10） */
  dim_art: number;
  /** 時間軸: 歴史・過去（-5）〜 未来・革新（+5） */
  dim_time: number;
};

export type DimensionsOk = { ok: true; dimensions: SynapseDimensions };
export type DimensionsErr = { ok: false; message: string };

/**
 * シナプス（接続）の「知的次元スコア」をAIで推定する。
 *
 * 評価対象は「なぜこの2作品が繋がるか」という接続の文脈であり、
 * 作品単体の分類ではない。
 *
 * 例:
 *   PHM → サマーウォーズ（理由: 孤独な天才が論理で世界を救う）
 *   → { dim_rika:7, dim_bunkei:4, dim_art:1, dim_time:3 }
 *
 *   サマーウォーズ → 細田守（理由: 映像美と家族ドラマの作家性）
 *   → { dim_rika:1, dim_bunkei:5, dim_art:8, dim_time:2 }
 */
export async function evaluateSynapseDimensions(input: {
  sourceTitle: string | null;
  sourceUrl: string;
  targetTitle: string | null;
  targetUrl: string;
  connectionTitle: string;
  connectionDescription: string;
}): Promise<DimensionsOk | DimensionsErr> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, message: "GEMINI_API_KEY が未設定" };

  const systemInstruction = `あなたはコンテンツ接続の「知的次元」を評価するAIです。
入力は2つの作品と、それらを繋ぐ接続タイトル・理由です。
「なぜこの2作品が繋がるか」という接続の文脈を評価してください。作品単体ではなく接続の性質を評価すること。

以下の4軸でスコアをつけてください:
- dim_rika (0〜10): 科学・論理・数学・工学・データが接続の核か（高=理系的接続）
- dim_bunkei (0〜10): 物語・思想・感情・歴史・社会が接続の核か（高=文系的接続）
- dim_art (0〜10): 映像美・デザイン・世界観・美学・インスタ映えが接続の核か（高=芸術的接続）
- dim_time (-5〜+5): 接続が「過去・歴史・古典」に根ざすか（-5）、「未来・革新・テクノロジー」に根ざすか（+5）

注意:
- 3軸（理系・文系・芸術）は独立して高くなりえる。合計100%制約なし
- 例: ノーランの「映像×哲学」接続 → dim_bunkei:8, dim_art:9（両方高い）
- 接続理由テキストを最重要視。作品名・URLも参考にする

出力はJSONのみ: {"dim_rika": number, "dim_bunkei": number, "dim_art": number, "dim_time": number}`;

  const userContent = JSON.stringify({
    source: { title: input.sourceTitle, url: input.sourceUrl },
    target: { title: input.targetTitle, url: input.targetUrl },
    connection_title: input.connectionTitle,
    connection_description: input.connectionDescription,
  });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId(),
      contents: userContent,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 128,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text;
    if (typeof raw !== "string" || !raw.trim()) {
      return { ok: false, message: "AIの応答が空です" };
    }

    // Gemini がテキストを前置きすることがある → JSON部分だけ抽出
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, message: `JSON not found in response: ${raw.slice(0, 80)}` };
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const clamp = (v: unknown, min: number, max: number): number => {
      const n = Number(v);
      if (isNaN(n)) throw new Error(`invalid number: ${String(v)}`);
      return Math.max(min, Math.min(max, n));
    };

    const dimensions: SynapseDimensions = {
      dim_rika:   clamp(parsed.dim_rika,   0, 10),
      dim_bunkei: clamp(parsed.dim_bunkei, 0, 10),
      dim_art:    clamp(parsed.dim_art,    0, 10),
      dim_time:   clamp(parsed.dim_time,  -5,  5),
    };

    return { ok: true, dimensions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini/dimensions]", err);
    return { ok: false, message: msg };
  }
}
