"use client";

import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useState } from "react";
import { isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import {
  contentPlatformDisplayName,
  detectContentPlatform,
  isMusicContentPlatform,
  type AllowedSynapsePlatform,
  type ContentPlatformId,
} from "@/lib/contentPlatform";
import type { SynapseRow } from "@/lib/supabase/clients";
import { endpointDisplayUrl, endpointWorkKey, type WorkEndpointMap } from "@/lib/workEndpoint";
import { withSynapseAffiliate } from "@/lib/synapseAffiliate";
import { createBrowserClient } from "@/lib/supabase/browser";
import {
  ConnectionWorksLine,
  LikeButton,
  OgpTileMedia,
  ogpMiniCache,
} from "./FocusCompass";

export type GraphDetailRequest = { url: string; nonce: number };

export type KeywordNotePayload = {
  keyword: string;
  description: string;
  sourceUrl: string;
  targetUrl: string;
  synapse?: SynapseRow;
  synapses?: SynapseRow[];
  currentIndex?: number;
};

export type FocusDetailController = {
  openDetail: (url: string) => void;
  openKeywordNote: (payload: KeywordNotePayload) => void;
};

type Props = {
  focusUrl: string;
  synapses: SynapseRow[];
  workMap: WorkEndpointMap;
  onFocusUrl: (url: string) => void;
  detailRequest?: GraphDetailRequest | null;
  onDetailRequestHandled?: () => void;
  /** false = キーワードモーダルのみ（フィードのインライン詳細用） */
  detailModalEnabled?: boolean;
};

function pickEdgeKeyword(s: SynapseRow): string | null {
  const k = s.keywords?.find((x) => x && x.trim());
  return k ? k.trim() : null;
}

function relatedSynapseKeywordLine(raw: string): string {
  return raw.normalize("NFC").replace(/\r/g, "").replace(/\n/g, "").replace(/\u200b/g, "");
}

function PosterLink({ userId }: { userId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/user/${userId}`)
      .then((r) => r.json())
      .then((j: { displayName?: string }) => { if (!cancelled) setName(j.displayName ?? null); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [userId]);
  return (
    <span className="text-[11px] font-medium text-zinc-500">
      投稿者:{" "}
      <a href={`/user/${userId}`} className="text-indigo-600 transition hover:text-indigo-800 hover:underline">
        {name ?? "…"}
      </a>
    </span>
  );
}

function RelatedSynapseRow({
  synapse,
  direction,
  focusKey,
  workMap,
  accessToken,
  onClickOther,
}: {
  synapse: SynapseRow;
  direction: "outgoing" | "incoming";
  focusKey: string;
  workMap: WorkEndpointMap;
  accessToken: string | null;
  onClickOther: (url: string) => void;
}) {
  const otherUrl = direction === "outgoing" ? synapse.target_url : synapse.source_url;
  const [otherTitle, setOtherTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/ogp?url=${encodeURIComponent(otherUrl)}`)
      .then((r) => r.json())
      .then((j: { title?: string | null }) => {
        if (!cancelled) setOtherTitle(resolveContentDisplayTitle(j.title ?? null, otherUrl));
      })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [otherUrl]);

  const rawOtherTitle = otherTitle ?? otherUrl;
  const firstKeyword = synapse.keywords?.find((k) => k && k.trim())?.trim();

  const thisWorkPill = (
    <span className="inline-flex h-10 shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-lg bg-indigo-50 px-3 text-[11px] font-bold text-indigo-800 ring-1 ring-inset ring-indigo-200 sm:h-11 sm:min-w-[4rem]">
      本作
    </span>
  );
  const otherWorkChip = (
    <button
      type="button"
      onClick={() => onClickOther(otherUrl)}
      className="flex min-h-[2.875rem] min-w-0 w-full flex-col justify-center rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-zinc-700 ring-1 ring-inset ring-zinc-200 transition hover:bg-zinc-50 hover:text-zinc-900 hover:ring-zinc-300 sm:min-h-11"
      title={rawOtherTitle}
    >
      <span className="line-clamp-2 w-full break-words text-center sm:text-left">{rawOtherTitle}</span>
    </button>
  );
  const arrow = <span className="shrink-0 text-base font-semibold text-zinc-300" aria-hidden>→</span>;

  return (
    <li className="rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5">
      <div className="mb-2 grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-x-2">
        {direction === "outgoing" ? (
          <>{thisWorkPill}<div className="flex shrink-0 items-center justify-center">{arrow}</div>{otherWorkChip}</>
        ) : (
          <>{otherWorkChip}<div className="flex shrink-0 items-center justify-center">{arrow}</div>{thisWorkPill}</>
        )}
      </div>
      {firstKeyword ? (
        <p className="mb-1.5 whitespace-nowrap text-[13px] font-bold leading-snug text-indigo-700">
          {relatedSynapseKeywordLine(firstKeyword)}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-500">{synapse.description.trim() || "—"}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        {synapse.user_id ? <PosterLink userId={synapse.user_id} /> : <span />}
        <LikeButton synapse={synapse} accessToken={accessToken} />
      </div>
      <span hidden>{endpointWorkKey(otherUrl, workMap)}{focusKey ? "" : ""}</span>
    </li>
  );
}

export const FocusDetailModals = forwardRef<FocusDetailController, Props>(function FocusDetailModals(
  { focusUrl, synapses, workMap, onFocusUrl, detailRequest, onDetailRequestHandled, detailModalEnabled = true },
  ref,
) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUrl, setDetailUrl] = useState(focusUrl);
  const [keywordNote, setKeywordNote] = useState<KeywordNotePayload | null>(null);
  const [detailOgp, setDetailOgp] = useState<{ title: string | null; imageUrl: string | null; description: string | null; siteName: string | null } | null>(null);
  const [detailOgpLoading, setDetailOgpLoading] = useState(false);
  const [detailImgError, setDetailImgError] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const openDetail = useCallback((url: string) => {
    if (!detailModalEnabled) return;
    setDetailOgpLoading(true);
    setDetailUrl(url);
    setDetailOpen(true);
  }, [detailModalEnabled]);

  const openKeywordNote = useCallback((payload: KeywordNotePayload) => {
    setKeywordNote(payload);
  }, []);

  useImperativeHandle(ref, () => ({ openDetail, openKeywordNote }), [openDetail, openKeywordNote]);

  useEffect(() => {
    if (!detailOpen) setDetailUrl(focusUrl);
  }, [focusUrl, detailOpen]);

  useEffect(() => {
    if (!detailModalEnabled || !detailRequest) return;
    openDetail(endpointDisplayUrl(detailRequest.url, workMap));
    onDetailRequestHandled?.();
  }, [detailModalEnabled, detailRequest?.nonce, detailRequest, workMap, onDetailRequestHandled, openDetail]);

  useLayoutEffect(() => {
    if (!detailOpen) return;
    let cancelled = false;
    setDescExpanded(false);
    setDetailImgError(false);
    setDetailOgpLoading(true);
    const cached = ogpMiniCache.get(detailUrl);
    if (cached?.title || cached?.imageUrl) {
      setDetailOgp({ title: cached.title, imageUrl: cached.imageUrl, description: null, siteName: null });
    } else {
      setDetailOgp(null);
    }
    async function load(refresh: boolean) {
      const qs = new URLSearchParams({ url: detailUrl });
      if (refresh) qs.set("refresh", "1");
      const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
      const data = (await r.json()) as { error?: string; title?: string | null; imageUrl?: string | null; description?: string | null; siteName?: string | null };
      if (cancelled) return;
      if (data.error) { setDetailOgp(null); return; }
      setDetailOgp({ title: data.title ?? null, imageUrl: data.imageUrl ?? null, description: data.description ?? null, siteName: data.siteName ?? null });
      const label = resolveContentDisplayTitle(data.title ?? null, detailUrl);
      if (!refresh && (isWeakContentTitleLabel(label, detailUrl) || !(data.imageUrl ?? "").trim())) {
        await load(true);
      }
    }
    void load(false).catch(() => { if (!cancelled) setDetailOgp(null); })
      .finally(() => { if (!cancelled) setDetailOgpLoading(false); });
    return () => { cancelled = true; };
  }, [detailOpen, detailUrl]);

  useEffect(() => {
    if (!detailOpen && !keywordNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (keywordNote) setKeywordNote(null);
      else setDetailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, keywordNote]);

  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const detailFocusKey = useMemo(() => endpointWorkKey(detailUrl, workMap), [detailUrl, workMap]);
  const outgoingSynapses = useMemo(
    () => synapses.filter((s) => endpointWorkKey(s.source_url, workMap) === detailFocusKey),
    [synapses, detailFocusKey, workMap],
  );
  const incomingSynapses = useMemo(
    () => synapses.filter((s) => endpointWorkKey(s.target_url, workMap) === detailFocusKey),
    [synapses, detailFocusKey, workMap],
  );
  const detailDisplayTitle = resolveContentDisplayTitle(detailOgp?.title ?? null, detailUrl);

  const handleClickOther = useCallback((url: string) => {
    onFocusUrl(url);
    if (!detailModalEnabled) return;
    window.setTimeout(() => openDetail(url), 180);
  }, [onFocusUrl, openDetail, detailModalEnabled]);

  return (
    <>
      <AnimatePresence>
        {detailModalEnabled && detailOpen ? (
          <motion.div key="focus-detail-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <button type="button" aria-label="閉じる" className="absolute inset-0 bg-zinc-900/45 backdrop-blur-[2px]" onClick={() => setDetailOpen(false)} />
            <motion.div
              role="dialog" aria-modal="true" aria-labelledby="focus-detail-title"
              className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
              initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">フォーカス</span>
                <button type="button" onClick={() => setDetailOpen(false)} className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900">閉じる</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {detailOgp?.imageUrl && !detailImgError ? (
                  <OgpTileMedia pageUrl={detailUrl} imageUrl={detailOgp.imageUrl} slot="modal" loading={false} eager onError={() => setDetailImgError(true)} />
                ) : null}
                <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                  <h2 id="focus-detail-title" className="text-base font-semibold leading-snug text-zinc-900 sm:text-lg">
                    {detailOgpLoading ? "読み込み中…" : detailDisplayTitle}
                  </h2>
                  {(() => {
                    const platform = detectContentPlatform(detailUrl);
                    const PLATFORM_BTN: Record<Exclude<ContentPlatformId, "other">, { cls: string }> = {
                      amazon: { cls: "bg-[#FF9900] text-white hover:brightness-95" },
                      youtube: { cls: "bg-[#FF0000] text-white hover:brightness-95" },
                      netflix: { cls: "bg-black text-[#E50914] hover:bg-zinc-900" },
                      disney: { cls: "bg-[#0063E5] text-white hover:brightness-95" },
                      prime: { cls: "bg-[#00A8E1] text-white hover:brightness-95" },
                      hulu: { cls: "bg-[#1CE783] text-zinc-900 hover:brightness-95" },
                      unext: { cls: "bg-[#0099FF] text-white hover:brightness-95" },
                      spotify: { cls: "bg-[#1DB954] text-white hover:brightness-95" },
                      apple_music: { cls: "bg-[#FA243C] text-white hover:brightness-95" },
                      youtube_music: { cls: "bg-[#FF0000] text-white hover:brightness-95" },
                    };
                    const meta = platform !== "other" ? PLATFORM_BTN[platform] : null;
                    const name = platform !== "other" ? contentPlatformDisplayName(platform as AllowedSynapsePlatform) : null;
                    const label = name
                      ? isMusicContentPlatform(platform) ? `${name}で聴く` : `${name}で作品をみる`
                      : "ページを開く";
                    const cls = meta ? meta.cls : "bg-indigo-600 text-white hover:bg-indigo-500";
                    return (
                      <a href={withSynapseAffiliate(detailUrl)} target="_blank" rel="noopener noreferrer" className={`inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${cls}`}>
                        {label} <span aria-hidden>↗</span>
                      </a>
                    );
                  })()}
                  <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">概要</h3>
                    {detailOgpLoading ? (
                      <p className="text-sm leading-relaxed text-zinc-400">読み込み中…</p>
                    ) : detailOgp?.description?.trim() ? (
                      <>
                        <div className={["relative overflow-hidden", descExpanded ? "" : "max-h-[5.5em]"].join(" ")}>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{detailOgp.description.trim()}</p>
                          {!descExpanded ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-50/95 to-transparent" /> : null}
                        </div>
                        <button type="button" onClick={() => setDescExpanded((v) => !v)} className="mt-1.5 text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-700">
                          {descExpanded ? "閉じる" : "もっと読む"}
                        </button>
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed text-zinc-500">概要テキストを取得できませんでした。</p>
                    )}
                  </section>
                  {outgoingSynapses.length + incomingSynapses.length > 0 ? (
                    <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                      <ul className="space-y-3">
                        {outgoingSynapses.length > 0 ? (
                          <>
                            <li className="text-[10px] font-semibold tracking-[0.05em] text-indigo-500">関連シナプス：出発</li>
                            {outgoingSynapses.map((s) => (
                              <RelatedSynapseRow key={s.id} synapse={s} direction="outgoing" focusKey={detailFocusKey} workMap={workMap} accessToken={accessToken} onClickOther={handleClickOther} />
                            ))}
                          </>
                        ) : null}
                        {incomingSynapses.length > 0 ? (
                          <>
                            <li className={["text-[10px] font-semibold tracking-[0.05em] text-zinc-500", outgoingSynapses.length > 0 ? "mt-4 border-t border-zinc-200/70 pt-3" : ""].join(" ")}>関連シナプス：着地</li>
                            {incomingSynapses.map((s) => (
                              <RelatedSynapseRow key={s.id} synapse={s} direction="incoming" focusKey={detailFocusKey} workMap={workMap} accessToken={accessToken} onClickOther={handleClickOther} />
                            ))}
                          </>
                        ) : null}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {keywordNote ? (
          <motion.div key="keyword-note-overlay" className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <button type="button" aria-label="閉じる" className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px]" onClick={() => setKeywordNote(null)} />
            <motion.div
              role="dialog" aria-modal="true" aria-labelledby="keyword-note-title" aria-describedby="keyword-note-connection keyword-note-body"
              className="relative z-10 flex max-h-[min(85vh,620px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
              initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-end gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
                <span id="keyword-note-title" className="sr-only">シナプス詳細</span>
                <button type="button" onClick={() => setKeywordNote(null)} className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900">閉じる</button>
              </div>
              <ConnectionWorksLine
                sourceUrl={keywordNote.sourceUrl}
                targetUrl={keywordNote.targetUrl}
                focusUrl={focusUrl}
                onClickWork={(url) => {
                  setKeywordNote(null);
                  onFocusUrl(url);
                  if (detailModalEnabled) {
                    window.setTimeout(() => openDetail(url), 180);
                  }
                }}
              />
              <div id="keyword-note-body" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                <h2 className="text-sm font-semibold leading-snug text-indigo-900 sm:text-base">{keywordNote.keyword}</h2>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-3 sm:px-3.5 sm:py-3.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">接続理由</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{keywordNote.description.trim() || "（本文なし）"}</p>
                </div>
                {keywordNote.synapse ? (
                  <div className="flex items-center justify-between gap-2">
                    {keywordNote.synapse.user_id ? <PosterLink userId={keywordNote.synapse.user_id} /> : <span />}
                    <LikeButton synapse={keywordNote.synapse} accessToken={accessToken} />
                  </div>
                ) : null}
                {keywordNote.synapses && keywordNote.synapses.length > 1 ? (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const arr = keywordNote.synapses!;
                        const cur = keywordNote.currentIndex ?? 0;
                        const next = (cur - 1 + arr.length) % arr.length;
                        const s = arr[next];
                        setKeywordNote({
                          ...keywordNote,
                          synapse: s,
                          keyword: pickEdgeKeyword(s) ?? keywordNote.keyword,
                          description: s.description,
                          currentIndex: next,
                        });
                      }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      ← 前
                    </button>
                    <span className="text-[10px] font-medium tabular-nums text-zinc-500">
                      {(keywordNote.currentIndex ?? 0) + 1} / {keywordNote.synapses.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const arr = keywordNote.synapses!;
                        const cur = keywordNote.currentIndex ?? 0;
                        const next = (cur + 1) % arr.length;
                        const s = arr[next];
                        setKeywordNote({
                          ...keywordNote,
                          synapse: s,
                          keyword: pickEdgeKeyword(s) ?? keywordNote.keyword,
                          description: s.description,
                          currentIndex: next,
                        });
                      }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      次 →
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
});
