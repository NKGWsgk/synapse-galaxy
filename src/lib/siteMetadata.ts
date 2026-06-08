import type { Metadata } from "next";

export const SITE_NAME_JA = "シナプスギャラクシー";
export const SITE_NAME_EN = "SYNAPSE Galaxy";
export const SITE_TAGLINE = "コンテンツを「なぜ繋がるか」で結ぶシナプス型ネットワーク";

/** 検索・schema.org 用の別名（ブランド表記は SITE_NAME_EN を正とする） */
export const SITE_ALTERNATE_NAMES = [
  SITE_NAME_JA,
  "シナプス ギャラクシー",
  "synapse galaxy",
  "Synapse Galaxy",
] as const;

export const SITE_DESCRIPTION =
  "SYNAPSE Galaxy（シナプスギャラクシー）は、書籍・動画・Web記事などのコンテンツを「なぜ繋がるか」という自由記述で結ぶシナプス型SNSです。4×4コンパスで接続を探索し、AIが抽出するキーワードと8属性（理・文・芸・時ほか）で知的好奇心を可視化します。";

/** SNS シェア用 OGP 画像（public/ 配下） */
export const SITE_OGP_IMAGE = {
  path: "/ogp.jpg",
  width: 1024,
  height: 629,
  alt: "SYNAPSE Galaxy — コンテンツを「なぜ繋がるか」で結ぶシナプス型ネットワーク",
} as const;

export const SITE_KEYWORDS = [
  SITE_NAME_JA,
  "シナプス ギャラクシー",
  SITE_NAME_EN,
  "synapse galaxy",
  "シナプス",
  "コンテンツ",
  "読書",
  "映画",
  "ネットワーク",
  "知的好奇心",
  "SNS",
  "書籍",
  "動画",
  "接続",
  "コンパス",
  "OGP",
];

function urlFromHost(host: string): URL | null {
  const trimmed = host.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** SEO / OGP / sitemap 用の正規オリジン（プレビュー URL ではなく本番ドメインを優先） */
export function getSiteUrl(): URL {
  const fromEnv = urlFromHost(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (fromEnv) return fromEnv;

  // Vercel: VERCEL_URL はデプロイごとのプレビュー URL になり得る（OGP クローラーが 401 で弾かれる）
  const production = urlFromHost(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "");
  if (production) return production;

  const vercel = urlFromHost(process.env.VERCEL_URL ?? "");
  if (vercel) return vercel;

  return new URL("http://localhost:3000");
}

export function buildSiteMetadata(overrides?: Metadata): Metadata {
  const defaultTitle = `${SITE_NAME_EN} | ${SITE_NAME_JA}`;
  const combinedName = `${SITE_NAME_EN}（${SITE_NAME_JA}）`;

  return {
    metadataBase: getSiteUrl(),
    title: {
      default: defaultTitle,
      template: `%s | ${SITE_NAME_JA}`,
    },
    description: SITE_DESCRIPTION,
    keywords: [...SITE_KEYWORDS],
    applicationName: combinedName,
    category: "social network",
    openGraph: {
      type: "website",
      locale: "ja_JP",
      url: "/",
      siteName: combinedName,
      title: defaultTitle,
      description: SITE_DESCRIPTION,
      images: [
        {
          url: SITE_OGP_IMAGE.path,
          width: SITE_OGP_IMAGE.width,
          height: SITE_OGP_IMAGE.height,
          alt: SITE_OGP_IMAGE.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description: SITE_DESCRIPTION,
      images: [SITE_OGP_IMAGE.path],
    },
    alternates: {
      canonical: "/",
    },
    robots: {
      index: true,
      follow: true,
    },
    ...overrides,
  };
}

export function buildWebsiteJsonLd(): Record<string, unknown> {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME_EN,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: siteUrl.origin,
    description: SITE_DESCRIPTION,
    inLanguage: "ja",
  };
}
