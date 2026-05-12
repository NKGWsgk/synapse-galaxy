"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
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

  async function submit(e: FormEvent) {
    e.preventDefault();
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
      if (!res.ok) { setMessage(data.error ?? "保存に失敗しました"); return; }
      setMessage("シナプスを繋ぎました！");
      setSourceUrl("");
      setTargetUrl("");
      setTitle("");
      setDescription("");
      setTimeout(onCreated, 800);
    } catch {
      setMessage("通信エラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
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
    </form>
  );
}
