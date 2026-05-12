"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SynapseRow } from "@/lib/supabase/clients";
import { GlobalMapSvg } from "./FocusCompass";

type Props = {
  userId: string;
  synapses: SynapseRow[];
  totalLikes: number;
};

function pickInitialFocus(synapses: SynapseRow[]): string | null {
  const counts = new Map<string, number>();
  for (const s of synapses) {
    counts.set(s.source_url, (counts.get(s.source_url) ?? 0) + 1);
    counts.set(s.target_url, (counts.get(s.target_url) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [url, count] of counts) {
    if (count > bestCount) { best = url; bestCount = count; }
  }
  return best ?? synapses[0]?.source_url ?? null;
}

export function UserProfilePage({ userId, synapses, totalLikes }: Props) {
  const initialFocus = useMemo(() => pickInitialFocus(synapses), [synapses]);
  const [focusUrl, setFocusUrl] = useState<string | null>(initialFocus);
  const [listOpen, setListOpen] = useState(false);

  const worksCount = useMemo(() => {
    const set = new Set<string>();
    for (const s of synapses) { set.add(s.source_url); set.add(s.target_url); }
    return set.size;
  }, [synapses]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-500/80">Synapse</span>
            <span className="text-sm font-semibold text-zinc-900">Galaxy</span>
          </Link>
          <span className="text-zinc-300">›</span>
          <span className="text-sm font-medium text-zinc-600">ユーザーページ</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* プロフィールヘッダー */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600">
            {userId.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">ID: {userId.slice(0, 12)}…</p>
            <div className="mt-1 flex items-center gap-4 text-sm">
              <span className="font-semibold text-zinc-800">{synapses.length}<span className="ml-1 font-normal text-zinc-500">件のシナプス</span></span>
              <span className="font-semibold text-zinc-800">{worksCount}<span className="ml-1 font-normal text-zinc-500">作品</span></span>
              <span className="font-semibold text-rose-600">{totalLikes}<span className="ml-1 font-normal text-zinc-500">いいね</span></span>
            </div>
          </div>
        </div>

        {/* 「このユーザーの宇宙」: 全体表示と同じ見せ方 */}
        <section className="mb-6">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            このユーザーの宇宙
          </h2>
          {synapses.length === 0 || !focusUrl ? (
            <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
              まだシナプスがありません
            </div>
          ) : (
            <div className="relative h-[640px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <GlobalMapSvg focusUrl={focusUrl} synapses={synapses} onFocusUrl={setFocusUrl} />
            </div>
          )}
        </section>

        {/* シナプス一覧（折り畳み） */}
        {synapses.length > 0 ? (
          <section>
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 transition hover:text-zinc-700"
            >
              <span>シナプス一覧（{synapses.length}）</span>
              <span aria-hidden className={listOpen ? "rotate-90" : ""}>›</span>
            </button>
            {listOpen ? (
              <ul className="space-y-3">
                {synapses.map((s) => (
                  <li key={s.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px] font-medium text-zinc-500">
                      <button type="button" onClick={() => setFocusUrl(s.source_url)} className="max-w-[180px] truncate text-indigo-700 hover:underline">
                        {truncUrl(s.source_url)}
                      </button>
                      <span className="text-zinc-300">→</span>
                      <button type="button" onClick={() => setFocusUrl(s.target_url)} className="max-w-[180px] truncate text-violet-700 hover:underline">
                        {truncUrl(s.target_url)}
                      </button>
                    </div>
                    <p className="mb-2 text-sm leading-relaxed text-zinc-700">{s.description}</p>
                    <div className="flex items-center justify-between">
                      {s.keywords?.length ? (
                        <p className="text-[10px] text-zinc-400">{s.keywords.slice(0, 5).join(" · ")}</p>
                      ) : <span />}
                      <span className="text-[11px] font-semibold text-rose-500">♥ {s.likes_count ?? 0}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function truncUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.slice(0, 20);
  } catch { return url.slice(0, 32); }
}
