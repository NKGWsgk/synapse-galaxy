import { generateShareSlugWithGemini } from "@/lib/gemini/shareSlug";
import { slugifyAscii, workTitleToShareSlug } from "@/lib/workShareSlug";

export type ShareSlugInput = {
  title: string | null;
  description?: string | null;
  url: string;
  siteName?: string | null;
  existingSlug?: string | null;
  titleChanged?: boolean;
};

/** Gemini → ルールベース fallback の順で共有スラッグを決める。 */
export async function resolveShareSlug(input: ShareSlugInput): Promise<string | null> {
  const title = input.title?.trim() ?? "";
  if (!title) return null;

  if (input.existingSlug?.trim() && !input.titleChanged) {
    return slugifyAscii(input.existingSlug.trim(), 40);
  }

  const gemini = await generateShareSlugWithGemini({
    title,
    description: input.description,
    url: input.url,
    siteName: input.siteName,
  });
  if (gemini.ok) return gemini.slug;

  return workTitleToShareSlug(title);
}
