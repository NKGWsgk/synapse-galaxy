import { detectContentPlatform, isAllowedSynapseUrl } from "@/lib/contentPlatform";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";

/** 同一 canonical 内で代表 URL / サムネを選ぶときのプラットフォーム優先度 */
const PLATFORM_PRIORITY: Record<string, number> = {
  netflix: 100,
  prime: 95,
  youtube: 90,
  disney: 85,
  hulu: 80,
  unext: 75,
  spotify: 70,
  apple_music: 65,
  youtube_music: 60,
  amazon: 55,
  other: 0,
};

export type RepresentativeCandidate = {
  url: string;
  title: string | null;
  image_url: string | null;
  updated_at: string;
};

function representativeScore(row: RepresentativeCandidate, preferredNorm: string | null): number {
  const norm = normalizeSynapseEndpoint(row.url);
  let score = PLATFORM_PRIORITY[detectContentPlatform(row.url)] ?? 0;

  if (row.image_url?.trim()) score += 40;
  if (isAllowedSynapseUrl(row.url)) score += 30;
  if (preferredNorm && norm === preferredNorm) score += 200;

  if (!isAllowedSynapseUrl(row.url)) score -= 50;
  if (/公式サイト|official\s*site/i.test(`${row.title ?? ""} ${row.url}`)) score -= 30;

  return score;
}

/** グラフ endpoint を優先し、許可プラットフォーム > 公式プロモ > 更新日時 の順で代表行を選ぶ */
export function pickRepresentativeRow<T extends RepresentativeCandidate>(
  rows: T[],
  preferredNorm: string | null,
): T {
  return [...rows].sort((a, b) => {
    const diff = representativeScore(b, preferredNorm) - representativeScore(a, preferredNorm);
    if (diff !== 0) return diff;
    return b.updated_at.localeCompare(a.updated_at);
  })[0]!;
}

/** 同一作品の sibling URL から最良のサムネ URL を選ぶ（代表 URL 行に画像が無い場合の fallback） */
export function pickBestImageUrl(rows: RepresentativeCandidate[]): string | null {
  const withImage = rows.filter((r) => r.image_url?.trim());
  if (withImage.length === 0) return null;
  return pickRepresentativeRow(withImage, null).image_url?.trim() ?? null;
}
