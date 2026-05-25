import { generateShareSlugWithGemini } from "@/lib/gemini/shareSlug";
import { isAcceptableShareSlug, isLikelyKatakanaRomajiSlug, slugifyAscii } from "@/lib/workShareSlug";

export type ShareSlugInput = {
  title: string | null;
  description?: string | null;
  url: string;
  siteName?: string | null;
  existingSlug?: string | null;
  titleChanged?: boolean;
};

function needsRegeneration(existingSlug: string | null | undefined, titleChanged: boolean): boolean {
  if (titleChanged) return true;
  if (!existingSlug?.trim()) return true;
  return isLikelyKatakanaRomajiSlug(existingSlug.trim());
}

/** Gemini のみで英語原題スラッグを決める（カタカナ音写フォールバックなし）。 */
export async function resolveShareSlug(input: ShareSlugInput): Promise<string | null> {
  const title = input.title?.trim() ?? "";
  if (!title) return null;

  const existing = input.existingSlug?.trim() ?? null;
  if (existing && !needsRegeneration(existing, input.titleChanged ?? false)) {
    return slugifyAscii(existing, 40);
  }

  let gemini = await generateShareSlugWithGemini({
    title,
    description: input.description,
    url: input.url,
    siteName: input.siteName,
  });

  if (!gemini.ok || !isAcceptableShareSlug(gemini.slug)) {
    gemini = await generateShareSlugWithGemini(
      { title, description: input.description, url: input.url, siteName: input.siteName },
      { strictEnglish: true },
    );
  }

  if (gemini.ok && isAcceptableShareSlug(gemini.slug)) {
    return gemini.slug;
  }

  return null;
}
