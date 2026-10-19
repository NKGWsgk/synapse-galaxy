"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { SynapseRow } from "@/lib/supabase/clients";
import { AuthFeedbackProvider } from "./AuthFeedback";
import { GraphView } from "./GraphView";
import { ScrollFeedView } from "./ScrollFeedView";
import { Header } from "./Header";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";
import { NicknameModal } from "./NicknameModal";
import { createBrowserClient } from "@/lib/supabase/browser";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { findSynapseById } from "@/lib/synapseKeywordNote";
import { decodeFocusParam, syncFocusParamInSearchParams } from "@/lib/focusShareUrl";
import { isAcceptableShareSlug } from "@/lib/workShareSlug";
import { readSynapseIdFromLocation, writeSynapseIdToUrl } from "@/lib/synapseShareUrl";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import type { WorkEndpointMap } from "@/lib/workResolve";
import { CampaignPopup } from "./CampaignPopup";

function mostConnectedUrl(synapses: SynapseRow[]): string | null {
  const counts = new Map<string, number>();
  for (const s of synapses) {
    counts.set(s.source_url, (counts.get(s.source_url) ?? 0) + 1);
    counts.set(s.target_url, (counts.get(s.target_url) ?? 0) + 1);
  }
  let best: string | null = null, bestCount = 0;
  for (const [url, count] of counts) {
    if (count > bestCount) { best = url; bestCount = count; }
  }
  return best;
}

/** サンプルでは『プロジェクト・ヘイル・メアリー』をハブにしているため、存在すれば初期フォーカスに優先 */
const SAMPLE_HUB_ASIN = "4152100702";

function pickInitialFocusUrl(synapses: SynapseRow[]): string | null {
  for (const s of synapses) {
    if (s.source_url.includes(SAMPLE_HUB_ASIN)) return normalizeSynapseEndpoint(s.source_url);
    if (s.target_url.includes(SAMPLE_HUB_ASIN)) return normalizeSynapseEndpoint(s.target_url);
  }
  const best = mostConnectedUrl(synapses);
  return best ? normalizeSynapseEndpoint(best) : null;
}

const GATE_UNLOGGED = 8;
const GATE_LOGGED = 30;
const GATE_POST_COUNT = 5;

/** マップ（銀河グラフ）への表示閾値: 作品がこの数以上のシナプスに登場して初めてノード化する */
const MAP_MIN_CONNECTIONS = 1;
const STORAGE_KEY = "sgViewCount";
const MOBILE_VIEW_KEY = "sgMobileView";

function loadViewCount(): number {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10) || 0; }
  catch { return 0; }
}
function saveViewCount(n: number) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* noop */ }
}
function loadMobileViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(MOBILE_VIEW_KEY);
    if (v === "feed" || v === "map") return v;
    return "feed"; // モバイルは feed をデフォルトにしてチラつきを低減
  } catch { return "feed"; }
}
function saveMobileViewMode(mode: ViewMode) {
  try { localStorage.setItem(MOBILE_VIEW_KEY, mode); } catch { /* noop */ }
}

/** データ取得中 — 空白＋テキストではなく銀河の骨格を先に見せる */
function GalaxyLoadingShell() {
  const ringSizes = [140, 280, 420, 560];
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {ringSizes.map((size, i) => (
        <motion.div
          key={size}
          className="absolute rounded-full border border-indigo-200/35"
          style={{ width: size, height: size }}
          initial={{ opacity: 0.2, scale: 0.97 }}
          animate={{ opacity: [0.18, 0.42, 0.18], scale: [0.97, 1, 0.97] }}
          transition={{ duration: 2.2 + i * 0.35, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
        />
      ))}
      <motion.div
        className="relative z-10 flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_3px_12px_rgba(0,0,0,0.08)] ring-2 ring-indigo-300/50"
        style={{ width: 140, height: 110 }}
        animate={{ opacity: [0.72, 1, 0.72] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="min-h-0 flex-1 animate-pulse bg-zinc-100" />
        <div className="h-[2.875rem] shrink-0 animate-pulse bg-zinc-50" />
      </motion.div>
      <p className="absolute bottom-[18%] text-xs font-medium tracking-wide text-zinc-400/90">
        銀河を描画中…
      </p>
    </div>
  );
}

function EmptyGalaxy({ onOpenPost }: { onOpenPost: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
        <svg className="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-zinc-900">まだシナプスがありません</h2>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-zinc-500">
          最初の接続を繋いで、コンテンツの銀河をはじめましょう。
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenPost}
        className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        シナプスを繋ぐ
      </button>
    </div>
  );
}

function ViewGate({
  googleClientId,
  user,
  onOpenPost,
  onDismiss,
}: {
  googleClientId?: string | null;
  user: User | null;
  onOpenPost: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
      <motion.div
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.22)]"
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="px-6 py-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <svg className="h-7 w-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h2 className="mb-2 text-base font-bold text-zinc-900">続きを見るには…</h2>
          {!user ? (
            <>
              <p className="mb-5 text-sm leading-relaxed text-zinc-500">
                もっとシナプスを探索するには<br />Googleアカウントでログインしてください。
              </p>
              <GoogleSignInButton
                clientId={googleClientId}
                visualClassName="flex w-full items-center justify-center rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                loadingLabel="ログイン中…"
              />
            </>
          ) : (
            <>
              <p className="mb-5 text-sm leading-relaxed text-zinc-500">
                シナプスを<span className="font-semibold text-indigo-700">{GATE_POST_COUNT}件投稿</span>すると<br />無制限に閲覧できるようになります。
              </p>
              <button type="button" onClick={() => { onOpenPost(); onDismiss(); }} className="w-full rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500">
                シナプスを繋ぐ
              </button>
            </>
          )}
          <button type="button" onClick={onDismiss} className="mt-2 w-full rounded-full py-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-600">
            あとで
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function GalaxyApp({ googleClientId }: { googleClientId?: string | null }) {
  const [synapses, setSynapses] = useState<SynapseRow[]>([]);
  const [workEndpoints, setWorkEndpoints] = useState<WorkEndpointMap>({});
  const [synapsesLoaded, setSynapsesLoaded] = useState(false);
  const [initialLayout, setInitialLayout] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusUrl, setFocusUrl] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [viewCount, setViewCount] = useState(0);
  const [userPostCount, setUserPostCount] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<ViewMode>("feed");
  const [isMdUp, setIsMdUp] = useState(false);
  const [synapseShareRequest, setSynapseShareRequest] = useState<{ id: string; nonce: number } | null>(null);
  const shareSlugFetchStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsMdUp(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const refresh = useCallback(async () => {
    shareSlugFetchStartedRef.current.clear();
    try {
      const res = await fetch("/api/synapses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const list = data.synapses as SynapseRow[];
      const endpoints = (data.workEndpoints as WorkEndpointMap | undefined) ?? {};
      const rawPositions = data.layoutPositions as Array<{ norm: string; x: number; y: number }> | null | undefined;
      if (rawPositions && rawPositions.length > 0) {
        setInitialLayout(new Map(rawPositions.map(({ norm, x, y }) => [norm, { x, y }])));
      }
      setSynapses(list);
      setWorkEndpoints(endpoints);
      setLoadError(null);
      const sharedSynapseId = readSynapseIdFromLocation();
      const sharedSynapse = sharedSynapseId ? findSynapseById(sharedSynapseId, list) : null;
      const focusFromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("focus")
          : null;

      if (sharedSynapse) {
        const publicUrl = normalizeSynapseEndpoint(sharedSynapse.source_url);
        setFocusUrl(publicUrl);
        if (typeof window !== "undefined") {
          try {
            const params = new URLSearchParams(window.location.search);
            syncFocusParamInSearchParams(params, publicUrl, endpoints);
            window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
          } catch { /* noop */ }
        }
      } else if (sharedSynapseId) {
        writeSynapseIdToUrl(null);
        setFocusUrl((prev) => prev ?? (focusFromUrl ? decodeFocusParam(focusFromUrl, endpoints) : null) ?? pickInitialFocusUrl(list));
      } else if (focusFromUrl) {
        setFocusUrl(decodeFocusParam(focusFromUrl, endpoints));
        if (typeof window !== "undefined") {
          try {
            const params = new URLSearchParams(window.location.search);
            if (syncFocusParamInSearchParams(params, decodeFocusParam(focusFromUrl, endpoints), endpoints)) {
              window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
            }
          } catch { /* noop */ }
        }
      } else {
        setFocusUrl((prev) => prev ?? pickInitialFocusUrl(list));
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSynapsesLoaded(true);
    }
  }, []);

  const scrollToPostPanel = useCallback(() => {
    setMobileNavOpen(true);
    if (typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        document.querySelector("[data-sg-sidebar]")?.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setViewCount(loadViewCount()); }, []);
  useEffect(() => { setMobileViewMode(loadMobileViewMode()); }, []);

  const setViewMode = useCallback((next: ViewMode) => {
    setMobileViewMode(next);
    saveMobileViewMode(next);
  }, []);

  // ?synapse=<uuid> を復元。?focus= は synapses 取得後に workMap 付きで解決する
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const synapseId = readSynapseIdFromLocation();
      if (synapseId) {
        setSynapseShareRequest({ id: synapseId, nonce: Date.now() });
      }
    } catch { /* noop */ }
  }, []);

  const handleSynapseShareChange = useCallback((id: string | null) => {
    writeSynapseIdToUrl(id);
  }, []);

  const handleSynapseShareRequestHandled = useCallback(() => {
    setSynapseShareRequest(null);
  }, []);

  useEffect(() => {
    if (!user) { setUserPostCount(0); return; }
    const supabase = createBrowserClient();
    void supabase.from("synapses").select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setUserPostCount(count ?? 0));
  }, [user]);

  const handleFocusUrl = useCallback((url: string) => {
    const publicUrl = normalizeSynapseEndpoint(url);
    setFocusUrl(publicUrl);
    setMobileNavOpen(false);
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        syncFocusParamInSearchParams(params, publicUrl, workEndpoints);
        params.delete("synapse");
        const next = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState(null, "", next);
      } catch { /* noop */ }
    }
    if (userPostCount >= GATE_POST_COUNT) return;
    const limit = user ? GATE_LOGGED : GATE_UNLOGGED;
    const next = viewCount + 1;
    setViewCount(next);
    saveViewCount(next);
    if (next > limit) setGateOpen(true);
  }, [viewCount, user, userPostCount, workEndpoints]);

  const handleSynapseCreated = useCallback((sourceUrl: string) => {
    const publicUrl = normalizeSynapseEndpoint(sourceUrl);
    setFocusUrl(publicUrl);
    setMobileNavOpen(false);
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        syncFocusParamInSearchParams(params, publicUrl, workEndpoints);
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      } catch { /* noop */ }
    }
    void refresh();
    if (user) setUserPostCount((prev) => prev + 1);
  }, [refresh, user, workEndpoints]);

  /** マップ表示用フィルタ済みシナプス: 両端が MAP_MIN_CONNECTIONS 以上の接続を持つもののみ */
  const graphSynapses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of synapses) {
      const src = normalizeSynapseEndpoint(s.source_url);
      const tgt = normalizeSynapseEndpoint(s.target_url);
      counts.set(src, (counts.get(src) ?? 0) + 1);
      counts.set(tgt, (counts.get(tgt) ?? 0) + 1);
    }
    return synapses.filter((s) => {
      const src = normalizeSynapseEndpoint(s.source_url);
      const tgt = normalizeSynapseEndpoint(s.target_url);
      return (
        (counts.get(src) ?? 0) >= MAP_MIN_CONNECTIONS &&
        (counts.get(tgt) ?? 0) >= MAP_MIN_CONNECTIONS
      );
    });
  }, [synapses]);

  const feedViewActive = mobileViewMode === "feed";

  useEffect(() => {
    if (!focusUrl || !synapsesLoaded || typeof window === "undefined") return;
    if (Object.keys(workEndpoints).length === 0) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (syncFocusParamInSearchParams(params, focusUrl, workEndpoints)) {
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
    } catch { /* noop */ }
  }, [focusUrl, workEndpoints, synapsesLoaded]);

  // share_slug 未生成の作品は全件 API で Gemini 生成 → ?focus= を英語スラッグに統一
  useEffect(() => {
    if (!synapsesLoaded) return;

    const pending = Object.entries(workEndpoints).filter(([norm, info]) => {
      if (info.shareSlug && isAcceptableShareSlug(info.shareSlug)) return false;
      return !shareSlugFetchStartedRef.current.has(norm);
    });
    if (pending.length === 0) return;

    let cancelled = false;
    for (const [norm] of pending) shareSlugFetchStartedRef.current.add(norm);

    void (async () => {
      const CONCURRENCY = 4;
      const urls = pending.map(([, info]) => info.representativeUrl);
      for (let i = 0; i < urls.length; i += CONCURRENCY) {
        if (cancelled) return;
        await Promise.all(
          urls.slice(i, i + CONCURRENCY).map(async (url) => {
            try {
              const r = await fetch(`/api/work/share-slug?url=${encodeURIComponent(url)}`, { cache: "no-store" });
              const j = (await r.json()) as { slug?: string | null };
              const norm = normalizeSynapseEndpoint(url);
              if (cancelled || !j.slug?.trim() || !isAcceptableShareSlug(j.slug.trim())) {
                shareSlugFetchStartedRef.current.delete(norm);
                return;
              }
              setWorkEndpoints((prev) => {
                const cur = prev[norm];
                if (!cur) return prev;
                return { ...prev, [norm]: { ...cur, shareSlug: j.slug!.trim() } };
              });
            } catch {
              shareSlugFetchStartedRef.current.delete(normalizeSynapseEndpoint(url));
            }
          }),
        );
      }
    })();

    return () => { cancelled = true; };
  }, [synapsesLoaded, workEndpoints]);

  return (
    <AuthFeedbackProvider>
      <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-zinc-50 text-zinc-900 md:flex-row">
        {/* モバイルトップバー */}
        <header className="relative flex shrink-0 items-center border-b border-zinc-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-sm md:hidden">
          <button
            type="button"
            aria-label="メニューを開く"
            onClick={() => setMobileNavOpen(true)}
            className="relative z-10 rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <a
            href="/"
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center leading-none no-underline"
          >
            <span className="text-[7px] font-semibold uppercase tracking-[0.25em] text-indigo-500/80">Synapse</span>
            <span className="text-sm font-semibold text-zinc-900">Galaxy</span>
          </a>
          <div className="relative z-10 ml-auto">
            <ViewModeToggle mode={mobileViewMode} onSelect={setViewMode} />
          </div>
        </header>

        <Header
          googleClientId={googleClientId}
          onFocusUrl={handleFocusUrl}
          onUser={setUser}
          user={user}
          onSynapseCreated={handleSynapseCreated}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
          viewMode={mobileViewMode}
          onViewModeChange={setViewMode}
          showViewModeToggle={!!focusUrl}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loadError ? (
          <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-1.5 text-xs text-rose-700">{loadError}</div>
        ) : null}

        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05),transparent_60%)]" />
          <CampaignPopup />
          <AnimatePresence mode="wait">
            {!synapsesLoaded ? (
              <div key="loading" className="h-full w-full">
                <GalaxyLoadingShell />
              </div>
            ) : focusUrl ? (
              <div key="graph" className="h-full w-full">
                <div className={mobileViewMode === "feed" ? "h-full" : "hidden"}>
                  <ScrollFeedView
                    focusUrl={focusUrl}
                    synapses={synapses}
                    workMap={workEndpoints}
                    onFocusUrl={handleFocusUrl}
                    synapseShareRequest={feedViewActive ? synapseShareRequest : null}
                    onSynapseShareRequestHandled={handleSynapseShareRequestHandled}
                    onSynapseShareChange={handleSynapseShareChange}
                  />
                </div>
                <div className={mobileViewMode === "map" ? "h-full" : "hidden"}>
                  <GraphView
                    key={
                      isMdUp
                        ? mobileViewMode === "map"
                          ? "desktop-graph"
                          : "desktop-graph-hidden"
                        : mobileViewMode === "map"
                          ? "mobile-graph"
                          : "mobile-graph-hidden"
                    }
                    focusUrl={focusUrl}
                    synapses={graphSynapses}
                    workMap={workEndpoints}
                    initialLayout={initialLayout}
                    onFocusUrl={handleFocusUrl}
                    mobileMenuOpen={mobileNavOpen}
                    synapseShareRequest={feedViewActive ? null : synapseShareRequest}
                    onSynapseShareRequestHandled={handleSynapseShareRequestHandled}
                    onSynapseShareChange={handleSynapseShareChange}
                  />
                </div>
              </div>
            ) : (
              <div key="empty" className="h-full w-full">
                <EmptyGalaxy onOpenPost={scrollToPostPanel} />
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* 閲覧ゲート */}
        <AnimatePresence>
          {gateOpen ? (
            <ViewGate
              key="view-gate"
              googleClientId={googleClientId}
              user={user}
              onOpenPost={() => {
                setGateOpen(false);
                scrollToPostPanel();
              }}
              onDismiss={() => {
                setGateOpen(false);
                const next = user ? GATE_LOGGED - 5 : GATE_UNLOGGED - 3;
                setViewCount(Math.max(0, next));
                saveViewCount(Math.max(0, next));
              }}
            />
          ) : null}
        </AnimatePresence>

        {/* ニックネーム入力モーダル (初回ログイン時のみ・必須入力) */}
        <AnimatePresence>
          {user && !user.user_metadata?.nickname ? (
            <NicknameModal
              key="nickname-modal"
              user={user}
              onSet={(nickname) => {
                setUser((prev) => prev ? ({ ...prev, user_metadata: { ...prev.user_metadata, nickname } }) : prev);
              }}
            />
          ) : null}
        </AnimatePresence>
        </div>
      </div>
    </AuthFeedbackProvider>
  );
}
