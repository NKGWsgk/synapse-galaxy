import { GoogleGenAI } from "@google/genai";
import { slugifyAscii } from "@/lib/workShareSlug";

const DEFAULT_MODEL = "gemini-2.5-flash";

function modelId(): string {
  return process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_MODEL;
}

export type ShareSlugOk = { ok: true; slug: string };
export type ShareSlugErr = { ok: false; message: string; status?: number };

/**
 * 作品タイトルから共有 URL 用の英語 kebab-case スラッグを生成。
 * 邦題のみ（例: 火星の人）でも原題（the-martian）を返す。
 */
export async function generateShareSlugWithGemini(input: {
  title: string;
  description?: string | null;
  url: string;
  siteName?: string | null;
}): Promise<ShareSlugOk | ShareSlugErr> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です", status: 401 };
  }

  const title = input.title.trim();
  if (!title) {
    return { ok: false, message: "title が空です" };
  }

  const systemInstruction = `You create URL slugs for creative works (books, films, series, music).
Output JSON only: {"slug": string}

Rules for slug:
- lowercase ASCII kebab-case only (a-z, 0-9, hyphens), 2-5 words, max 40 characters
- prefer the established **English** title when the work is known internationally
  (e.g. Japanese 火星の人 → the-martian, プロジェクト・ヘイル・メアリー → project-hail-mary)
- if no established English title, use recognizable Hepburn-style romaji (e.g. kimi-no-na-wa)
- drop leading articles (the/a/an) unless needed for disambiguation
- no platform names (amazon, netflix, youtube)
- no Japanese characters in output`;

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
        systemInstruction,
        temperature: 0.2,
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
    if (slug.length < 3) {
      return { ok: false, message: "slug が短すぎます" };
    }

    return { ok: true, slug };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini/shareSlug]", err);
    return { ok: false, message: msg };
  }
}
