import { generateShareSlugWithGemini } from "@/lib/gemini/shareSlug";
import { isAcceptableShareSlug, isLikelyKatakanaRomajiSlug, slugifyAscii } from "@/lib/workShareSlug";

export type ShareSlugInput = {
  title: string | null;
  description?: string | null;
  url: string;
  siteName?: string | null;
  existingSlug?: string | null;
  titleChanged?: boolean;
  /** Gemini 失敗時の最終フォールバック（canonical_id 等） */
  workId?: string | null;
};

function needsRegeneration(existingSlug: string | null | undefined, titleChanged: boolean): boolean {
  if (titleChanged) return true;
  if (!existingSlug?.trim()) return true;
  return isLikelyKatakanaRomajiSlug(existingSlug.trim());
}

function fallbackSlugFromWorkId(workId: string): string {
  const hex = workId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `work-${hex}`;
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

  // Gemini 失敗時: タイトルが英語中心なら slugify で直接生成
  const directSlug = slugifyAscii(title, 40);
  if (directSlug.length >= 3 && /[a-z]/.test(directSlug) && isAcceptableShareSlug(directSlug)) {
    return directSlug;
  }

  const workId = input.workId?.trim();
  if (workId) return fallbackSlugFromWorkId(workId);

  return null;
}
