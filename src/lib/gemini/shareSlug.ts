import { GoogleGenAI } from "@google/genai";
import { isAcceptableShareSlug, slugifyAscii } from "@/lib/workShareSlug";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export type ShareSlugOk = { ok: true; slug: string };
export type ShareSlugErr = { ok: false; message: string; status?: number };

function buildSystemInstruction(strictEnglish: boolean): string {
  const base = `You create URL slugs for creative works (books, films, series, music).
Output JSON only: {"slug": string}

Rules for slug:
- lowercase ASCII kebab-case only (a-z, 0-9, hyphens), 2-5 words, max 40 characters
- use the established **English original title**, NOT Japanese pronunciation
- NEVER output katakana transliterations or Hepburn romaji`;

  const examples = `
Examples (Japanese title → slug):
- クィーンズ・ギャンビット / クイーンズギャンビット → queens-gambit
- プロジェクト・ヘイル・メアリー → project-hail-mary
- 火星の人 → the-martian
- ライオン (film) → lion
- インターステラー → interstellar

WRONG (never output): kuiinzu-gyanbitto, raion, purojekuto-heiru-mearii, kuiinzugyanbitto`;

  const strict = strictEnglish
    ? `\nThe input title is Japanese katakana or kanji. Return ONLY the internationally known English title slug.`
    : "";

  return `${base}${examples}${strict}
- drop leading articles (the/a/an) unless needed for disambiguation
- no platform names (amazon, netflix, youtube)`;
}

/**
 * 作品タイトルから共有 URL 用の英語 kebab-case スラッグを生成。
 */
export async function generateShareSlugWithGemini(
  input: {
    title: string;
    description?: string | null;
    url: string;
    siteName?: string | null;
  },
  opts?: { strictEnglish?: boolean },
): Promise<ShareSlugOk | ShareSlugErr> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です", status: 401 };
  }

  const title = input.title.trim();
  if (!title) {
    return { ok: false, message: "title が空です" };
  }

  const payload = {
    title,
    description: (input.description ?? "").trim().slice(0, 400) || null,
    url: input.url,
    siteName: input.siteName?.trim() || null,
  };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId(),
      contents: JSON.stringify(payload),
      config: {
        systemInstruction: buildSystemInstruction(opts?.strictEnglish ?? false),
        temperature: 0.1,
        maxOutputTokens: 128,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, message: "応答が空です" };
    }

    const parsed = JSON.parse(text) as { slug?: unknown };
    if (typeof parsed.slug !== "string" || !parsed.slug.trim()) {
      return { ok: false, message: "slug がありません" };
    }

    const slug = slugifyAscii(parsed.slug.trim(), 40);
    if (!isAcceptableShareSlug(slug)) {
      return { ok: false, message: "slug が英語原題ではありません" };
    }

    return { ok: true, slug };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini/shareSlug]", err);
    return { ok: false, message: msg };
  }
}
