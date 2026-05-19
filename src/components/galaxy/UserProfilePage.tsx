"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SynapseRow } from "@/lib/supabase/clients";
import { createBrowserClient } from "@/lib/supabase/browser";
import { GraphView } from "./GraphView";

type Props = {
  userId: string;
  displayName?: string;
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

export function UserProfilePage({ userId, displayName, synapses: initialSynapses, totalLikes: initialTotalLikes }: Props) {
  // 削除でクライアント側のリストを更新するため、ローカル state にコピー
  const [synapses, setSynapses] = useState<SynapseRow[]>(initialSynapses);
  const [totalLikes, setTotalLikes] = useState<number>(initialTotalLikes);
  const [focusUrl, setFocusUrl] = useState<string | null>(() => pickInitialFocus(initialSynapses));
  const [listOpen, setListOpen] = useState(false);

  // 自分のページか判定（current user id を取得）
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const isOwnPage = currentUserId === userId;

  const worksCount = useMemo(() => {
    const set = new Set<string>();
    for (const s of synapses) { set.add(s.source_url); set.add(s.target_url); }
    return set.size;
  }, [synapses]);

  // 削除：確認後に DELETE API → 成功でローカル state から除去
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const handleDelete = useCallback(async (synapse: SynapseRow) => {
    setDeletingId(synapse.id);
    try {
      const supabase = createBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        alert("ログインが必要です");
        return;
      }
      const res = await fetch(`/api/synapse/${synapse.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`削除に失敗：${j.error ?? res.statusText}`);
        return;
      }
      setSynapses((prev) => prev.filter((s) => s.id !== synapse.id));
      setTotalLikes((prev) => Math.max(0, prev - (synapse.likes_count ?? 0)));
      setConfirmingId(null);
    } catch {
      alert("通信エラー");
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <div className="flex h-screen min-h-0 w-full flex-col bg-zinc-50">
      {/* シンプルなヘッダー */}
      <header className="shrink-0 border-b border-zinc-200/80 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link href="/" className="flex flex-col leading-none">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-500/80">Synapse</span>
            <span className="text-sm font-semibold text-zinc-900">Galaxy</span>
          </Link>
          <span className="text-zinc-300">›</span>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
              {(displayName ?? "U").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{displayName ?? `User ${userId.slice(0, 8)}`}</p>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span><span className="font-semibold text-zinc-700">{synapses.length}</span> シナプス</span>
                <span><span className="font-semibold text-zinc-700">{worksCount}</span> 作品</span>
                <span><span className="font-semibold text-rose-600">{totalLikes}</span> ♥</span>
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
            >
              {listOpen ? "宇宙を見る" : "シナプス一覧"}
            </button>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {synapses.length === 0 || !focusUrl ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            まだシナプスがありません
          </div>
        ) : listOpen ? (
          // シナプス一覧（削除可能）
          <div className="mx-auto h-full max-w-4xl overflow-y-auto px-4 py-6">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              シナプス一覧（{synapses.length}）{isOwnPage ? " ・ 自分の投稿" : ""}
            </h2>
            <ul className="space-y-3">
              {synapses.map((s) => (
                <li key={s.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px] font-medium text-zinc-500">
                    <button
                      type="button"
                      onClick={() => { setFocusUrl(s.source_url); setListOpen(false); }}
                      className="max-w-[200px] truncate text-indigo-700 hover:underline"
                    >
                      {truncUrl(s.source_url)}
                    </button>
                    <span className="text-zinc-300">→</span>
                    <button
                      type="button"
                      onClick={() => { setFocusUrl(s.target_url); setListOpen(false); }}
                      className="max-w-[200px] truncate text-violet-700 hover:underline"
                    >
                      {truncUrl(s.target_url)}
                    </button>
                  </div>
                  <p className="mb-2 text-sm leading-relaxed text-zinc-700">{s.description}</p>
                  <div className="flex items-center justify-between gap-3">
                    {s.keywords?.length ? (
                      <p className="text-[10px] text-zinc-400">{s.keywords.slice(0, 5).join(" · ")}</p>
                    ) : <span />}
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold text-rose-500">♥ {s.likes_count ?? 0}</span>
                      {isOwnPage ? (
                        confirmingId === s.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(s)}
                              disabled={deletingId === s.id}
                              className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                            >
                              {deletingId === s.id ? "削除中…" : "本当に削除"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingId(null)}
                              disabled={deletingId === s.id}
                              className="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                            >
                              戻る
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(s.id)}
                            className="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                          >
                            削除
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <GraphView focusUrl={focusUrl} synapses={synapses} onFocusUrl={setFocusUrl} />
        )}
      </main>
    </div>
  );
}

function truncUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.slice(0, 24);
  } catch { return url.slice(0, 32); }
}
