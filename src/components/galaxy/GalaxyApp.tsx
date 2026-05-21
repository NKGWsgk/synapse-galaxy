"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
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
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import type { WorkEndpointMap } from "@/lib/workResolve";

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
    return v === "map" ? "map" : "feed";
  } catch { return "feed"; }
}
function saveMobileViewMode(mode: ViewMode) {
  try { localStorage.setItem(MOBILE_VIEW_KEY, mode); } catch { /* noop */ }
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [focusUrl, setFocusUrl] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [viewCount, setViewCount] = useState(0);
  const [userPostCount, setUserPostCount] = useState(0);
  const [gateOpen, setGateOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<ViewMode>("feed");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/synapses");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const list = data.synapses as SynapseRow[];
      setSynapses(list);
      setWorkEndpoints((data.workEndpoints as WorkEndpointMap | undefined) ?? {});
      setLoadError(null);
      setFocusUrl((prev) => prev ?? pickInitialFocusUrl(list));
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

  // ?focus=<url> でフォーカス URL を初期化（アフィリエイト tag は URL に載せない）
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const f = params.get("focus");
      if (!f) return;
      const publicUrl = normalizeSynapseEndpoint(f);
      setFocusUrl(publicUrl);
      if (publicUrl !== f) {
        params.set("focus", publicUrl);
        const next = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState(null, "", next);
      }
    } catch { /* noop */ }
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
        params.set("focus", publicUrl);
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
  }, [viewCount, user, userPostCount]);

  const handleSynapseCreated = useCallback((sourceUrl: string) => {
    const publicUrl = normalizeSynapseEndpoint(sourceUrl);
    setFocusUrl(publicUrl);
    setMobileNavOpen(false);
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        params.set("focus", publicUrl);
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      } catch { /* noop */ }
    }
    void refresh();
    if (user) setUserPostCount((prev) => prev + 1);
  }, [refresh, user]);

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
          <AnimatePresence mode="wait">
            {!synapsesLoaded ? (
              <div key="loading" className="flex h-full items-center justify-center text-sm text-zinc-400">読み込み中…</div>
            ) : focusUrl ? (
              <div key="graph" className="h-full w-full">
                <div className={mobileViewMode === "feed" ? "h-full" : "hidden"}>
                  <ScrollFeedView
                    focusUrl={focusUrl}
                    synapses={synapses}
                    workMap={workEndpoints}
                    onFocusUrl={handleFocusUrl}
                  />
                </div>
                <div className={mobileViewMode === "map" ? "h-full" : "hidden"}>
                  <GraphView
                    focusUrl={focusUrl}
                    synapses={synapses}
                    workMap={workEndpoints}
                    onFocusUrl={handleFocusUrl}
                    mobileMenuOpen={mobileNavOpen}
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
