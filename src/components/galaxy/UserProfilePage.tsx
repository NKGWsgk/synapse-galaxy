"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SynapseRow } from "@/lib/supabase/clients";
import { createBrowserClient } from "@/lib/supabase/browser";
import { CopyLinkButton } from "@/components/galaxy/CopyLinkButton";
import { SiteFooter } from "@/components/galaxy/SiteFooter";
import { GraphView, type GraphDetailRequest } from "./GraphView";
import { resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { endpointDisplayTitle } from "@/lib/workEndpoint";
import type { WorkEndpointMap } from "@/lib/workResolve";

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
  const raw = best ?? synapses[0]?.source_url ?? null;
  return raw ? normalizeSynapseEndpoint(raw) : null;
}

export function UserProfilePage({ userId, displayName, synapses: initialSynapses, totalLikes: initialTotalLikes }: Props) {
  // 削除でクライアント側のリストを更新するため、ローカル state にコピー
  const [synapses, setSynapses] = useState<SynapseRow[]>(initialSynapses);
  const [totalLikes, setTotalLikes] = useState<number>(initialTotalLikes);
  const [focusUrl, setFocusUrl] = useState<string | null>(() => pickInitialFocus(initialSynapses));
  const handleFocusUrl = useCallback((url: string) => {
    setFocusUrl(normalizeSynapseEndpoint(url));
  }, []);
  const [listOpen, setListOpen] = useState(false);
  const [workEndpoints, setWorkEndpoints] = useState<WorkEndpointMap>({});
  const [detailRequest, setDetailRequest] = useState<GraphDetailRequest | null>(null);

  useEffect(() => {
    if (synapses.length === 0) {
      setWorkEndpoints({});
      return;
    }
    void fetch("/api/synapses")
      .then((r) => r.json())
      .then((j: { workEndpoints?: WorkEndpointMap }) => {
        setWorkEndpoints(j.workEndpoints ?? {});
      })
      .catch(() => setWorkEndpoints({}));
  }, [synapses]);

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

  /** プロフィール共有用の絶対URL（ヘッダのコピーボタン用） */
  const [profileShareUrl, setProfileShareUrl] = useState("");
  useEffect(() => {
    setProfileShareUrl(`${window.location.origin}/user/${userId}`);
  }, [userId]);

  const worksCount = useMemo(() => {
    const set = new Set<string>();
    for (const s of synapses) { set.add(s.source_url); set.add(s.target_url); }
    return set.size;
  }, [synapses]);

  // 削除：確認後に DELETE API → 成功でローカル state から除去
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const openWorkDetail = useCallback((url: string) => {
    handleFocusUrl(url);
    setListOpen(false);
    setDetailRequest({ url, nonce: Date.now() });
  }, [handleFocusUrl]);

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
    <div className="flex h-[100dvh] min-h-0 w-full flex-col bg-zinc-50">
      {/* シンプルなヘッダー */}
      <header className="shrink-0 border-b border-zinc-200/80 bg-white/95 px-3 py-3 backdrop-blur-sm sm:px-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 sm:gap-3">
          <Link href="/" className="flex shrink-0 flex-col leading-none">
            <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-500/80">Synapse</span>
            <span className="text-sm font-semibold text-zinc-900">Galaxy</span>
          </Link>
          <span className="hidden text-zinc-300 sm:inline">›</span>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 sm:h-9 sm:w-9 sm:text-sm">
              {(displayName ?? "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">{displayName ?? `User ${userId.slice(0, 8)}`}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-500 sm:text-[11px]">
                <span><span className="font-semibold text-zinc-700">{synapses.length}</span> シナプス</span>
                <span><span className="font-semibold text-zinc-700">{worksCount}</span> 作品</span>
                <span><span className="font-semibold text-rose-600">{totalLikes}</span> ♥</span>
              </div>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
            <CopyLinkButton
              textToCopy={profileShareUrl}
              idleLabel={isOwnPage ? "URLをコピー" : "URLをコピー"}
              aria-label="プロフィールページのURLをクリップボードにコピー"
              className="text-[11px] font-medium sm:text-xs"
            />
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 sm:text-xs"
            >
              {listOpen ? "宇宙を見る" : "一覧"}
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
                  <div className="mb-2 flex flex-wrap items-center gap-1 text-[12px] font-medium leading-snug">
                    <SynapseListWorkLink
                      url={s.source_url}
                      workMap={workEndpoints}
                      className="text-indigo-700"
                      onOpenDetail={openWorkDetail}
                    />
                    <span className="shrink-0 text-zinc-300" aria-hidden>→</span>
                    <SynapseListWorkLink
                      url={s.target_url}
                      workMap={workEndpoints}
                      className="text-violet-700"
                      onOpenDetail={openWorkDetail}
                    />
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
          <GraphView
            focusUrl={focusUrl}
            synapses={synapses}
            workMap={workEndpoints}
            onFocusUrl={handleFocusUrl}
            detailRequest={detailRequest}
            onDetailRequestHandled={() => setDetailRequest(null)}
          />
        )}
      </main>

      <footer className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-4 py-3">
        <SiteFooter className="justify-center" />
      </footer>
    </div>
  );
}

function SynapseListWorkLink({
  url,
  workMap,
  className,
  onOpenDetail,
}: {
  url: string;
  workMap: WorkEndpointMap;
  className: string;
  onOpenDetail: (url: string) => void;
}) {
  const norm = normalizeSynapseEndpoint(url);
  const workTitle = workMap[norm]?.title ?? null;
  const [label, setLabel] = useState<string | null>(
    workTitle ? endpointDisplayTitle(url, workMap) : null,
  );
  const [loading, setLoading] = useState(!workTitle);

  useEffect(() => {
    if (workTitle) {
      setLabel(endpointDisplayTitle(url, workMap));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/ogp?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j: { title?: string | null }) => {
        if (cancelled) return;
        setLabel(resolveContentDisplayTitle(j.title ?? null, url));
      })
      .catch(() => {
        if (!cancelled) setLabel(resolveContentDisplayTitle(null, url));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [url, workTitle, workMap]);

  const display = loading ? "読み込み中…" : (label ?? endpointDisplayTitle(url, workMap));

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(url)}
      className={`max-w-[min(100%,14rem)] truncate text-left hover:underline ${className}`}
      title={display}
    >
      {display}
    </button>
  );
}
