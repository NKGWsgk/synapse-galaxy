"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel } from "./AuthPanel";
import { useAuthFeedback } from "./AuthFeedback";
import { SiteFooter } from "./SiteFooter";
import { SmartInputPanel } from "./SmartInputPanel";
import { createBrowserClient } from "@/lib/supabase/browser";

type SearchResult = {
  url: string;
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

type Notification = {
  id: string;
  type: "liked" | "new_synapse";
  synapse_id: string | null;
  actor_id: string | null;
  read: boolean;
  created_at: string;
  focusUrl: string | null;
};

function isLikelyUrl(q: string): boolean {
  try {
    new URL(q);
    return true;
  } catch {
    return false;
  }
}

type RankingEntry = {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  totalLikes: number;
  postCount: number;
};

type Props = {
  onFocusUrl: (url: string) => void;
  onUser: (user: User | null) => void;
  user: User | null;
  onSynapseCreated: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

const SIDEBAR_W_KEY = "sg-sidebar-w";
const SIDEBAR_W_MIN = 240;
const SIDEBAR_W_MAX = 480;
const SIDEBAR_W_DEFAULT = 320;

export function Header({ onFocusUrl, onUser, user, onSynapseCreated, mobileOpen, onMobileOpenChange }: Props) {
  const { notifySessionExpired } = useAuthFeedback();
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_W_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(SIDEBAR_W_KEY));
      if (Number.isFinite(v) && v >= SIDEBAR_W_MIN && v <= SIDEBAR_W_MAX) setSidebarWidth(v);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth)); } catch { /* noop */ }
  }, [sidebarWidth]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(SIDEBAR_W_MAX, Math.max(SIDEBAR_W_MIN, ev.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      setResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const closeMobile = useCallback(() => onMobileOpenChange(false), [onMobileOpenChange]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
      if (!session) { setNotifications([]); setUnreadCount(0); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchNotifications = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        notifySessionExpired();
        return;
      }
      if (!res.ok) return;
      const j = (await res.json()) as { notifications: Notification[]; unreadCount: number };
      setNotifications(j.notifications);
      setUnreadCount(j.unreadCount);
    } catch { /* noop */ }
  }, [notifySessionExpired]);

  useEffect(() => {
    if (!accessToken) return;
    void fetchNotifications(accessToken);
    const id = setInterval(() => void fetchNotifications(accessToken), 60_000);
    return () => clearInterval(id);
  }, [accessToken, fetchNotifications]);

  const openNotifications = useCallback(async () => {
    setNotifOpen((v) => !v);
    if (!notifOpen && accessToken && unreadCount > 0) {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }, [notifOpen, accessToken, unreadCount]);

  // ランキングは常時表示なのでマウント時にロード
  useEffect(() => {
    let cancelled = false;
    setRankingLoading(true);
    void fetch("/api/ranking")
      .then((res) => res.json())
      .then((j: { ranking: RankingEntry[] }) => {
        if (cancelled) return;
        setRanking(j.ranking);
      })
      .catch(() => { /* noop */ })
      .finally(() => { if (!cancelled) setRankingLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults([]); setSearchOpen(false); return; }
    if (isLikelyUrl(q)) { setSearchResults([]); setSearchOpen(false); return; }

    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = (await res.json()) as { results: SearchResult[] };
        setSearchResults(j.results);
        setSearchOpen(true);
      } catch { /* noop */ } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = search.trim();
    if (!v) return;
    if (isLikelyUrl(v)) {
      onFocusUrl(v);
      setSearch("");
      setSearchOpen(false);
      closeMobile();
      return;
    }
    if (searchResults.length > 0) {
      pickResult(searchResults[0].url);
      return;
    }
    setSearchOpen(true);
  }

  function handleNotificationClick(n: Notification) {
    if (n.focusUrl) {
      onFocusUrl(n.focusUrl);
      setNotifOpen(false);
      closeMobile();
    }
  }

  function pickResult(url: string) {
    onFocusUrl(url);
    setSearch("");
    setSearchOpen(false);
    closeMobile();
  }

  function handleSynapseCreated() {
    onSynapseCreated();
    closeMobile();
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="メニューを閉じる"
          className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-[1px] md:hidden"
          onClick={closeMobile}
        />
      ) : null}

      <aside
        data-sg-sidebar
        style={{ "--sg-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
        className={[
          "fixed inset-y-0 left-0 z-50 flex h-full w-full shrink-0 flex-col gap-3 overflow-y-auto border-r border-zinc-200/80 bg-white/95 px-4 py-4 backdrop-blur-sm",
          "transition-transform duration-200 ease-out md:relative md:z-20 md:w-[var(--sg-sidebar-width)] md:translate-x-0 md:bg-white/90",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
      {/* リサイズハンドル（デスクトップのみ） */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="サイドバーの幅を調整"
        onMouseDown={startResize}
        className={[
          "group absolute right-0 top-0 z-30 hidden h-full w-1.5 cursor-col-resize select-none transition md:block",
          resizing ? "bg-indigo-300/60" : "bg-transparent hover:bg-indigo-200/60",
        ].join(" ")}
      >
        <div
          className={[
            "pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 transition",
            resizing ? "opacity-100" : "opacity-40 group-hover:opacity-100",
          ].join(" ")}
        >
          <span className={["block h-0.5 w-0.5 rounded-full transition", resizing ? "bg-indigo-500" : "bg-zinc-400 group-hover:bg-indigo-500"].join(" ")} />
          <span className={["block h-0.5 w-0.5 rounded-full transition", resizing ? "bg-indigo-500" : "bg-zinc-400 group-hover:bg-indigo-500"].join(" ")} />
          <span className={["block h-0.5 w-0.5 rounded-full transition", resizing ? "bg-indigo-500" : "bg-zinc-400 group-hover:bg-indigo-500"].join(" ")} />
        </div>
      </div>

      <div className="flex shrink-0 items-start justify-between gap-2">
        <a href="/" className="flex flex-col leading-none no-underline" onClick={closeMobile}>
          <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-indigo-500/80">Synapse</span>
          <span className="text-base font-semibold text-zinc-900">Galaxy</span>
        </a>
        <button
          type="button"
          aria-label="メニューを閉じる"
          onClick={closeMobile}
          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 検索バー */}
      <div ref={searchRef} className="relative">
        <form onSubmit={handleSearch}>
          <div className="relative w-full">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            {searchLoading ? (
              <div className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
            ) : null}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { if (search.trim() && !isLikelyUrl(search.trim())) setSearchOpen(true); }}
              placeholder="URLまたはタイトル…"
              className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {searchOpen && search.trim() && !isLikelyUrl(search.trim()) ? (
              <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
                {searchLoading ? (
                  <p className="px-3 py-3 text-center text-xs text-zinc-400">検索中…</p>
                ) : searchResults.length > 0 ? (
                  searchResults.map((r) => (
                    <button
                      key={r.url}
                      type="button"
                      onClick={() => pickResult(r.url)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-zinc-50"
                    >
                      {r.imageUrl ? (
                        <img src={r.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" loading="lazy" />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded-md bg-zinc-100" />
                      )}
                      <div className="min-w-0 flex-1">
                        {r.siteName ? <p className="text-[10px] font-medium text-indigo-600">{r.siteName}</p> : null}
                        <p className="truncate text-xs font-semibold text-zinc-900">{r.title ?? r.url}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-center text-xs text-zinc-400">
                    「{search.trim()}」に一致する作品が見つかりません
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </form>
      </div>

      {/* シナプス接続パネル（常時表示） */}
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">シナプスを繋ぐ</span>
        </div>
        <SmartInputPanel user={user} onCreated={handleSynapseCreated} />
      </section>

      {/* ランキング（常時表示） */}
      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-1.5 border-b border-zinc-100 px-3 py-2">
          <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">ランキング</span>
        </div>
        {rankingLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
          </div>
        ) : ranking.length === 0 ? (
          <p className="px-3 py-5 text-center text-xs text-zinc-400">まだランキングデータがありません</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {ranking.slice(0, 8).map((entry) => (
              <li key={entry.userId}>
                <a href={`/user/${entry.userId}`} className="flex items-center gap-2.5 px-3 py-2 transition hover:bg-zinc-50">
                  <span className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    entry.rank === 1 ? "bg-amber-100 text-amber-600" :
                    entry.rank === 2 ? "bg-zinc-200 text-zinc-600" :
                    entry.rank === 3 ? "bg-orange-100 text-orange-600" :
                    "bg-zinc-100 text-zinc-500",
                  ].join(" ")}>{entry.rank}</span>
                  {entry.avatar ? (
                    <img src={entry.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full border border-zinc-200 object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-600">
                      {entry.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-zinc-900">{entry.name}</p>
                    <p className="text-[10px] text-zinc-400">{entry.postCount}件 · ♥ {entry.totalLikes}</p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* スペーサー */}
      <div className="flex-1" />

      {/* 通知ベル */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => void openNotifications()}
          className="relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-50"
          aria-label="通知"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
          </svg>
          <span>通知</span>
          {unreadCount > 0 ? (
            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>

        {notifOpen ? (
          <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl md:bottom-0 md:left-full md:right-auto md:mb-0 md:ml-2 md:w-72">
            <div className="border-b border-zinc-100 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">通知</p>
            </div>
            {!accessToken ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">ログインすると通知が届きます</p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-400">通知はありません</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      disabled={!n.focusUrl}
                      className={[
                        "flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition",
                        n.read ? "text-zinc-500" : "bg-indigo-50/50 text-zinc-800",
                        n.focusUrl ? "hover:bg-zinc-50" : "cursor-default opacity-80",
                      ].join(" ")}
                    >
                      <span className="mt-0.5 shrink-0 text-base">{n.type === "liked" ? "♥" : "✦"}</span>
                      <span>{n.type === "liked" ? "あなたの接続がいいねされました" : "新しいシナプスが追加されました"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {/* ログイン / ユーザーアバター */}
      <AuthPanel onUser={onUser} />

      <SiteFooter className="shrink-0 border-t border-zinc-100 pt-3" onLinkClick={closeMobile} />
    </aside>
    </>
  );
}
