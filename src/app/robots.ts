import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteMetadata";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl.origin}/sitemap.xml`,
  };
}
