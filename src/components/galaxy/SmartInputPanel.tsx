"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { formatWorkDisplayTitle, getOgpImageDisplaySrc } from "@/lib/ogpDisplay";
import { ogpImageLayout } from "@/lib/ogpImagePresentation";
import { createBrowserClient } from "@/lib/supabase/browser";

type OgpPreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

const ogpPreviewCache = new Map<string, OgpPreview>();

function isValidUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

function OgpPreviewCard({ url, label }: { url: string; label: string }) {
  const [data, setData] = useState<OgpPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = url.trim();
    if (!u) { setData(null); setLoading(false); setError(null); return; }
    if (!isValidUrl(u)) { setData(null); setLoading(false); setError("URL形式が正しくないかも"); return; }

    const hit = ogpPreviewCache.get(u);
    if (hit) { setData(hit); setLoading(false); setError(null); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setImgError(false);

    const t = setTimeout(() => {
      void fetch(`/api/ogp?url=${encodeURIComponent(u)}`)
        .then((r) => r.json())
        .then((j: OgpPreview & { error?: string }) => {
          if (cancelled) return;
          if (j.error) { setError(j.error); setData(null); return; }
          const packed: OgpPreview = { title: j.title ?? null, description: j.description ?? null, imageUrl: j.imageUrl ?? null, siteName: j.siteName ?? null };
          ogpPreviewCache.set(u, packed);
          setData(packed);
        })
        .catch(() => { if (!cancelled) setError("OGP取得に失敗"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 450);

    return () => { cancelled = true; clearTimeout(t); };
  }, [url]);

  if (!url.trim()) return null;

  const title = formatWorkDisplayTitle(data?.title ?? null, url) ?? data?.title?.trim() ?? null;
  const desc = data?.description?.trim() || null;
  const thumbLayout = ogpImageLayout(url, "inlineThumb");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
        {loading ? <span className="text-[10px] text-zinc-400">取得中…</span> : null}
      </div>
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : (
        <div className="flex min-w-0 items-start gap-2">
          <div className={thumbLayout.outer}>
            {data?.imageUrl && !imgError ? (
              thumbLayout.mode === "video" ? (
                <div className={thumbLayout.inner}>
                  <img
                    src={getOgpImageDisplaySrc(data.imageUrl, url)}
                    alt=""
                    className={thumbLayout.img}
                    loading="lazy"
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : (
                <img
                  src={getOgpImageDisplaySrc(data.imageUrl, url)}
                  alt=""
                  className={thumbLayout.img}
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              )
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            {data?.siteName ? <p className="text-[10px] font-medium text-indigo-600">{data.siteName}</p> : null}
            <p className="line-clamp-2 text-xs font-semibold text-zinc-900">{title ?? "（タイトル取得なし）"}</p>
            {desc ? <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{desc}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

const TITLE_MAX = 30;

export function SmartInputPanel({ user, onCreated }: { user: User | null; onCreated: () => void }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleSubmitClick(e: FormEvent) {
    e.preventDefault();
    // Form's native required + this submit handler ensures all fields are filled
    setMessage(null);
    setConfirmOpen(true);
  }

  async function confirmAndSubmit() {
    setLoading(true);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      const res = await fetch("/api/synapse/smart-input", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ sourceUrl, targetUrl, title: title.trim(), description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "保存に失敗しました");
        setConfirmOpen(false);
        return;
      }
      setMessage("シナプスを繋ぎました！");
      setSourceUrl("");
      setTargetUrl("");
      setTitle("");
      setDescription("");
      setConfirmOpen(false);
      setTimeout(onCreated, 800);
    } catch {
      setMessage("通信エラー");
      setConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmitClick} className="space-y-2">
      {!user ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          投稿にはGoogleログインが必要です
        </p>
      ) : null}

      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="block text-[11px] font-medium text-zinc-600">
          出発作品
          <input
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            required
          />
        </label>
        <label className="block text-[11px] font-medium text-zinc-600">
          着地作品
          <input
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://..."
            required
          />
        </label>
      </div>

      {(sourceUrl.trim() || targetUrl.trim()) ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div>{sourceUrl.trim() ? <OgpPreviewCard url={sourceUrl} label="出発作品" /> : null}</div>
          <div>{targetUrl.trim() ? <OgpPreviewCard url={targetUrl} label="着地作品" /> : null}</div>
        </div>
      ) : null}

      <div>
        <label className="block text-[11px] font-medium text-zinc-600">
          接続タイトル
          <input
            className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            placeholder="例: 科学データの送信、言語と沈黙…"
            required
            maxLength={TITLE_MAX}
          />
        </label>
        <p className={`text-right text-[10px] tabular-nums ${title.length >= TITLE_MAX ? "text-rose-400" : "text-zinc-400"}`}>
          {title.length} / {TITLE_MAX}
        </p>
      </div>

      <label className="block text-[11px] font-medium text-zinc-600">
        接続理由
        <textarea
          className="mt-0.5 min-h-[56px] w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="なぜこの2作品は繋がるのか…"
          required
        />
      </label>

      <button
        type="submit"
        disabled={loading || !user}
        className="w-full rounded-full bg-indigo-600 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "保存中…" : "シナプスを繋ぐ"}
      </button>

      {message ? (
        <p className={`text-xs ${message.includes("！") ? "text-emerald-600" : "text-zinc-600"}`}>
          {message}
        </p>
      ) : null}

      {/* 確定確認モーダル */}
      <AnimatePresence>
        {confirmOpen ? (
          <motion.div
            className="fixed inset-0 z-[250] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              aria-label="閉じる"
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
              onClick={() => !loading && setConfirmOpen(false)}
            />
            <motion.div
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.22)]"
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3.5">
                <h3 className="text-sm font-bold text-zinc-900">この内容で繋ぎますか？</h3>
                <button
                  type="button"
                  onClick={() => !loading && setConfirmOpen(false)}
                  disabled={loading}
                  className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
                >
                  戻る
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-3">
                {/* 警告 */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  <p className="font-semibold">⚠ 確定後は内容を変更できません</p>
                </div>

                {/* OGP プレビュー */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <OgpPreviewCard url={sourceUrl} label="出発作品" />
                  <OgpPreviewCard url={targetUrl} label="着地作品" />
                </div>

                {/* 接続タイトル */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">接続タイトル</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900">{title.trim() || "（未入力）"}</p>
                </div>

                {/* 接続理由 */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">接続理由</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{description.trim() || "（未入力）"}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={loading}
                  className="rounded-full px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50"
                >
                  戻って修正
                </button>
                <button
                  type="button"
                  onClick={confirmAndSubmit}
                  disabled={loading}
                  className="rounded-full bg-indigo-600 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loading ? "保存中…" : "確定して繋ぐ"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
}
