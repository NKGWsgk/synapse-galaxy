"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "campaign-award-2026-dismissed";

export function CampaignPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* ignore */ }
    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 w-[260px]">
      <div className="pointer-events-auto relative overflow-hidden rounded-2xl border border-indigo-500/40 bg-zinc-900/95 shadow-2xl shadow-purple-900/40 backdrop-blur-md">
        {/* glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(139,92,246,0.2),transparent_70%)]" />

        {/* dismiss */}
        <button
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1 text-zinc-500 transition hover:text-zinc-300"
          aria-label="閉じる"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="relative px-4 pb-4 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400">
            Open Campaign
          </p>
          <p className="mt-1 text-sm font-bold leading-snug text-white">
            🏆 「いいね！」アワード
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            11/11〜25 ・ 上位3名にAmazonギフトカード
          </p>
          <Link
            href="/news/like-award"
            onClick={dismiss}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2 text-xs font-bold text-white transition hover:from-indigo-500 hover:to-purple-500"
          >
            詳しく見る →
          </Link>
        </div>
      </div>
    </div>
  );
}
