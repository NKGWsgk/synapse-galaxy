import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export type CanonicalCandidate = {
  canonicalId: string;
  title: string | null;
  url: string;
  siteName: string | null;
};

export type CanonicalizeOk = {
  ok: true;
  matchedCanonicalId: string | null;
  reason?: string;
};

export type CanonicalizeErr = { ok: false; message: string; status?: number };

/**
 * 既存候補の中に「同一作品」があるかを Gemini で判定する。
 * - 同一作品があれば matchedCanonicalId を返す
 * - なければ null
 */
export async function findCanonicalMatch(
  input: { url: string; title: string | null; description: string | null; siteName: string | null },
  candidates: CanonicalCandidate[],
): Promise<CanonicalizeOk | CanonicalizeErr> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です", status: 401 };
  }

  if (!input.title?.trim() || candidates.length === 0) {
    return { ok: true, matchedCanonicalId: null, reason: "no-title-or-candidates" };
  }

  const systemInstruction = `あなたはコンテンツの名寄せ（同一作品判定）エンジンです。
入力は「新規URLの情報」と「既存候補リスト」です。
次のルールで JSON のみを返してください。スキーマ: {"matchIndex": number | null, "reason": string}
- matchIndex は candidates 配列の 0-based index。最も同一性が高いものを 1 つだけ選ぶ
- 同一作品が無い場合は null
- "同名だが別作品" の可能性がある場合は無理にマッチさせない（null）
- URL のドメイン違い（Amazon/楽天/YouTubeレビュー等）は同一性の根拠にも否定にもならない。作品名・著者/監督/型番・シリーズ等を重視する
`;

  const payload = JSON.stringify(
    {
      input,
      candidates,
    },
    null,
    0,
  );

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId(),
      contents: payload,
      config: {
        systemInstruction,
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, message: "応答が空です" };
    }

    const parsed = JSON.parse(text) as { matchIndex?: unknown; reason?: unknown };
    const idx = parsed.matchIndex;
    const reason = typeof parsed.reason === "string" ? parsed.reason : undefined;
    if (idx === null) {
      return { ok: true, matchedCanonicalId: null, reason };
    }
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
      return { ok: false, message: "matchIndex が不正です" };
    }
    return { ok: true, matchedCanonicalId: candidates[idx]!.canonicalId, reason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini/canonicalize]", err);
    return { ok: false, message: msg };
  }
}

