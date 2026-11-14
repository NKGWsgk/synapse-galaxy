import Link from "next/link";
import type { Metadata } from "next";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { SITE_NAME_EN } from "@/lib/siteMetadata";
import { getWorkEntries } from "@/lib/workPages";

export const revalidate = 600;

export const metadata: Metadata = {
  title: { absolute: `作品一覧｜次に観る・読む作品のつながり - ${SITE_NAME_EN}` },
  description:
    "SYNAPSE Galaxyに登録されている作品の一覧。作品ごとに、つながる作品と「なぜつながるか」のレビューを読めます。",
  alternates: { canonical: "/work" },
};

export default async function WorkIndexPage() {
  const entries = await getWorkEntries();
  return (
    <div className="min-h-screen bg-white text-[#0D0D1C]">
      <header className="border-b border-[#1A1B50]/10 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-[#1A1B50]/80">Synapse</span>
            <span className="text-sm font-semibold text-[#0D0D1C]">Galaxy</span>
          </Link>
          <span className="text-zinc-400">›</span>
          <p className="text-sm font-medium text-zinc-500">作品一覧</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-extrabold sm:text-3xl">作品一覧（{entries.length}作品）</h1>
        <p className="mt-3 text-sm leading-7 text-zinc-500">
          作品名を選ぶと、その作品につながる作品と、つながる理由のレビューを読めます。
        </p>
        <ul className="mt-6 divide-y divide-zinc-200 rounded-[4px] border border-zinc-200">
          {entries.map((e) => (
            <li key={e.slug}>
              <Link href={`/work/${e.slug}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50">
                <span className="min-w-0 truncate text-sm font-medium text-[#1A1B50]">{e.title}</span>
                <span className="shrink-0 text-xs text-zinc-400">{e.links.length}件</span>
              </Link>
            </li>
          ))}
        </ul>
        <AffiliateDisclosure className="mt-6 text-[11px] text-zinc-400" />
      </main>
    </div>
  );
}
