"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import {
  ALLOWED_SYNAPSE_ALERT_MESSAGE,
  ALLOWED_SYNAPSE_URL_MESSAGE,
  isAllowedSynapseUrl,
  synapseUrlFieldError,
} from "@/lib/contentPlatform";
import { SYNAPSE_EDGE_REASON_MAX_CHARS, SYNAPSE_EDGE_TITLE_MAX_CHARS } from "@/lib/synapseLimits";
import { formatWorkDisplayTitle, getOgpImageDisplaySrc } from "@/lib/ogpDisplay";
import { ogpImageLayout } from "@/lib/ogpImagePresentation";
import {
  clearSmartInputDraft,
  hasSmartInputDraftContent,
  loadSmartInputDraft,
  saveSmartInputDraft,
} from "@/lib/smartInputDraft";
import { createBrowserClient } from "@/lib/supabase/browser";
import { useAuthFeedback } from "./AuthFeedback";

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

function validateSynapseEndpointUrls(source: string, target: string): string | null {
  const srcErr = synapseUrlFieldError(source);
  if (srcErr) return `出発作品: ${srcErr}`;
  const tgtErr = synapseUrlFieldError(target);
  if (tgtErr) return `着地作品: ${tgtErr}`;
  return null;
}

function PlatformUrlAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] leading-snug text-rose-800"
    >
      {message}
    </p>
  );
}

function AllowedUrlHint() {
  return (
    <span className="group relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        aria-label="登録できる作品URLについて"
        className="inline-flex h-3.5 w-3.5 items-center justify-center text-zinc-400 transition hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+4px)] right-0 z-30 w-52 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-[10px] leading-snug text-zinc-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:w-56"
      >
        {ALLOWED_SYNAPSE_URL_MESSAGE}
      </span>
    </span>
  );
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
    if (!isAllowedSynapseUrl(u)) {
      setData(null);
      setLoading(false);
      setError(ALLOWED_SYNAPSE_ALERT_MESSAGE);
      return;
    }

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
  const thumbLayout = ogpImageLayout(url, "inlineThumb");

  return (
    <div className="min-w-0 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
        {loading ? <span className="text-[10px] text-zinc-400">取得中…</span> : null}
      </div>
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div
            className={
              thumbLayout.mode === "video"
                ? "relative aspect-video max-h-16 w-full shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950"
                : thumbLayout.outer
            }
          >
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
          <div className="min-w-0 flex-1 overflow-hidden">
            {data?.siteName ? <p className="truncate text-[10px] font-medium text-indigo-600">{data.siteName}</p> : null}
            <p className="truncate text-xs font-semibold leading-snug text-zinc-900">{title ?? "（タイトル取得なし）"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const TITLE_MAX = SYNAPSE_EDGE_TITLE_MAX_CHARS;
const REASON_MAX = SYNAPSE_EDGE_REASON_MAX_CHARS;
const DRAFT_SAVE_MS = 400;

export function SmartInputPanel({ user, onCreated }: { user: User | null; onCreated: () => void }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const { notifySessionExpired } = useAuthFeedback();
  const draftUserId = user?.id ?? null;
  const draftScopeRef = useRef(draftUserId);
  const draftHydratedRef = useRef(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const scope = draftUserId;
    draftScopeRef.current = scope;
    draftHydratedRef.current = false;
    const draft = loadSmartInputDraft(scope);
    if (draft) {
      setSourceUrl(draft.sourceUrl);
      setTargetUrl(draft.targetUrl);
      setTitle(draft.title);
      setDescription(draft.description);
    }
    draftHydratedRef.current = true;
  }, [draftUserId]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const scope = draftUserId;
    const draft = { sourceUrl, targetUrl, title, description };
    if (!hasSmartInputDraftContent(draft)) {
      clearSmartInputDraft(scope);
      return;
    }
    const t = window.setTimeout(() => {
      if (draftScopeRef.current !== scope) return;
      saveSmartInputDraft(scope, draft);
    }, DRAFT_SAVE_MS);
    return () => window.clearTimeout(t);
  }, [sourceUrl, targetUrl, title, description, draftUserId]);

  const sourceUrlError = synapseUrlFieldError(sourceUrl);
  const targetUrlError = synapseUrlFieldError(targetUrl);
  const hasUrlError = Boolean(sourceUrlError || targetUrlError);

  function handleSubmitClick(e: FormEvent) {
    e.preventDefault();
    const urlErr = validateSynapseEndpointUrls(sourceUrl, targetUrl);
    if (urlErr) {
      setMessage(urlErr);
      return;
    }
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
      if (res.status === 401) {
        notifySessionExpired();
        setMessage("ログインが必要です");
        setConfirmOpen(false);
        return;
      }
      if (!res.ok) {
        setMessage(data.error ?? "保存に失敗しました");
        setConfirmOpen(false);
        return;
      }
      setMessage("シナプスを繋ぎました！");
      clearSmartInputDraft(draftUserId);
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

      <div className="mb-0.5 flex items-center gap-1">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
          <label htmlFor="synapse-source-url" className="text-[11px] font-medium text-zinc-600">
            出発作品
          </label>
          <label htmlFor="synapse-target-url" className="text-[11px] font-medium text-zinc-600">
            着地作品
          </label>
        </div>
        <AllowedUrlHint />
      </div>
      <motion.div layout className="grid gap-1.5 sm:grid-cols-2">
        <div>
          <input
            id="synapse-source-url"
            className={[
              "w-full rounded-lg border bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2",
              sourceUrlError
                ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                : "border-zinc-200 focus:border-indigo-300 focus:ring-indigo-100",
            ].join(" ")}
            value={sourceUrl}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              if (message && !message.includes("！")) setMessage(null);
            }}
            placeholder="Amazon / Netflix / Hulu…"
            required
          />
          {sourceUrlError ? <PlatformUrlAlert message={sourceUrlError} /> : null}
        </div>
        <div>
          <input
            id="synapse-target-url"
            className={[
              "w-full rounded-lg border bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2",
              targetUrlError
                ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                : "border-zinc-200 focus:border-indigo-300 focus:ring-indigo-100",
            ].join(" ")}
            value={targetUrl}
            onChange={(e) => {
              setTargetUrl(e.target.value);
              if (message && !message.includes("！")) setMessage(null);
            }}
            placeholder="Amazon / Netflix / Hulu…"
            required
          />
          {targetUrlError ? <PlatformUrlAlert message={targetUrlError} /> : null}
        </div>
      </motion.div>

      {(sourceUrl.trim() && !sourceUrlError) || (targetUrl.trim() && !targetUrlError) ? (
        <motion.div layout className="grid gap-1.5 sm:grid-cols-2">
          <div className="min-w-0">
            {sourceUrl.trim() && !sourceUrlError ? <OgpPreviewCard url={sourceUrl} label="出発作品" /> : null}
          </div>
          <div className="min-w-0">
            {targetUrl.trim() && !targetUrlError ? <OgpPreviewCard url={targetUrl} label="着地作品" /> : null}
          </div>
        </motion.div>
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

      <div>
        <label className="block text-[11px] font-medium text-zinc-600">
          接続理由
          <textarea
            className="mt-0.5 min-h-[56px] w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, REASON_MAX))}
            placeholder="なぜこの2作品は繋がるのか…"
            required
            maxLength={REASON_MAX}
          />
        </label>
        <p
          className={`text-right text-[10px] tabular-nums ${description.length >= REASON_MAX ? "text-rose-400" : "text-zinc-400"}`}
        >
          {description.length} / {REASON_MAX}
        </p>
      </div>

      <button
        type="submit"
        disabled={loading || !user || hasUrlError}
        className="w-full rounded-full bg-indigo-600 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "保存中…" : "シナプスを繋ぐ"}
      </button>

      {message ? (
        <p
          role="alert"
          className={`text-xs ${message.includes("！") ? "text-emerald-600" : "text-rose-700"}`}
        >
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
