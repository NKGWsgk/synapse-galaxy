import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SITE_NAME_EN } from "@/lib/siteMetadata";
import { loadSynapseShare } from "@/lib/synapseShare";
import { RedirectToApp } from "./RedirectToApp";

export const revalidate = 3600;

// 空配列を返すと、未生成のシナプスもアクセス時に生成され、以後キャッシュされる
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await loadSynapseShare(id);
  if (!d) return { title: "シナプスが見つかりません", robots: { index: false } };
  const headline = `『${d.source.title}』→『${d.target.title}』`;
  const title = d.title ? `${headline}｜${d.title} - ${SITE_NAME_EN}` : `${headline} - ${SITE_NAME_EN}`;
  const rawDescription = d.reason || `${d.source.title} と ${d.target.title} は、なぜつながるのか。`;
  const description = rawDescription.length > 120 ? `${rawDescription.slice(0, 119)}…` : rawDescription;
  return {
    title: { absolute: title },
    description,
    // 共有・OGP用のページ。検索結果には /work 側を出したいので index しない
    robots: { index: false, follow: true },
    alternates: { canonical: `/s/${d.id}` },
    openGraph: { type: "article", locale: "ja_JP", url: `/s/${d.id}`, siteName: SITE_NAME_EN, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedSynapsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadSynapseShare(id);
  if (!d) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 bg-white px-5 py-10 text-[#0D0D1C]">
      <RedirectToApp to={d.appPath} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1A1B50]/60">{SITE_NAME_EN}</p>
      <h1 className="text-xl font-extrabold leading-snug">
        『{d.source.title}』→『{d.target.title}』
      </h1>
      {d.title ? <p className="text-lg font-bold text-[#1A1B50]">{d.title}</p> : null}
      {d.reason ? <p className="whitespace-pre-line text-sm leading-7 text-zinc-600">{d.reason}</p> : null}
      <Link
        href={d.appPath}
        className="mt-2 inline-flex w-fit items-center gap-2 rounded-[4px] bg-[#1A1B50] px-5 py-2.5 text-sm font-bold text-white no-underline"
      >
        マップで見る →
      </Link>
    </main>
  );
}
