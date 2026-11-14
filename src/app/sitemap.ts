import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteMetadata";
import { getWorkEntries } from "@/lib/workPages";

export const revalidate = 600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: siteUrl.origin, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl.origin}/work`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl.origin}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl.origin}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
  try {
    const entries = await getWorkEntries();
    return [
      ...base,
      ...entries.map((e) => ({
        url: `${siteUrl.origin}/work/${e.slug}`,
        lastModified: new Date(e.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (e) {
    console.error("[sitemap] work pages unavailable", e);
    return base;
  }
}
