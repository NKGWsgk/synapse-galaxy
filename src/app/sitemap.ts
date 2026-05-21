import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteMetadata";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();
  return [
    { url: siteUrl.origin, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl.origin}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl.origin}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
