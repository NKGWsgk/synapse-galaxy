import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { WorkPlatformLink } from "@/components/galaxy/WorkPlatformLink";
import { detectContentPlatform } from "@/lib/contentPlatform";
import { SITE_NAME_EN, SITE_NAME_JA, getSiteUrl } from "@/lib/siteMetadata";
import { findWorkEntry, type WorkEntry } from "@/lib/workPages";

export const revalidate = 600;

const TITLE_SUFFIX = "次に観る・読む作品のつながり";
const REASON_MAX = 1200;

/** Amazon・配信サービスなど、購入・視聴先として判別できる URL のときだけリンクを出す */
const isStoreUrl = (url: string) => detectContentPlatform(url) !== "other";

function buildDescription(e: WorkEntry): string {
  const top = e.links.slice(0, 3).map((l) => (l.keyword ? `${l.otherTitle}（${l.keyword}）` : l.otherTitle));
  const more = e.links.length > 3 ? " ほか" : "";
  const text = `「${e.title}」が好きな人におすすめの作品: ${top.join("、")}${more}。作品と作品が「なぜつながるか」を読者のレビューで紹介します。`;
  return text.length > 150 ? `${text.slice(0, 149)}…` : text;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = await findWorkEntry(slug);
  if (!entry) return { title: "作品が見つかりません", robots: { index: false } };
  const title = `${entry.title}｜${TITLE_SUFFIX} - ${SITE_NAME_EN}`;
  const description = buildDescription(entry);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/work/${entry.slug}` },
    openGraph: {
      type: "article",
      locale: "ja_JP",
      url: `/work/${entry.slug}`,
      siteName: SITE_NAME_EN,
      title,
      description,
      ...(entry.imageUrl ? { images: [{ url: entry.imageUrl, alt: entry.title }] } : {}),
    },
    twitter: { card: entry.imageUrl ? "summary_large_image" : "summary", title, description },
  };
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = await findWorkEntry(slug);
  if (!entry) notFound();

  const origin = getSiteUrl().origin;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${entry.title}｜${TITLE_SUFFIX}`,
    url: `${origin}/work/${entry.slug}`,
    about: { "@type": "CreativeWork", name: entry.title, ...(entry.imageUrl ? { image: entry.imageUrl } : {}) },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: entry.links.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: l.otherTitle,
        url: `${origin}/work/${l.otherSlug}`,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-white text-[#0D0D1C]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <header className="border-b border-[#1A1B50]/10 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-[#1A1B50]/80">Synapse</span>
            <span className="text-sm font-semibold text-[#0D0D1C]">Galaxy</span>
          </Link>
          <span className="text-zinc-400">›</span>
          <Link href="/work" className="text-sm font-medium text-zinc-500 hover:text-[#1A1B50]">作品一覧</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {entry.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.imageUrl}
              alt={entry.title}
              width={160}
              className="h-auto w-32 shrink-0 rounded-[4px] border border-zinc-200 object-cover shadow-sm sm:w-40"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1A1B50]/60">{TITLE_SUFFIX}</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-snug text-[#0D0D1C] sm:text-3xl">{entry.title}</h1>
            <p className="mt-3 text-sm leading-7 text-zinc-500">
              「{entry.title}」が好きな人に、次に観る・読む作品を。{SITE_NAME_JA}（{SITE_NAME_EN}）では、
              作品と作品が「なぜつながるか」を読者のレビューで紹介しています。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {isStoreUrl(entry.url) ? <WorkPlatformLink url={entry.url} /> : null}
              <Link
                href={`/?focus=${entry.slug}`}
                className="inline-flex items-center gap-2 rounded-[4px] bg-[#1A1B50] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2D2F7A]"
              >
                銀河マップで見る →
              </Link>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-bold">
            「{entry.title}」とつながる作品（{entry.links.length}件）
          </h2>
          <ul className="mt-4 space-y-4">
            {entry.links.map((l) => (
              <li
                key={`${l.direction}-${l.otherSlug}-${l.createdAt}`}
                className="rounded-[4px] border border-[#1A1B50]/12 border-l-2 border-l-[#1A1B50]/40 bg-zinc-50 px-5 py-4"
              >
                <p className="text-xs font-semibold text-zinc-500">
                  {l.direction === "out" ? `${entry.title} → ` : ""}
                  <Link href={`/work/${l.otherSlug}`} className="text-[#1A1B50] underline-offset-2 hover:underline">
                    {l.otherTitle}
                  </Link>
                  {l.direction === "in" ? ` → ${entry.title}` : ""}
                </p>
                {l.keyword ? <h3 className="mt-1 font-bold text-[#0D0D1C]">{l.keyword}</h3> : null}
                {l.reason ? (
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-600">
                    {l.reason.length > REASON_MAX ? `${l.reason.slice(0, REASON_MAX)}…` : l.reason}
                  </p>
                ) : null}
                {isStoreUrl(l.otherUrl) || l.likes > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {isStoreUrl(l.otherUrl) ? <WorkPlatformLink url={l.otherUrl} compact inline /> : null}
                    {l.likes > 0 ? <span className="text-xs text-zinc-400">いいね {l.likes}</span> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6">
          <Link href="/work" className="text-sm font-medium text-[#1A1B50] hover:text-[#2D2F7A]">← 作品一覧</Link>
          <Link href="/" className="text-sm font-medium text-[#1A1B50] hover:text-[#2D2F7A]">銀河に戻る →</Link>
        </div>
        <AffiliateDisclosure className="mt-6 text-[11px] text-zinc-400" />
      </main>
    </div>
  );
}
