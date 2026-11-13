"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AWARD_EYEBROW, LIKE_AWARD, getAwardPhase } from "@/lib/campaign";

// 日程を組み直したので、前回の「閉じた」記録は引き継がない
const DISMISS_KEY = "campaign-award-2026-12-dismissed";

export function CampaignPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch { /* ignore */ }
    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 w-[240px]">
      <div className="pointer-events-auto relative overflow-hidden rounded-[4px] border-t-2 border-t-[#1A1B50] border-x border-b border-[#1A1B50]/12 bg-white shadow-xl shadow-[#1A1B50]/12">
        {/* dismiss */}
        <button
          onClick={dismiss}
          className="absolute right-2 top-2 p-1 text-zinc-400 transition hover:text-[#1A1B50]"
          aria-label="閉じる"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-4 pb-4 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#C026D3] shadow-[0_0_4px_#C026D3]" />
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#1A1B50]/60">
              {AWARD_EYEBROW[getAwardPhase()]}
            </p>
          </div>
          <p className="mt-1.5 text-[13px] font-bold leading-snug text-[#1A1B50]">
            「いいね！」アワード
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {LIKE_AWARD.entry.short} · Amazonギフトカード最大3,000円
          </p>
          <Link
            href="/news/like-award"
            onClick={dismiss}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-[4px] bg-[#1A1B50] py-2 text-[11px] font-bold text-white transition hover:bg-[#2D2F7A]"
          >
            詳しく見る →
          </Link>
        </div>
      </div>
    </div>
  );
}
