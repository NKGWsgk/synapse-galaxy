"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/browser";
import { SITE_NAME_EN } from "@/lib/siteMetadata";

type Props = {
  user: User;
  onSet: (nickname: string) => void;
};

/** ニックネーム入力モーダル
 *  - 初回ログイン時（user_metadata.nickname が未設定）の場合に強制表示
 *  - 閉じるボタン無し（必須入力）
 *  - 保存後は親に通知して再描画
 */
export function NicknameModal({ user, onSet }: Props) {
  const initial =
    (user.user_metadata?.nickname as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "";
  const [value, setValue] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC キーで閉じない（強制入力なので）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setError("2文字以上で入力してください");
      return;
    }
    if (trimmed.length > 30) {
      setError("30文字以下にしてください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: { nickname: trimmed },
      });
      if (updateError) throw updateError;
      onSet(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-zinc-900/70 backdrop-blur-sm" />
      <motion.form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.25)]"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="px-6 py-7">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <svg className="h-7 w-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
            </svg>
          </div>
          <h2 className="mb-2 text-center text-base font-bold text-zinc-900">ニックネームを設定</h2>
          <p className="mb-5 text-center text-xs leading-relaxed text-zinc-500">
            {SITE_NAME_EN} 内で表示される名前を入力してください。<br />
            他のユーザーに見える名前です。
          </p>

          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder="例: SG-owner"
            maxLength={30}
            autoFocus
            disabled={submitting}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
          />
          {error ? (
            <p className="mt-2 text-xs text-rose-600">{error}</p>
          ) : (
            <p className="mt-2 text-[10px] text-zinc-400">2〜30文字</p>
          )}

          <button
            type="submit"
            disabled={submitting || value.trim().length < 2}
            className="mt-5 w-full rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600"
          >
            {submitting ? "保存中…" : "設定する"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
