"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components */

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getOgpImageDisplaySrc, isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { ogpImageLayout } from "@/lib/ogpImagePresentation";
import { EdgeKeywordInnerText } from "@/components/galaxy/EdgeKeywordInnerText";
import { ContentPlatformMark } from "@/components/galaxy/ContentPlatformMark";
import { useAuthFeedback } from "@/components/galaxy/AuthFeedback";
import type { SynapseRow } from "@/lib/supabase/clients";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { endpointWorkKey, type WorkEndpointMap } from "@/lib/workEndpoint";
import { isAmazonUrl } from "@/lib/amazon";
import { withSynapseAffiliate } from "@/lib/synapseAffiliate";
import { createBrowserClient } from "@/lib/supabase/browser";

type Props = {
  focusUrl: string;
  synapses: SynapseRow[];
  onFocusUrl: (url: string) => void;
};

type RingEdge = {
  synapse: SynapseRow;
  previewUrl: string;
  pickUrl: string;
  isOutgoing: boolean;
  /** 同一URLペアのシナプス数（線の太さのフォールバック） */
  count: number;
  /** フォーカスとの次元アラインメント（0〜1）。nullは次元データなし */
  dimAlignment: number | null;
  /** 2ホップ目（中心→リングノード経由）のセル */
  isSecondHop?: boolean;
};

/** 4×4 の周囲12マス（中心 2×2 を除く）を時計回り */
const RING_GRID_POS: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [0, 2], [0, 3],
  [1, 3], [2, 3],
  [3, 3], [3, 2], [3, 1], [3, 0],
  [2, 0], [1, 0],
] as const;

/**
 * 三角形グローバルマップの極（スクリーン座標、y下向き）
 *
 * 文系 ─────────────── 理系  ← やや上部・水平軸
 *       \             /
 *        \           /
 *         \         /
 *           \     /
 *            \   /
 *             芸術              ← 下部中央
 *
 * rika   → 右  (1.0, -0.5)
 * bunkei → 左  (-1.0, -0.5)
 * art    → 下中央 (0.0, 1.0)
 *
 * 重心 = (0,0) なので balanced ノードは中央に来る。
 */
export const TRIANGLE_POLES = {
  rika:   { x:  1.0,  y: -0.5 },
  bunkei: { x: -1.0,  y: -0.5 },
  art:    { x:  0.0,  y:  1.0 },
} as const;

/** DimProfile → グローバルスクリーン座標（三角形投影） */
export function nodeGlobalScreenXY(p: DimProfile): { x: number; y: number } {
  return {
    x: p.rika * TRIANGLE_POLES.rika.x + p.bunkei * TRIANGLE_POLES.bunkei.x + p.art * TRIANGLE_POLES.art.x,
    y: p.rika * TRIANGLE_POLES.rika.y + p.bunkei * TRIANGLE_POLES.bunkei.y + p.art * TRIANGLE_POLES.art.y,
  };
}

/** 4×4グリッドの中心（2×2フォーカス領域の中心） */
const GRID_CENTER_X = 2.0;
const GRID_CENTER_Y = 2.0;

/** 各リングセルの中心 → グリッド中心 方向角（ラジアン、スクリーン座標）を事前計算 */
const RING_CELL_ANGLES: readonly number[] = RING_GRID_POS.map(([row, col]) =>
  Math.atan2((row + 0.5) - GRID_CENTER_Y, (col + 0.5) - GRID_CENTER_X),
);

/** 2つの角度の円環上の差（絶対値、ラジアン） */
function angleDiffRad(a: number, b: number): number {
  let d = a - b;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** 接続次元の線の色 */
const DIM_LINE_COLOR: Record<"rika" | "bunkei" | "art", { strong: string; mid: string; weak: string }> = {
  rika:   { strong: "rgba(59,130,246,0.92)",  mid: "rgba(59,130,246,0.62)",  weak: "rgba(59,130,246,0.42)"  },
  bunkei: { strong: "rgba(234,179,8,0.92)",   mid: "rgba(234,179,8,0.65)",   weak: "rgba(234,179,8,0.45)"   },
  art:    { strong: "rgba(239,68,68,0.90)",   mid: "rgba(239,68,68,0.60)",   weak: "rgba(239,68,68,0.42)"   },
};

function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 32); }
}

function sortSynapsesForRing(list: SynapseRow[]): SynapseRow[] {
  return [...list].sort((a, b) => {
    if (a.target_url !== b.target_url) return a.target_url.localeCompare(b.target_url);
    return a.id.localeCompare(b.id);
  });
}

function pickEdgeKeyword(s: SynapseRow): string | null {
  const k = s.keywords?.find((x) => x && x.trim());
  return k ? k.trim() : null;
}

/** 同一 preview URL で1セルにまとめる。outgoing を incoming より優先。count・dimAlignmentも集計 */
function dedupeRingEdges(edges: RingEdge[]): RingEdge[] {
  const map = new Map<string, RingEdge>();
  const countMap = new Map<string, number>();
  const alignMap = new Map<string, number[]>();
  for (const e of edges) {
    const key = normalizeSynapseEndpoint(e.previewUrl);
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
    if (e.dimAlignment != null) {
      const arr = alignMap.get(key) ?? [];
      arr.push(e.dimAlignment);
      alignMap.set(key, arr);
    }
    const prev = map.get(key);
    if (!prev || (!prev.isOutgoing && e.isOutgoing)) map.set(key, e);
  }
  return [...map.values()]
    .map((e) => {
      const key = normalizeSynapseEndpoint(e.previewUrl);
      const aligns = alignMap.get(key);
      const dimAlignment = aligns && aligns.length > 0
        ? aligns.reduce((a, b) => a + b, 0) / aligns.length
        : null;
      return { ...e, count: countMap.get(key) ?? 1, dimAlignment };
    })
    .sort((a, b) => normalizeSynapseEndpoint(a.previewUrl).localeCompare(normalizeSynapseEndpoint(b.previewUrl)));
}

export const ogpMiniCache = new Map<string, { title: string | null; imageUrl: string | null }>();

export async function fetchOgpMiniPayload(url: string): Promise<{ title: string | null; imageUrl: string | null } | null> {
  async function load(refresh: boolean) {
    const qs = new URLSearchParams({ url });
    if (refresh) qs.set("refresh", "1");
    const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
    const j = (await r.json()) as { error?: string; title?: string | null; imageUrl?: string | null };
    if (j.error) return null;
    return { title: j.title ?? null, imageUrl: j.imageUrl ?? null };
  }
  const o = await load(false);
  if (!o) return null;
  const label = resolveContentDisplayTitle(o.title, url);
  if (isWeakContentTitleLabel(label, url) || !(o.imageUrl ?? "").trim()) {
    const o2 = await load(true);
    if (o2) { ogpMiniCache.set(url, o2); return o2; }
  }
  ogpMiniCache.set(url, o);
  return o;
}

async function fetchOgpDisplayLabel(url: string): Promise<string> {
  const hit = ogpMiniCache.get(url);
  if (hit?.title?.trim()) {
    const label = resolveContentDisplayTitle(hit.title, url);
    if (!isWeakContentTitleLabel(label, url)) return label;
    ogpMiniCache.delete(url);
  }
  async function load(refresh: boolean): Promise<string> {
    const qs = new URLSearchParams({ url });
    if (refresh) qs.set("refresh", "1");
    const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
    const j = (await r.json()) as { error?: string; title?: string | null; imageUrl?: string | null };
    if (j.error) return resolveContentDisplayTitle(null, url);
    const title = j.title ?? null;
    ogpMiniCache.set(url, { title, imageUrl: j.imageUrl ?? null });
    const label = resolveContentDisplayTitle(title, url);
    if (isWeakContentTitleLabel(label, url) && !refresh) return load(true);
    return label;
  }
  try { return await load(false); }
  catch { return resolveContentDisplayTitle(null, url); }
}

// ── いいねボタン ────────────────────────────────────────────────────────────

export function LikeButton({ synapse, accessToken }: { synapse: SynapseRow; accessToken: string | null }) {
  const { notifySessionExpired } = useAuthFeedback();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(synapse.likes_count ?? 0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    void fetch(`/api/synapse/${synapse.id}/like`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((j: { liked?: boolean }) => { if (j.liked !== undefined) setLiked(j.liked); })
      .catch(() => {});
  }, [synapse.id, accessToken]);

  const toggle = useCallback(async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    const method = liked ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/synapse/${synapse.id}/like`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) {
        notifySessionExpired();
        return;
      }
      if (!res.ok) return;
      const j = (await res.json()) as { likes_count?: number };
      setLiked(!liked);
      if (j.likes_count !== undefined) setCount(j.likes_count);
      else setCount((prev) => prev + (liked ? -1 : 1));
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, [accessToken, liked, loading, synapse.id, notifySessionExpired]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!accessToken || loading}
      className={[
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
        liked
          ? "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
        (!accessToken) ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
      title={accessToken ? (liked ? "いいねを取り消す" : "いいね") : "いいねにはログインが必要です"}
    >
      <span aria-hidden>{liked ? "♥" : "♡"}</span>
      <span>{count}</span>
    </button>
  );
}

// ── OGPタイル ────────────────────────────────────────────────────────────────

export function OgpTileMedia({
  pageUrl, imageUrl, slot, loading, eager, onError,
}: {
  pageUrl: string;
  imageUrl: string | null | undefined;
  slot: "gridMini" | "gridHero" | "modal" | "inlineThumb" | "feedConnection";
  loading: boolean;
  eager?: boolean;
  onError?: () => void;
}) {
  const L = ogpImageLayout(pageUrl, slot);
  const pulseBg = L.mode === "video" ? "bg-zinc-800/70" : "bg-zinc-200/80";
  const src = imageUrl ? getOgpImageDisplaySrc(imageUrl, pageUrl) : "";
  return (
    <div className={L.outer}>
      {loading ? <div className={`absolute inset-0 z-10 animate-pulse ${pulseBg}`} aria-hidden /> : null}
      {!loading && imageUrl ? (
        L.mode === "video" ? (
          <div className={L.inner}>
            <img src={src} alt="" className={L.img} loading={eager ? "eager" : "lazy"} onError={onError} />
          </div>
        ) : (
          <img src={src} alt="" className={L.img} loading={eager ? "eager" : "lazy"} onError={onError} />
        )
      ) : null}
    </div>
  );
}

export function SynapseConnectionTitles({ synapse, focusNorm }: { synapse: SynapseRow; focusNorm: string }) {
  const srcN = normalizeSynapseEndpoint(synapse.source_url);
  const tgtN = normalizeSynapseEndpoint(synapse.target_url);
  const sourceActive = srcN === focusNorm;
  const targetActive = tgtN === focusNorm;
  const [fromLabel, setFromLabel] = useState<string | null>(null);
  const [toLabel, setToLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchOgpDisplayLabel(synapse.source_url), fetchOgpDisplayLabel(synapse.target_url)])
      .then(([a, b]) => { if (cancelled) return; setFromLabel(a); setToLabel(b); setLoading(false); });
    return () => { cancelled = true; };
  }, [synapse.source_url, synapse.target_url]);

  const left = loading ? "取得中…" : (fromLabel ?? hostLabel(synapse.source_url));
  const right = loading ? "取得中…" : (toLabel ?? hostLabel(synapse.target_url));
  const muted = "font-medium text-zinc-600";
  const sourceCls = sourceActive ? "font-semibold text-indigo-700" : muted;
  const targetCls = targetActive ? "font-semibold text-violet-800" : muted;

  return (
    <div className="mb-1.5">
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px] leading-snug">
        <span className={`min-w-0 ${sourceCls}`}>{left}</span>
        <span className="shrink-0 font-normal text-zinc-400" aria-hidden>→</span>
        <span className={`min-w-0 ${targetCls}`}>{right}</span>
      </p>
    </div>
  );
}

export function ConnectionWorksLine({
  sourceUrl,
  targetUrl,
  focusUrl,
  onClickWork,
}: {
  sourceUrl: string;
  targetUrl: string;
  focusUrl: string;
  onClickWork?: (url: string) => void;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchOgpDisplayLabel(sourceUrl), fetchOgpDisplayLabel(targetUrl)])
      .then(([a, b]) => { if (cancelled) return; setFrom(a); setTo(b); setLoading(false); });
    return () => { cancelled = true; };
  }, [sourceUrl, targetUrl]);

  const MAX = 22;
  const truncate = (s: string) => (s.length > MAX ? s.slice(0, MAX - 1) + "…" : s);
  const leftRaw = loading ? "取得中…" : (from ?? hostLabel(sourceUrl));
  const rightRaw = loading ? "取得中…" : (to ?? hostLabel(targetUrl));
  const left = truncate(leftRaw);
  const right = truncate(rightRaw);

  const focusNorm = normalizeSynapseEndpoint(focusUrl);
  const srcActive = normalizeSynapseEndpoint(sourceUrl) === focusNorm;
  const tgtActive = normalizeSynapseEndpoint(targetUrl) === focusNorm;

  const baseCls = "flex h-12 w-40 items-center justify-center rounded-lg px-2.5 py-1.5 text-center text-[11px] leading-snug ring-1 ring-inset transition";
  const activeCls = `${baseCls} bg-indigo-50 font-bold text-indigo-700 ring-indigo-200 hover:bg-indigo-100`;
  const mutedCls = `${baseCls} bg-white font-medium text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:text-indigo-700 hover:ring-indigo-200`;

  return (
    <div id="keyword-note-connection" className="shrink-0 border-b border-zinc-100 px-4 py-3 sm:px-5">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onClickWork?.(sourceUrl)}
          disabled={!onClickWork}
          className={srcActive ? activeCls : mutedCls}
          title={leftRaw}
        >
          <span className="line-clamp-2 break-words">{left}</span>
        </button>
        <span className="shrink-0 text-base font-normal text-zinc-400" aria-hidden>→</span>
        <button
          type="button"
          onClick={() => onClickWork?.(targetUrl)}
          disabled={!onClickWork}
          className={tgtActive ? activeCls : mutedCls}
          title={rightRaw}
        >
          <span className="line-clamp-2 break-words">{right}</span>
        </button>
      </div>
    </div>
  );
}

type NodeGravity = {
  /** フォーカス方向を除いた最長パス長（チェーンの深さ） */
  depth: number;
  /** BFSで到達できる全ユニークノード数（ネットワーク規模） */
  total: number;
  /**
   * true = 一直線チェーン（depth≥2）
   * false = 文脈が広がるハブ型
   */
  chainLike: boolean;
};

export type DimProfile = {
  rika: number;
  bunkei: number;
  art: number;
  time: number;
};

export type DominantDim = "rika" | "bunkei" | "art" | "balanced";

/** シナプスの dim_* フィールドを DimProfile に変換（null は除外） */
export function synapseToDims(s: SynapseRow): DimProfile | null {
  if (s.dim_rika == null || s.dim_bunkei == null || s.dim_art == null || s.dim_time == null) return null;
  return { rika: s.dim_rika, bunkei: s.dim_bunkei, art: s.dim_art, time: s.dim_time };
}

/**
 * あるノード（norm）に繋がる全シナプスの次元を平均して「プロファイル」を返す。
 * = グローバルマップ上のそのノードの「座標」に相当する。
 * 次元データが1件もなければ null。
 */
export function computeNodeDimProfile(
  key: string,
  synapses: SynapseRow[],
  workMap: WorkEndpointMap = {},
): DimProfile | null {
  const profiles: DimProfile[] = [];
  for (const s of synapses) {
    const srcN = endpointWorkKey(s.source_url, workMap);
    const tgtN = endpointWorkKey(s.target_url, workMap);
    if (srcN !== key && tgtN !== key) continue;
    const d = synapseToDims(s);
    if (d) profiles.push(d);
  }
  if (profiles.length === 0) return null;
  return {
    rika:   profiles.reduce((a, p) => a + p.rika,   0) / profiles.length,
    bunkei: profiles.reduce((a, p) => a + p.bunkei, 0) / profiles.length,
    art:    profiles.reduce((a, p) => a + p.art,    0) / profiles.length,
    time:   profiles.reduce((a, p) => a + p.time,   0) / profiles.length,
  };
}

/** computeNodeDimProfile の alias（フォーカスノード用） */
const computeFocusDimProfile = computeNodeDimProfile;

/**
 * グローバルマップ上の2Dxy座標。
 * x = 理系(+) ↔ 文系/芸術(-) 軸
 * y = 未来(+) ↔ 歴史(-) 軸
 */
function profileToMapXY(p: DimProfile): { x: number; y: number } {
  return {
    x: p.rika - (p.bunkei + p.art) / 2,
    y: p.time,
  };
}

/**
 * フォーカスプロファイルとシナプス次元のコサイン類似度（0〜1）。
 * dim_time は正規化して含める。
 */
function computeDimAlignment(focus: DimProfile, synapse: DimProfile): number {
  // time は -5〜+5 → 0〜10 に正規化して他と揃える
  const fv = [focus.rika, focus.bunkei, focus.art, (focus.time + 5)];
  const sv = [synapse.rika, synapse.bunkei, synapse.art, (synapse.time + 5)];
  const dot = fv.reduce((a, f, i) => a + f * (sv[i] ?? 0), 0);
  const magF = Math.sqrt(fv.reduce((a, f) => a + f * f, 0));
  const magS = Math.sqrt(sv.reduce((a, s) => a + s * s, 0));
  if (magF === 0 || magS === 0) return 0;
  return dot / (magF * magS);
}

/** シナプス次元の支配的な軸を返す */
export function getDominantDim(d: DimProfile): DominantDim {
  const max = Math.max(d.rika, d.bunkei, d.art);
  if (max < 2) return "balanced";
  if (d.rika === max) return "rika";
  if (d.bunkei === max) return "bunkei";
  return "art";
}

/**
 * リングセルの「その先の重力」をBFSで算出。
 * depth（深さ）・total（規模）・chainLike（線形か分岐か）を返す。
 */
function computeNodeGravity(norm: string, focusNorm: string, synapses: SynapseRow[]): NodeGravity {
  const visited = new Set<string>([focusNorm, norm]);
  const queue: Array<{ n: string; depth: number }> = [{ n: norm, depth: 0 }];
  let maxDepth = 0;
  let total = 0;
  while (queue.length > 0) {
    const { n: cur, depth } = queue.shift()!;
    for (const s of synapses) {
      const srcN = normalizeSynapseEndpoint(s.source_url);
      const tgtN = normalizeSynapseEndpoint(s.target_url);
      let neighbor: string | null = null;
      if (srcN === cur && !visited.has(tgtN)) neighbor = tgtN;
      else if (tgtN === cur && !visited.has(srcN)) neighbor = srcN;
      if (neighbor) {
        visited.add(neighbor);
        total++;
        const d = depth + 1;
        if (d > maxDepth) maxDepth = d;
        queue.push({ n: neighbor, depth: d });
      }
    }
  }
  // chainLike = 最長パスが2以上伸びている（= チェーンが続いている）
  // 横への分岐（total）がいくら多くても、深さが出ていればチェーン判定を優先する
  const chainLike = maxDepth >= 2;
  return { depth: maxDepth, total, chainLike };
}

function OgpMiniCell({
  synapse, previewUrl, pickUrl, dim, onPick, gravity, dimAlignment, synapseDims, workPotential, onHoverChange,
}: {
  synapse: SynapseRow | null;
  previewUrl?: string;
  pickUrl?: string;
  dim: boolean;
  onPick: (url: string) => void;
  gravity?: NodeGravity;
  dimAlignment?: number | null;
  synapseDims?: DimProfile | null;
  /** 作品のポテンシャル（全接続次元の平均 = 接続が増えるほど精度が上がる） */
  workPotential?: DimProfile | null;
  /** hover でこのセルに紐づく synapse をハイライト */
  onHoverChange?: (id: string | null) => void;
}) {
  const [data, setData] = useState<{ title: string | null; imageUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const url = synapse ? (previewUrl ?? synapse.target_url) : undefined;

  useEffect(() => {
    if (!url) { setData(null); setLoading(false); return; }
    const hit = ogpMiniCache.get(url);
    if (hit) {
      const label = resolveContentDisplayTitle(hit.title, url);
      if (!isWeakContentTitleLabel(label, url) && (hit.imageUrl ?? "").trim()) {
        setData(hit); setLoading(false); return;
      }
      ogpMiniCache.delete(url);
    }
    let cancel = false;
    setLoading(true);
    setImgError(false);
    void fetchOgpMiniPayload(url)
      .then((o) => { if (cancel) return; setData(o ?? { title: null, imageUrl: null }); })
      .catch(() => { if (!cancel) setData({ title: null, imageUrl: null }); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [url]);

  if (!synapse) return <div className="h-full w-full min-h-0 rounded-lg bg-zinc-100/70" />;

  const displayTitle = resolveContentDisplayTitle(data?.title ?? null, url ?? "").slice(0, 72);
  const showImage = data?.imageUrl && !imgError;
  const g = gravity;
  const depth = g?.depth ?? 0;
  const total = g?.total ?? 0;

  // ── ボーダー・シャドウ：セル自体はニュートラル ────────────────────────
  // 接続の強弱は SVG線（RingLinesSvg）で表現するため、セルは均一なデザインを保つ
  const borderCls = "border-zinc-200/70";
  const shadowCls = "shadow-sm";

  // ── インジケーター ────────────────────────────────────────────────
  // 接続の次元（この接続の性質）
  const connDominant = synapseDims ? getDominantDim(synapseDims) : null;
  // 作品ポテンシャルの支配的な軸（全接続の平均 = 作品の文脈的重心）
  const potDominant = workPotential ? getDominantDim(workPotential) : null;

  const DIM_STYLE: Record<DominantDim, { label: string; cls: string }> = {
    rika:     { label: "理", cls: "bg-blue-600 text-white" },
    bunkei:   { label: "文", cls: "bg-amber-500 text-white" },
    art:      { label: "芸", cls: "bg-rose-500 text-white" },
    balanced: { label: "∼", cls: "bg-zinc-400 text-white" },
  };

  // 接続次元ピル（右下）
  const showConnPill = connDominant != null && connDominant !== "balanced";
  // 作品ポテンシャルピル（左下）— 接続次元と異なるときだけ表示（違いが分かる）
  const showPotPill = potDominant != null && potDominant !== "balanced" && potDominant !== connDominant;

  // フォールバック：次元なしのチェーン深さ
  const showDepthPill = !showConnPill && (depth > 0 || total > 0);
  const depthLabel = depth >= 1 ? `→${depth}` : `+${total}`;
  const depthCls = depth >= 1 ? "bg-indigo-600 text-white" : "bg-amber-500 text-white";

  return (
    <button
      type="button"
      onClick={() => onPick(pickUrl ?? previewUrl ?? synapse.target_url)}
      onMouseEnter={() => onHoverChange?.(synapse.id)}
      onMouseLeave={() => onHoverChange?.(null)}
      onFocus={() => onHoverChange?.(synapse.id)}
      onBlur={() => onHoverChange?.(null)}
      className={[
        "group relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-lg border text-left transition",
        loading ? "border-indigo-100/80 bg-white shadow-sm" : `${borderCls} ${shadowCls} bg-white hover:brightness-[0.97]`,
        dim ? "opacity-35" : "",
      ].join(" ")}
    >
      {loading ? (
        <SynapseLoader />
      ) : (
        <>
          <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
            <OgpTileMedia pageUrl={url ?? synapse.target_url} imageUrl={showImage ? data?.imageUrl : null} slot="gridMini" loading={false} onError={() => setImgError(true)} />
            <ContentPlatformMark pageUrl={url ?? synapse.target_url} />
          </div>
          <div className="relative flex min-h-[2.75rem] shrink-0 flex-col justify-center px-1 py-1 sm:min-h-[2.875rem] sm:px-1.5 sm:py-1">
            <p
              className="line-clamp-2 w-full overflow-hidden text-center text-[9px] font-medium leading-snug text-zinc-800 [overflow-wrap:anywhere] sm:text-[10px]"
              title={displayTitle}
            >
              {displayTitle}
            </p>
          </div>
          {/* チェーン深さピル */}
          {showDepthPill && (
            <span
              className={`pointer-events-none absolute bottom-1 right-1 z-20 select-none rounded-full px-1.5 py-px text-[7px] font-bold leading-none tracking-tight ${depthCls}`}
              title={depth >= 1 ? `深さ${depth}のチェーンが続く` : `この先に${total}件の広がり`}
            >
              {depthLabel}
            </span>
          )}
        </>
      )}
    </button>
  );
}

// ── シナプスローダー ────────────────────────────────────────────────────────────

function SynapseLoader() {
  const dur = "1.8s";
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-50 to-indigo-50/30">
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden>
        {/* lines */}
        {([ [24,21,24,7], [27,24,41,24], [24,27,24,41], [21,24,7,24] ] as const).map(([x1,y1,x2,y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6366f1" strokeWidth="0.9" strokeLinecap="round">
            <animate attributeName="opacity" values="0.15;0.55;0.15" dur={dur} begin={`${i * 0.25}s`} repeatCount="indefinite" />
          </line>
        ))}
        {/* outer nodes */}
        {([ [24,5], [43,24], [24,43], [5,24] ] as const).map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="2" fill="#6366f1">
            <animate attributeName="opacity" values="0.2;0.9;0.2" dur={dur} begin={`${i * 0.25 + 0.12}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* center node */}
        <circle cx="24" cy="24" r="3" fill="#6366f1">
          <animate attributeName="opacity" values="0.5;1;0.5" dur={dur} begin="0s" repeatCount="indefinite" />
          <animate attributeName="r" values="2.5;3.5;2.5" dur={dur} begin="0s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

// ── 線・ラベル ────────────────────────────────────────────────────────────────

type Segment = { x1: number; y1: number; x2: number; y2: number; count: number; dimAlignment?: number | null; dimZone?: "rika" | "bunkei" | "art" | null; isOutgoing?: boolean; midX?: number; midY?: number };

type EdgeGeometry = {
  innerSeg: Segment;
  innerLabelMid: { x: number; y: number };
};

/** リング外への延長距離（viewBox 100×100 の % 単位）。
 *  ring cell の外側エッジから外向きに延ばす量。
 *  大きすぎるとビューポートからはみ出る — scale と整合させる。 */
const RING_EXTEND_OUTER = 14;

/** columnGap / rowGap を含めた 4×4 グリッドの実寸（px）→ マス境界を SVG% に変換 */
type RingGridLayout = { w: number; h: number; gapX: number; gapY: number };

type PctRect = { l: number; r: number; t: number; b: number };

function cellRectPct(col: number, row: number, L: RingGridLayout): PctRect {
  const { w, h, gapX, gapY } = L;
  const tw = (w - 3 * gapX) / 4;
  const th = (h - 3 * gapY) / 4;
  const left = col * (tw + gapX);
  const top = row * (th + gapY);
  return {
    l: (left / w) * 100,
    r: ((left + tw) / w) * 100,
    t: (top / h) * 100,
    b: ((top + th) / h) * 100,
  };
}

function hubRectPct(L: RingGridLayout): PctRect {
  const a = cellRectPct(1, 1, L);
  const b = cellRectPct(2, 2, L);
  return { l: a.l, r: b.r, t: a.t, b: b.b };
}

function cellCenterPct(row: number, col: number, L: RingGridLayout) {
  const q = cellRectPct(col, row, L);
  return { x: (q.l + q.r) / 2, y: (q.t + q.b) / 2 };
}

function edgeInsetPct(L: RingGridLayout): { ix: number; iy: number } {
  const tw = (L.w - 3 * L.gapX) / 4;
  const th = (L.h - 3 * L.gapY) / 4;
  const insetPx = Math.max(0.9, Math.min(4.2, Math.min(tw, th) * 0.038));
  return { ix: (insetPx / L.w) * 100, iy: (insetPx / L.h) * 100 };
}

/** グリッドトラックと実カード（セル padding 相当）の差 — 矢印をカード縁付近に */
const TRACK_TO_CARD_FRAC = 0.065;

/**
 * リング外への延長セグメント。
 * row,col のリングセル外側エッジから外向きに RING_EXTEND_OUTER だけ伸ばす。
 * 矢印は「リング外の点」を着地点（tip）にする。
 * ラベルはセグメントの中点近傍（線と被らないよう垂直オフセット）。
 */
type OuterExtension = {
  /** ring cell 側（線の起点 = リングカードの縁） */
  ringX: number;
  ringY: number;
  /** 外側終点（矢印の tip） */
  outX: number;
  outY: number;
  /** ラベルアンカー（線の midpoint を垂直に少し外したもの） */
  labelX: number;
  labelY: number;
};

function computeOuterExtension(row: number, col: number, L: RingGridLayout, angleOffsetRad: number = 0): OuterExtension {
  const isTop = row === 0 && col >= 1 && col <= 2;
  const isBottom = row === 3 && col >= 1 && col <= 2;
  const isLeft = col === 0 && row >= 1 && row <= 2;
  const isRight = col === 3 && row >= 1 && row <= 2;
  const isTL = row === 0 && col === 0;
  const isTR = row === 0 && col === 3;
  const isBL = row === 3 && col === 0;
  const isBR = row === 3 && col === 3;

  // 基準の外向き単位ベクトル（スクリーン座標、y下向き）
  let bux = 0, buy = 0;
  if (isTop)         { bux =  0; buy = -1; }
  else if (isBottom) { bux =  0; buy =  1; }
  else if (isLeft)   { bux = -1; buy =  0; }
  else if (isRight)  { bux =  1; buy =  0; }
  else if (isTL)     { bux = -Math.SQRT1_2; buy = -Math.SQRT1_2; }
  else if (isTR)     { bux =  Math.SQRT1_2; buy = -Math.SQRT1_2; }
  else if (isBL)     { bux = -Math.SQRT1_2; buy =  Math.SQRT1_2; }
  else if (isBR)     { bux =  Math.SQRT1_2; buy =  Math.SQRT1_2; }

  // corner cell では outer source が viewBox 境界に貼り付いて line がほぼゼロ長になるため、
  // source は cell center に固定する。line は cell カードを横切るが SVG が上にあるので視認可能。
  const cellC = cellCenterPct(row, col, L);
  const ringX = cellC.x;
  const ringY = cellC.y;

  // 放射分散：基準方向を angleOffsetRad で回転
  const cos = Math.cos(angleOffsetRad);
  const sin = Math.sin(angleOffsetRad);
  const ux = bux * cos - buy * sin;
  const uy = bux * sin + buy * cos;

  const rawOutX = ringX + ux * RING_EXTEND_OUTER;
  const rawOutY = ringY + uy * RING_EXTEND_OUTER;

  // viewBox 境界の手前 (margin 2vb) で ray をクリップして、矢印先端と label が端から離れるようにする。
  const clipped = clipRayToViewBox(ringX, ringY, rawOutX, rawOutY);
  const outX = clipped.x;
  const outY = clipped.y;

  // ラベル位置：4×4 のカードに被らないよう、必ず cell の outer edge より外側に置く。
  // 1) cell rect から方向 (ux,uy) で出た点を起点に、固定マージン LABEL_OUTSIDE_MARGIN_VB 外側へ。
  // 2) viewBox 境界余白の内側へクランプ（端から LABEL_VIEW_MARGIN_VB 以上離す）。
  const cellRect = cellRectPct(col, row, L);
  const exit = rayExitRect(ringX, ringY, outX, outY, cellRect.l, cellRect.t, cellRect.r, cellRect.b);
  const LABEL_OUTSIDE_MARGIN_VB = 3;
  let labelX = exit.x + ux * LABEL_OUTSIDE_MARGIN_VB;
  let labelY = exit.y + uy * LABEL_OUTSIDE_MARGIN_VB;
  const LABEL_VIEW_MARGIN_VB = 4;
  labelX = Math.max(LABEL_VIEW_MARGIN_VB, Math.min(100 - LABEL_VIEW_MARGIN_VB, labelX));
  labelY = Math.max(LABEL_VIEW_MARGIN_VB, Math.min(100 - LABEL_VIEW_MARGIN_VB, labelY));

  return { ringX, ringY, outX, outY, labelX, labelY };
}

/**
 * source (sx, sy) は viewBox 内、target (tx, ty) は外まで延びうる ray を、
 * viewBox [MARGIN, 100-MARGIN] の縮小境界でクリップして返す。
 * 矢印先端と label が viewport edge から確実に離れるよう余白を残す。
 */
function clipRayToViewBox(sx: number, sy: number, tx: number, ty: number): { x: number; y: number } {
  const MARGIN = 2;
  const lo = MARGIN;
  const hi = 100 - MARGIN;
  const dx = tx - sx;
  const dy = ty - sy;
  let tMax = 1.0;
  if (dx > 1e-9) tMax = Math.min(tMax, (hi - sx) / dx);
  else if (dx < -1e-9) tMax = Math.min(tMax, (lo - sx) / dx);
  if (dy > 1e-9) tMax = Math.min(tMax, (hi - sy) / dy);
  else if (dy < -1e-9) tMax = Math.min(tMax, (lo - sy) / dy);
  tMax = Math.max(0, Math.min(1, tMax));
  return { x: sx + tMax * dx, y: sy + tMax * dy };
}

/**
 * 矩形内部の点 ox,oy からターゲット tx,ty の方向へ直進したとき、
 * 最初に矩形 [xmin,xmax]×[ymin,ymax] の境界に当たる点（辺上）を返す。
 */
function rayExitRect(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
): { x: number; y: number } {
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: ox, y: oy };
  const ux = dx / len;
  const uy = dy / len;
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (xmax - ox) / ux);
  if (ux < -1e-9) t = Math.min(t, (xmin - ox) / ux);
  if (uy > 1e-9) t = Math.min(t, (ymax - oy) / uy);
  if (uy < -1e-9) t = Math.min(t, (ymin - oy) / uy);
  if (!Number.isFinite(t) || t <= 0) return { x: ox + ux * 0.02, y: oy + uy * 0.02 };
  return { x: ox + t * ux, y: oy + t * uy };
}

/** 中心2×2（ヒーロー）と各周辺マスの位置関係で、辺の中点 or 角にアンカーを置いて接続する */
function computeEdgeGeometry(row: number, col: number, count: number, L: RingGridLayout, isOutgoing: boolean = true): EdgeGeometry {
  const { ix, iy } = edgeInsetPct(L);
  const R = cellRectPct(col, row, L);
  const H = hubRectPct(L);
  const mx = (R.l + R.r) / 2;
  const my = (R.t + R.b) / 2;
  const cw = R.r - R.l;
  const ch = R.b - R.t;
  const padx = cw * TRACK_TO_CARD_FRAC;
  const pady = ch * TRACK_TO_CARD_FRAC;
  /** サムネ＋タイトルで視覚重心がやや下 — 左右辺の y を幾何中心より少し下げる */
  const yMidCardish = my + ch * (row === 1 ? 0.048 : row === 2 ? 0.032 : 0);

  let hubX: number;
  let hubY: number;
  let ringX: number;
  let ringY: number;

  const isTop = row === 0 && col >= 1 && col <= 2;
  const isBottom = row === 3 && col >= 1 && col <= 2;
  const isLeft = col === 0 && row >= 1 && row <= 2;
  const isRight = col === 3 && row >= 1 && row <= 2;
  const isTL = row === 0 && col === 0;
  const isTR = row === 0 && col === 3;
  const isBL = row === 3 && col === 0;
  const isBR = row === 3 && col === 3;

  if (isTop) {
    ringX = mx;
    ringY = R.b - iy - pady;
    hubX = mx;
    hubY = H.t + iy;
  }
  else if (isBottom) {
    ringX = mx;
    ringY = R.t + iy + pady;
    hubX = mx;
    hubY = H.b - iy;
  }
  else if (isLeft) {
    ringX = R.r - ix - padx;
    ringY = yMidCardish;
    hubX = H.l + ix;
    hubY = yMidCardish;
  }
  else if (isRight) {
    ringX = R.l + ix + padx;
    ringY = yMidCardish;
    hubX = H.r - ix;
    hubY = yMidCardish;
  }
  else if (isTL) {
    ringX = R.r - ix - padx;
    ringY = R.b - iy - pady;
    hubX = H.l + ix;
    hubY = H.t + iy;
  }
  else if (isTR) {
    ringX = R.l + ix + padx;
    ringY = R.b - iy - pady;
    hubX = H.r - ix;
    hubY = H.t + iy;
  }
  else if (isBL) {
    ringX = R.r - ix - padx;
    ringY = R.t + iy + pady;
    hubX = H.l + ix;
    hubY = H.b - iy;
  }
  else if (isBR) {
    ringX = R.l + ix + padx;
    ringY = R.t + iy + pady;
    hubX = H.r - ix;
    hubY = H.b - iy;
  }
  else {
    // 想定外（リング12マス以外）は辺中点の代理
    ringX = mx;
    ringY = my;
    hubX = (H.l + H.r) / 2;
    hubY = (H.t + H.b) / 2;
  }

  const innerSeg: Segment = { x1: hubX, y1: hubY, x2: ringX, y2: ringY, count };

  // ラベル配置ルール（ユーザー仕様）:
  //   水平に並んでいるマス（=ハブと同行の左右4マス）→ 矢印の上部
  //   それ以外（上下/コーナー8マス） → 矢印のxyセンターにラベルセンターをあわせる
  // 「矢印センター」= 実描画される <line> の bounding box midpoint。
  // <line> は hub から lineEndBeforeArrowTip(hub, ring, RING_ARROW_W) まで描かれるので
  // 視覚中央 = (hub + ring) / 2 から ring 方向へ RING_ARROW_W/2 戻った点。
  // （incoming で line が反転描画されても直線の midpoint は同じなので isOutgoing 分岐は不要）
  const tdx = ringX - hubX;
  const tdy = ringY - hubY;
  const tlen = Math.hypot(tdx, tdy) || 1;
  const ux = tdx / tlen;
  const uy = tdy / tlen;
  const lineCenterX = (hubX + ringX) / 2 - (RING_ARROW_W / 2) * ux;
  const lineCenterY = (hubY + ringY) / 2 - (RING_ARROW_W / 2) * uy;
  const isHorizontal = isLeft || isRight;
  /** 「上部」= 矢印センターから画面上方向へ少し持ち上げる量（% in viewBox 100×100） */
  const LABEL_ABOVE_OFFSET = 3.6;
  const innerLabelMid = isHorizontal
    ? { x: lineCenterX, y: lineCenterY - LABEL_ABOVE_OFFSET }
    : { x: lineCenterX, y: lineCenterY };

  return { innerSeg, innerLabelMid };
}

/**
 * 線の太さ：dimAlignment を優先、なければ count フォールバック
 * dimAlignment（0〜1）: フォーカス軸との一致度
 */
function strokeWidth(seg: Segment): number {
  if (seg.dimAlignment != null) {
    if (seg.dimAlignment >= 0.85) return 1.05;
    if (seg.dimAlignment >= 0.65) return 0.92;
    if (seg.dimAlignment >= 0.40) return 0.78;
    return 0.64;
  }
  if (seg.count >= 4) return 1.0;
  if (seg.count >= 3) return 0.9;
  if (seg.count >= 2) return 0.78;
  return 0.66;
}

/**
 * 線の色：
 * - 次元ゾーンがあれば → 理系=青, 文系=黄, 芸術=赤
 * - なければ indigo（フォールバック）
 * 明度はalignmentで調整
 */
function strokeColor(seg: Segment): string {
  const zone = seg.dimZone;
  if (zone) {
    const palette = DIM_LINE_COLOR[zone];
    if (seg.dimAlignment != null) {
      if (seg.dimAlignment >= 0.65) return palette.strong;
      if (seg.dimAlignment >= 0.35) return palette.mid;
      return palette.weak;
    }
    return palette.mid;
  }
  // フォールバック（dim データなし）
  if (seg.count >= 3) return "rgba(99,102,241,0.78)";
  if (seg.count >= 2) return "rgba(79,70,229,0.68)";
  return "rgba(79,70,229,0.58)";
}

/** 弱い接続は点線 */
function strokeDash(seg: Segment): string | undefined {
  if (seg.dimAlignment != null && seg.dimAlignment < 0.35) return "3 3.5";
  return undefined;
}

/** ゾーンごとの矢印マーカー定義 */
const ARROW_MARKERS = [
  { id: "ring-arrow-rika",    fill: "rgba(37,99,235,1)"     },
  { id: "ring-arrow-bunkei",  fill: "rgba(202,138,4,1)"     },
  { id: "ring-arrow-art",     fill: "rgba(220,38,38,1)"     },
  { id: "ring-arrow-default", fill: "rgba(79,70,229,1)"     },
] as const;

/** 三角矢印（userSpaceOnUse）。底辺を ref にし、+x 側に先端 — 線は底辺で止め、先端は三角のみ */
const RING_ARROW_W = 2.05;
const RING_ARROW_H = 1.78;
const RING_ARROW_RY = RING_ARROW_H / 2;
const RING_ARROW_REF_X = 0;
const RING_ARROW_PATH = `M0,0 L${RING_ARROW_W},${RING_ARROW_RY} L0,${RING_ARROW_H} Z`;

/** 着地点 (tip) まで geometry は保ち、線の描画終点だけ矢印の奥行き分手前にする */
function lineEndBeforeArrowTip(
  x1: number, y1: number, tipX: number, tipY: number, arrowDepth: number,
): { x: number; y: number } {
  const dx = tipX - x1;
  const dy = tipY - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: tipX, y: tipY };
  const ux = dx / dist;
  const uy = dy / dist;
  const trim = Math.min(arrowDepth, Math.max(0, dist - 0.06));
  return { x: tipX - ux * trim, y: tipY - uy * trim };
}

function arrowMarkerId(zone: "rika" | "bunkei" | "art" | null | undefined): string {
  if (zone === "rika")   return "ring-arrow-rika";
  if (zone === "bunkei") return "ring-arrow-bunkei";
  if (zone === "art")    return "ring-arrow-art";
  return "ring-arrow-default";
}

function RingLinesSvg({ segments }: { segments: Segment[] }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      overflow="visible"
      aria-hidden
    >
      <defs>
        {/* 矢印: ref = 底辺中央。線は底辺まで、先端は三角のみ */}
        {ARROW_MARKERS.map(({ id, fill }) => (
          <marker
            key={id}
            id={id}
            markerWidth={RING_ARROW_W}
            markerHeight={RING_ARROW_H}
            refX={RING_ARROW_REF_X}
            refY={RING_ARROW_RY}
            orient="auto"
            markerUnits="userSpaceOnUse"
            overflow="visible"
          >
            <path d={RING_ARROW_PATH} fill={fill} />
          </marker>
        ))}
      </defs>
      {segments.map((it, idx) => {
        // outgoing: center→ring
        // incoming: ring→center に反転
        const isIncoming = it.isOutgoing === false;
        const x1 = isIncoming ? it.x2 : it.x1;
        const y1 = isIncoming ? it.y2 : it.y1;
        const x2Tip = isIncoming ? it.x1 : it.x2;
        const y2Tip = isIncoming ? it.y1 : it.y2;
        const end = lineEndBeforeArrowTip(x1, y1, x2Tip, y2Tip, RING_ARROW_W);
        const w = strokeWidth(it);
        return (
          <line
            key={idx}
            x1={x1} y1={y1} x2={end.x} y2={end.y}
            stroke={strokeColor(it)}
            strokeWidth={w}
            strokeLinecap="butt"
            strokeDasharray={strokeDash(it)}
            vectorEffect="nonScalingStroke"
            markerEnd={`url(#${arrowMarkerId(it.dimZone)})`}
          />
        );
      })}
    </svg>
  );
}

type LabelItem = {
  key: string;
  synapseId: string;
  leftPct: number;
  topPct: number;
  label: string;
  description: string;
  sourceUrl: string;
  targetUrl: string;
  synapse: SynapseRow;
};

function RingKeywordLabels({
  items, onKeywordNoteClick, hoveredSynapseId, onHoverChange,
}: {
  items: LabelItem[];
  onKeywordNoteClick: (payload: { keyword: string; description: string; sourceUrl: string; targetUrl: string; synapse: SynapseRow }) => void;
  hoveredSynapseId: string | null;
  onHoverChange: (id: string | null) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {items.map((it) => {
        const isHovered = it.synapseId === hoveredSynapseId;
        return (
          <button
            key={it.key}
            type="button"
            lang="ja"
            title="クリックで接続の理由（全文）を表示"
            className={[
              "pointer-events-auto absolute min-w-[110px] max-w-[min(30vw,140px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-2xl border border-indigo-200/60 bg-white/65 px-2 py-0.5 text-center text-[11px] font-medium leading-tight text-indigo-700 shadow-sm backdrop-blur-[3px] transition hover:border-indigo-300 hover:bg-white/95 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
              isHovered ? "z-50 border-indigo-300 bg-white/95 shadow-md" : "z-30",
            ].join(" ")}
            style={{ left: `${it.leftPct}%`, top: `${it.topPct}%` }}
            onMouseEnter={() => onHoverChange(it.synapseId)}
            onMouseLeave={() => onHoverChange(null)}
            onFocus={() => onHoverChange(it.synapseId)}
            onBlur={() => onHoverChange(null)}
            onClick={(e) => { e.stopPropagation(); onKeywordNoteClick({ keyword: it.label, description: it.description, sourceUrl: it.sourceUrl, targetUrl: it.targetUrl, synapse: it.synapse }); }}
          >
            <span className="line-clamp-3 min-w-0 whitespace-pre-line leading-snug">
              <EdgeKeywordInnerText keyword={it.label} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 線分が中心ヒーロー矩形を通過するか（Liang–Barsky） */
function segmentCrossesHub(x1: number, y1: number, x2: number, y2: number, hub: PctRect): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let tMin = 0, tMax = 1;
  if (dx !== 0) {
    const t1 = (hub.l - x1) / dx, t2 = (hub.r - x1) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (x1 < hub.l || x1 > hub.r) return false;
  if (dy !== 0) {
    const t1 = (hub.t - y1) / dy, t2 = (hub.b - y1) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (y1 < hub.t || y1 > hub.b) return false;
  return tMin <= tMax + 1e-9;
}

function CrossLinesSvg({ segments }: { segments: Segment[] }) {
  if (segments.length === 0) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      overflow="visible"
      aria-hidden
    >
      <defs>
        <marker
          id="cross-arrow"
          markerWidth={RING_ARROW_W}
          markerHeight={RING_ARROW_H}
          refX={RING_ARROW_REF_X}
          refY={RING_ARROW_RY}
          orient="auto"
          markerUnits="userSpaceOnUse"
          overflow="visible"
        >
          <path d={RING_ARROW_PATH} fill="rgba(79,70,229,0.82)" />
        </marker>
      </defs>
      {segments.map((it, idx) => {
        const end = lineEndBeforeArrowTip(it.x1, it.y1, it.x2, it.y2, RING_ARROW_W);
        return (
          <line
            key={idx}
            x1={it.x1} y1={it.y1} x2={end.x} y2={end.y}
            stroke="rgba(79,70,229,0.55)"
            strokeWidth="0.72"
            strokeLinecap="butt"
            strokeDasharray="1.5 2"
            vectorEffect="nonScalingStroke"
            markerEnd="url(#cross-arrow)"
          />
        );
      })}
    </svg>
  );
}

function RingConnectOverlay({ ringEdges, synapses, focusUrl, onKeywordNoteClick, gridLayout, hoveredSynapseId, onHoverChange }: {
  ringEdges: Array<RingEdge | null>;
  synapses: SynapseRow[];
  focusUrl: string;
  onKeywordNoteClick: (payload: { keyword: string; description: string; sourceUrl: string; targetUrl: string; synapse: SynapseRow }) => void;
  /** null の間はギャップ無し4等分で近似（初回フレーム） */
  gridLayout: RingGridLayout | null;
  hoveredSynapseId: string | null;
  onHoverChange: (id: string | null) => void;
}) {
  const lw = gridLayout?.w ?? 100;
  const lh = gridLayout?.h ?? 100;
  const lgx = gridLayout?.gapX ?? 0;
  const lgy = gridLayout?.gapY ?? 0;

  const { segments, crossSegments, labels, outerSegments, outerLabels } = useMemo(() => {
    const L: RingGridLayout = { w: lw, h: lh, gapX: lgx, gapY: lgy };
    const segs: Segment[] = [];
    const labs: LabelItem[] = [];
    const outerSegs: Segment[] = [];
    const outerLabs: LabelItem[] = [];
    const hub = hubRectPct(L);
    const focusNormLocal = normalizeSynapseEndpoint(focusUrl);
    // リングセルが占有している URL の集合（リング外判定用）
    const ringUrls = new Set<string>();
    for (const e of ringEdges) {
      if (!e) continue;
      ringUrls.add(normalizeSynapseEndpoint(e.previewUrl));
    }

    RING_GRID_POS.forEach((pos, i) => {
      const edge = ringEdges[i] ?? null;
      if (!edge) return;
      // 2ホップ目のセルは中心からの線を引かない
      if (edge.isSecondHop) return;
      const [row, col] = pos;
      const geo = computeEdgeGeometry(row, col, edge.count, L, edge.isOutgoing);
      const sd = synapseToDims(edge.synapse);
      const zone = sd ? getDominantDim(sd) : null;
      const dimZone = (zone === "balanced" || zone === null) ? null : zone;
      segs.push({ ...geo.innerSeg, dimAlignment: edge.dimAlignment, dimZone, isOutgoing: edge.isOutgoing });
      const label = pickEdgeKeyword(edge.synapse);
      if (label) {
        const base = {
          label,
          description: edge.synapse.description ?? "",
          sourceUrl: edge.synapse.source_url,
          targetUrl: edge.synapse.target_url,
          synapse: edge.synapse,
        };
        labs.push({ key: `inner-${edge.synapse.id}-${i}`, synapseId: edge.synapse.id, leftPct: geo.innerLabelMid.x, topPct: geo.innerLabelMid.y, ...base });
      }
    });

    // リング外マス同士の接続線（点線）
    const crossSegs: Segment[] = [];
    const insetAlong = (edgeInsetPct(L).ix + edgeInsetPct(L).iy) / 2;
    for (let i = 0; i < 12; i++) {
      for (let j = i + 1; j < 12; j++) {
        const ei = ringEdges[i];
        const ej = ringEdges[j];
        if (!ei || !ej) continue;
        const urlI = normalizeSynapseEndpoint(ei.previewUrl);
        const urlJ = normalizeSynapseEndpoint(ej.previewUrl);
        const connected = synapses.some((s) => {
          const srcN = normalizeSynapseEndpoint(s.source_url);
          const tgtN = normalizeSynapseEndpoint(s.target_url);
          return (srcN === urlI && tgtN === urlJ) || (srcN === urlJ && tgtN === urlI);
        });
        if (connected) {
          const [ri, ci] = RING_GRID_POS[i]!;
          const [rj, cj] = RING_GRID_POS[j]!;
          const pi = cellCenterPct(ri, ci, L);
          const pj = cellCenterPct(rj, cj, L);
          const ddx = pj.x - pi.x;
          const ddy = pj.y - pi.y;
          const dlen = Math.hypot(ddx, ddy) || 1;
          const vx = ddx / dlen;
          const vy = ddy / dlen;
          const Ri = cellRectPct(ci, ri, L);
          const Rj = cellRectPct(cj, rj, L);
          const edgeI = rayExitRect(pi.x, pi.y, pj.x, pj.y, Ri.l, Ri.t, Ri.r, Ri.b);
          const edgeJ = rayExitRect(pj.x, pj.y, pi.x, pi.y, Rj.l, Rj.t, Rj.r, Rj.b);
          const ix = edgeI.x + vx * insetAlong;
          const iy = edgeI.y + vy * insetAlong;
          const jx = edgeJ.x - vx * insetAlong;
          const jy = edgeJ.y - vy * insetAlong;
          if (segmentCrossesHub(ix, iy, jx, jy, hub)) continue;
          crossSegs.push({ x1: ix, y1: iy, x2: jx, y2: jy, count: 1 });
        }
      }
    }

    // リング外への延長：各リングセルから、focus / 他リングセル以外の隣接ノードへ
    //   → outer 線 + 矢印 + キーワードラベル
    // ring cell が持つ outgoing/incoming を最大 OUTER_MAX_PER_CELL 本まで放射状に描画
    const OUTER_MAX_PER_CELL = 3;
    const OUTER_FAN_STEP_RAD = (22 * Math.PI) / 180; // 隣り合う線の角度差
    for (let i = 0; i < 12; i++) {
      const ei = ringEdges[i];
      if (!ei) continue;
      const ringNorm = normalizeSynapseEndpoint(ei.previewUrl);
      // ring セルからリング外への接続候補を全件収集（other URL で重複除去）
      const candidates: Array<{ synapse: SynapseRow; otherUrl: string; isOutgoing: boolean }> = [];
      const seenOther = new Set<string>();
      for (const s of synapses) {
        const srcN = normalizeSynapseEndpoint(s.source_url);
        const tgtN = normalizeSynapseEndpoint(s.target_url);
        let other: string | null = null;
        let otherUrlRaw: string | null = null;
        let isOut = true;
        if (srcN === ringNorm) { other = tgtN; otherUrlRaw = s.target_url; isOut = true; }
        else if (tgtN === ringNorm) { other = srcN; otherUrlRaw = s.source_url; isOut = false; }
        else continue;
        if (!other) continue;
        if (other === focusNormLocal) continue; // hub
        if (ringUrls.has(other)) continue;      // 同一リング内
        if (seenOther.has(other)) continue;
        seenOther.add(other);
        candidates.push({ synapse: s, otherUrl: otherUrlRaw!, isOutgoing: isOut });
        if (candidates.length >= OUTER_MAX_PER_CELL) break;
      }
      if (candidates.length === 0) continue;
      const [row, col] = RING_GRID_POS[i]!;
      // 角度オフセット：中央寄せで均等分散（[-(n-1)/2 .. +(n-1)/2] * STEP）
      const n = candidates.length;
      candidates.forEach((chosen, k) => {
        const angleOffset = (k - (n - 1) / 2) * OUTER_FAN_STEP_RAD;
        const ext = computeOuterExtension(row, col, L, angleOffset);
        const sd = synapseToDims(chosen.synapse);
        const zone = sd ? getDominantDim(sd) : null;
        const dimZone = (zone === "balanced" || zone === null) ? null : zone;
        outerSegs.push({
          x1: ext.ringX, y1: ext.ringY,
          x2: ext.outX,  y2: ext.outY,
          count: 1,
          dimAlignment: null,
          dimZone,
          isOutgoing: chosen.isOutgoing,
        });
        const label = pickEdgeKeyword(chosen.synapse);
        if (label) {
          outerLabs.push({
            key: `outer-${chosen.synapse.id}-${i}-${k}`,
            synapseId: chosen.synapse.id,
            leftPct: ext.labelX,
            topPct: ext.labelY,
            label,
            description: chosen.synapse.description ?? "",
            sourceUrl: chosen.synapse.source_url,
            targetUrl: chosen.synapse.target_url,
            synapse: chosen.synapse,
          });
        }
      });
    }

    return { segments: segs, crossSegments: crossSegs, labels: labs, outerSegments: outerSegs, outerLabels: outerLabs };
  }, [ringEdges, synapses, focusUrl, lw, lh, lgx, lgy]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[20] min-h-0 min-w-0">
      <RingLinesSvg segments={segments} />
      <CrossLinesSvg segments={crossSegments} />
      <RingLinesSvg segments={outerSegments} />
      <RingKeywordLabels items={labels} onKeywordNoteClick={onKeywordNoteClick} hoveredSynapseId={hoveredSynapseId} onHoverChange={onHoverChange} />
      <RingKeywordLabels items={outerLabels} onKeywordNoteClick={onKeywordNoteClick} hoveredSynapseId={hoveredSynapseId} onHoverChange={onHoverChange} />
    </div>
  );
}

// ── グローバルマップ（グリッドベース） ─────────────────────────────────────

/**
 * 全体マップのグリッドサイズ。
 * リングビュー 4×4 の約3倍スケール。コンテンツが増えたら増やせる。
 */
const GLOBAL_COLS = 12;
const GLOBAL_ROWS = 9;

/** BFS 1ステップあたりのグリッド移動量（セル数） */
const GLOBAL_STEP = 2;

/**
 * シナプスの次元から「広がり方向」を計算。
 * 三角形極を使ってリングビューと同じ方向感を再現する。
 *   理系 → 右・やや上 (+col / -row)
 *   文系 → 左・やや上 (-col / -row)
 *   芸術 → 下・中央  (+row)
 * 返値は [-1,+1] 正規化済みの (dx, dy)。
 */
function synapseToBfsDir(dims: DimProfile): { dx: number; dy: number } {
  const raw = nodeGlobalScreenXY(dims); // x: rika-bunkei, y: art寄りで下
  const mag = Math.sqrt(raw.x * raw.x + raw.y * raw.y);
  if (mag < 0.5) return { dx: 1, dy: 0 }; // balanced → 右へデフォルト
  return { dx: raw.x / mag, dy: raw.y / mag };
}

/**
 * 8方向のセクター（[dr, dc] × GLOBAL_STEP）。
 * 各親ノードの子は必ず異なるセクターに割り当てる → 線が他カードを突き抜けない。
 */
const BFS_SECTORS: readonly [dr: number, dc: number][] = [
  [ 0,             GLOBAL_STEP],  // E    0°
  [-GLOBAL_STEP,   GLOBAL_STEP],  // NE  -45°
  [-GLOBAL_STEP,   0          ],  // N   -90°
  [-GLOBAL_STEP,  -GLOBAL_STEP],  // NW -135°
  [ 0,            -GLOBAL_STEP],  // W  ±180°
  [ GLOBAL_STEP,  -GLOBAL_STEP],  // SW  135°
  [ GLOBAL_STEP,   0          ],  // S    90°
  [ GLOBAL_STEP,   GLOBAL_STEP],  // SE   45°
] as const;

/** セクターごとの代表角（ラジアン、y軸下向き） */
const BFS_SECTOR_ANGLES: readonly number[] = BFS_SECTORS.map(([dr, dc]) => Math.atan2(dr, dc));

/** dims から最も近いセクターインデックスを返す */
function preferredSector(dims: DimProfile | null): number {
  if (!dims) return 0; // デフォルト E
  const { dx, dy } = synapseToBfsDir(dims);
  const angle = Math.atan2(dy, dx);
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < BFS_SECTOR_ANGLES.length; i++) {
    const d = angleDiffRad(angle, BFS_SECTOR_ANGLES[i]);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}

/**
 * フォーカスを中心としたBFS拡散レイアウト（扇形分散付き）。
 *
 * 各ノードの子を 8方向セクターに一意割り当て:
 *   1. 全子を収集 → 理想セクター順にソート
 *   2. 貪欲法で最近傍の空きセクターを割り当て
 *   3. 同一セクターへの重複配置を防ぐ
 *
 * → 同一親から出る線が扇状に広がり、他カードを突き抜けにくくなる。
 */
function computeBfsLayout(
  focusNorm: string,
  nodeNorms: readonly string[],
  normToUrl: Map<string, string>,
  synapses: SynapseRow[],
  occupied: Set<string>,
  normToGridPos: Map<string, [number, number]>,
  nodeGrid: Map<string, { norm: string; url: string }>,
): void {
  const centerRow = Math.floor(GLOBAL_ROWS / 2);
  const centerCol = Math.floor(GLOBAL_COLS / 2);

  function place(norm: string, row: number, col: number) {
    const [r, c] = findEmptyGridCell(row, col, occupied);
    const key = `${r},${c}`;
    occupied.add(key);
    normToGridPos.set(norm, [r, c]);
    const url = normToUrl.get(norm) ?? norm;
    nodeGrid.set(key, { norm, url });
  }

  // フォーカスを中心に配置
  place(focusNorm, centerRow, centerCol);

  const visited = new Set<string>([focusNorm]);
  const queue: string[] = [focusNorm];

  while (queue.length > 0) {
    const norm = queue.shift()!;
    const [parentRow, parentCol] = normToGridPos.get(norm)!;

    // ── 1. 未訪問の子を全収集 ──────────────────────────────────────────
    const children: Array<{ childNorm: string; dims: DimProfile | null }> = [];
    for (const s of synapses) {
      const srcN = normalizeSynapseEndpoint(s.source_url);
      const tgtN = normalizeSynapseEndpoint(s.target_url);
      let childNorm: string | null = null;
      if (srcN === norm && !visited.has(tgtN)) childNorm = tgtN;
      else if (tgtN === norm && !visited.has(srcN)) childNorm = srcN;
      if (!childNorm) continue;
      visited.add(childNorm); // 先に mark して他の親から重複収集されないようにする
      children.push({ childNorm, dims: synapseToDims(s) });
    }

    if (children.length === 0) continue;

    // ── 2. 理想セクター順にソートして貪欲割り当て ────────────────────
    children.sort((a, b) => preferredSector(a.dims) - preferredSector(b.dims));

    const usedSectors = new Set<number>();
    for (const { childNorm, dims } of children) {
      const preferred = preferredSector(dims);

      // 最近傍の空きセクターを探す
      let bestSector = preferred;
      let bestDiff = Infinity;
      for (let i = 0; i < BFS_SECTOR_ANGLES.length; i++) {
        if (usedSectors.has(i)) continue;
        const diff = angleDiffRad(BFS_SECTOR_ANGLES[preferred], BFS_SECTOR_ANGLES[i]);
        if (diff < bestDiff) { bestDiff = diff; bestSector = i; }
      }
      usedSectors.add(bestSector);

      const [dr, dc] = BFS_SECTORS[bestSector];
      const targetRow = Math.max(0, Math.min(GLOBAL_ROWS - 1, parentRow + dr));
      const targetCol = Math.max(0, Math.min(GLOBAL_COLS - 1, parentCol + dc));
      place(childNorm, targetRow, targetCol);
      queue.push(childNorm);
    }
  }

  // 未訪問ノード（非連結成分）: 中央付近に集める
  for (const norm of nodeNorms) {
    if (!normToGridPos.has(norm)) {
      place(norm, centerRow, centerCol);
    }
  }
}

/** 占有セットを見ながら最近傍の空きセルをスパイラル探索 */
function findEmptyGridCell(
  targetRow: number, targetCol: number,
  occupied: Set<string>,
): [number, number] {
  if (!occupied.has(`${targetRow},${targetCol}`)) return [targetRow, targetCol];
  for (let r = 1; r <= Math.max(GLOBAL_ROWS, GLOBAL_COLS); r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.abs(dr) !== r && Math.abs(dc) !== r) continue;
        const nr = targetRow + dr;
        const nc = targetCol + dc;
        if (nr < 0 || nr >= GLOBAL_ROWS || nc < 0 || nc >= GLOBAL_COLS) continue;
        if (!occupied.has(`${nr},${nc}`)) return [nr, nc];
      }
    }
  }
  return [targetRow, targetCol];
}

/** 全体マップの1セル（OGP画像サムネイル付きカード） */
function MapGridCell({
  url, isFocus, onPick,
}: {
  url: string;
  isFocus: boolean;
  onPick: () => void;
}) {
  const [data, setData] = useState<{ title: string | null; imageUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancel = false;
    const hit = ogpMiniCache.get(url);
    if (hit) { setData(hit); setLoading(false); return; }
    setLoading(true);
    void fetchOgpMiniPayload(url)
      .then((o) => { if (!cancel) { setData(o ?? { title: null, imageUrl: null }); setLoading(false); } })
      .catch(() => { if (!cancel) { setData({ title: null, imageUrl: null }); setLoading(false); } });
    return () => { cancel = true; };
  }, [url]);

  const displayTitle = resolveContentDisplayTitle(data?.title ?? null, url).slice(0, 28);
  const showImage = !imgError && !!data?.imageUrl;

  return (
    <div
      onClick={onPick}
        className={[
        "relative flex h-full w-full cursor-pointer select-none flex-col overflow-hidden rounded-lg transition-transform duration-100 hover:scale-105 hover:z-10",
        isFocus
          ? "border-2 border-indigo-500 bg-zinc-900 shadow-lg ring-2 ring-indigo-400/40"
          : "border border-zinc-700/50 bg-zinc-900/80 shadow-sm hover:border-zinc-500/60",
        ].join(" ")}
      >
      {/* 画像エリア */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <OgpTileMedia
          pageUrl={url}
          imageUrl={showImage ? data!.imageUrl : null}
          slot="gridMini"
          loading={loading}
          onError={() => setImgError(true)}
        />
        {isFocus && (
          <div className="pointer-events-none absolute inset-0 bg-indigo-500/8" />
        )}
        <ContentPlatformMark pageUrl={url} />
      </div>
      {/* タイトル */}
      <p className="shrink-0 line-clamp-2 px-1 py-0.5 text-center text-[7px] leading-tight text-zinc-300">
        {displayTitle || url.split("/")[2]}
      </p>
      </div>
    );
}

export function GlobalMapSvg({ focusUrl, synapses, onFocusUrl }: Props) {
  const focusNorm = useMemo(() => normalizeSynapseEndpoint(focusUrl), [focusUrl]);

  // ドラッグで pan
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const didDragRef = useRef(false);

  const onPanMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    didDragRef.current = false;
    setDragStart({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y });
  }, [pan.x, pan.y]);

  useEffect(() => {
    if (!dragStart) return;
    const DRAG_THRESHOLD = 5;
    const move = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (!didDragRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        didDragRef.current = true;
      }
      setPan({ x: dragStart.px + dx, y: dragStart.py + dy });
    };
    const up = () => setDragStart(null);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [dragStart]);

  // drag だった場合は子の click を抑制（capture phase で stopPropagation）
  const onPanClickCapture = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.stopPropagation();
      e.preventDefault();
      didDragRef.current = false;
    }
  }, []);

  // 全ユニークノード
  const nodeNorms = useMemo(() => {
    const set = new Set<string>();
    for (const s of synapses) {
      set.add(normalizeSynapseEndpoint(s.source_url));
      set.add(normalizeSynapseEndpoint(s.target_url));
    }
    return [...set];
  }, [synapses]);

  // norm → 代表URL
  const normToUrl = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of synapses) {
      const sn = normalizeSynapseEndpoint(s.source_url);
      const tn = normalizeSynapseEndpoint(s.target_url);
      if (!m.has(sn)) m.set(sn, s.source_url);
      if (!m.has(tn)) m.set(tn, s.target_url);
    }
    return m;
  }, [synapses]);

  /**
   * BFS 拡散レイアウト:
   *   normToGridPos: norm → [row, col]
   *   nodeGrid: "row,col" → { norm, url }
   * focusNorm が変わると中心が変わり、グラフが再拡散する。
   */
  const { normToGridPos, nodeGrid } = useMemo(() => {
    const occupied = new Set<string>();
    const nToG = new Map<string, [number, number]>();
    const grid = new Map<string, { norm: string; url: string }>();
    computeBfsLayout(focusNorm, nodeNorms, normToUrl, synapses, occupied, nToG, grid);
    return { normToGridPos: nToG, nodeGrid: grid };
  }, [focusNorm, nodeNorms, normToUrl, synapses]);

  // グリッド全セルを生成
  const cells: ReactNode[] = [];
  for (let r = 0; r < GLOBAL_ROWS; r++) {
    for (let c = 0; c < GLOBAL_COLS; c++) {
      const key = `${r},${c}`;
      const node = nodeGrid.get(key);
      if (node) {
        cells.push(
          <div key={key} className="relative min-h-0 min-w-0 p-0.5 sm:p-1">
            <MapGridCell
              url={node.url}
              isFocus={node.norm === focusNorm}
              onPick={() => { onFocusUrl(node.url); }}
            />
          </div>,
        );
      } else {
        // 空セル: リングビューの未使用スロットと同じ淡いボックス
        cells.push(
          <div key={key} className="min-h-0 min-w-0 rounded-md border border-zinc-200/20 bg-zinc-100/5 sm:rounded-lg" />,
        );
      }
    }
  }

    return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-1 sm:p-2"
      onMouseDown={onPanMouseDown}
      onClickCapture={onPanClickCapture}
      style={{ cursor: dragStart ? "grabbing" : "grab", touchAction: "none" }}
    >
      {/* グリッドコンテナ（アスペクト比固定）*/}
      <div
        className="relative w-full"
        style={{
          aspectRatio: `${GLOBAL_COLS} / ${GLOBAL_ROWS}`,
          maxHeight: "86vh",
          maxWidth: `${(GLOBAL_COLS / GLOBAL_ROWS) * 86}vh`,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          willChange: "transform",
        }}
      >
        {/* CSS グリッド */}
        <div
          className="relative grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${GLOBAL_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${GLOBAL_ROWS}, 1fr)`,
            gap: "2px",
          }}
        >
          {cells}
      </div>

        {/* 接続線 SVG オーバーレイ
            ・斜め線なし: L字形ルート（水平→垂直 または 垂直→水平）
            ・同一ノードから複数線が出るとき: 平行オフセットで重ならない
        */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${GLOBAL_COLS} ${GLOBAL_ROWS}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {(() => {
            return synapses.map((s) => {
              const sn = normalizeSynapseEndpoint(s.source_url);
              const tn = normalizeSynapseEndpoint(s.target_url);
              const srcPos = normToGridPos.get(sn);
              const tgtPos = normToGridPos.get(tn);
              if (!srcPos || !tgtPos) return null;
              const [sr, sc] = srcPos;
              const [tr, tc] = tgtPos;

              // 色: シナプス次元
              const sd = synapseToDims(s);
              const zone = sd ? getDominantDim(sd) : "balanced";
              const stroke =
                zone === "rika"   ? "rgba(59,130,246,0.55)" :
                zone === "bunkei" ? "rgba(234,179,8,0.60)"  :
                zone === "art"    ? "rgba(239,68,68,0.55)"  :
                "rgba(99,102,241,0.40)";

              // 直線（セル中央 → セル中央）
              const x1 = sc + 0.5;
              const y1 = sr + 0.5;
              const x2 = tc + 0.5;
              const y2 = tr + 0.5;

    return (
                <line
                  key={s.id}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke}
                  strokeWidth="0.07"
                  strokeLinecap="round"
                />
              );
            });
          })()}
        </svg>

        {/* キーワードラベル HTML オーバーレイ（line midpoint 配置） */}
        <div className="pointer-events-none absolute inset-0">
          {synapses.map((s) => {
            const sn = normalizeSynapseEndpoint(s.source_url);
            const tn = normalizeSynapseEndpoint(s.target_url);
            const srcPos = normToGridPos.get(sn);
            const tgtPos = normToGridPos.get(tn);
            if (!srcPos || !tgtPos) return null;
            const label = pickEdgeKeyword(s);
            if (!label) return null;
            const [sr, sc] = srcPos;
            const [tr, tc] = tgtPos;
            const midColPct = (((sc + tc) / 2 + 0.5) / GLOBAL_COLS) * 100;
            const midRowPct = (((sr + tr) / 2 + 0.5) / GLOBAL_ROWS) * 100;
            return (
              <div
                key={s.id}
                className="absolute max-w-[140px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-indigo-200/60 bg-white/75 px-2 py-0.5 text-center text-[10px] font-medium leading-tight text-indigo-700 shadow-sm backdrop-blur-[2px]"
                style={{ left: `${midColPct}%`, top: `${midRowPct}%` }}
              >
                <span className="line-clamp-2 break-words">{label}</span>
              </div>
            );
          })}
        </div>

        {/* 軸ラベル（グリッド隅に小さく） */}
        <span className="pointer-events-none absolute left-1 top-1 select-none text-[9px] font-semibold text-amber-500/70">文系</span>
        <span className="pointer-events-none absolute right-1 top-1 select-none text-[9px] font-semibold text-blue-500/70">理系</span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 select-none text-[9px] font-semibold text-rose-500/70">芸術</span>
        </div>
      </div>
    );
  }

// ── メイン ───────────────────────────────────────────────────────────────────

export function FocusCompass({ focusUrl, synapses, onFocusUrl }: Props) {
  const [viewMode, setViewMode] = useState<"ring" | "map">("ring");
  const ringGridRef = useRef<HTMLDivElement>(null);
  const [ringGridLayout, setRingGridLayout] = useState<RingGridLayout | null>(null);
  const [ogp, setOgp] = useState<{ title: string | null; imageUrl: string | null; description: string | null; siteName: string | null } | null>(null);
  const [ogpLoading, setOgpLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [keywordNote, setKeywordNote] = useState<{ keyword: string; description: string; sourceUrl: string; targetUrl: string; synapse?: SynapseRow } | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hoveredSynapseId, setHoveredSynapseId] = useState<string | null>(null);

  // アクセストークン取得（ログイン状態の監視）
  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // リングセルキャッシュがあれば即座に表示（フォーカス切替アニメ中のちらつき防止）
    const cached = ogpMiniCache.get(focusUrl);
    if (cached?.title || cached?.imageUrl) {
      setOgp({ title: cached.title, imageUrl: cached.imageUrl, description: null, siteName: null });
      setOgpLoading(false);
      setImgError(false);
    } else {
      setOgpLoading(true); setImgError(false); setOgp(null);
    }
    async function loadFocusOgp(refresh: boolean) {
      const qs = new URLSearchParams({ url: focusUrl });
      if (refresh) qs.set("refresh", "1");
      const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
      const data = (await r.json()) as { error?: string; title?: string | null; imageUrl?: string | null; description?: string | null; siteName?: string | null };
      if (cancelled) return;
      if (data.error) { setOgp(null); return; }
      setOgp({ title: data.title ?? null, imageUrl: data.imageUrl ?? null, description: data.description ?? null, siteName: data.siteName ?? null });
      const label = resolveContentDisplayTitle(data.title ?? null, focusUrl);
      if (!refresh && (isWeakContentTitleLabel(label, focusUrl) || !(data.imageUrl ?? "").trim())) {
        await loadFocusOgp(true);
      }
    }
    void loadFocusOgp(false).catch(() => { if (!cancelled) setOgp(null); }).finally(() => { if (!cancelled) setOgpLoading(false); });
    return () => { cancelled = true; };
  }, [focusUrl]);

  useEffect(() => { setDetailOpen(false); setKeywordNote(null); setDescExpanded(false); }, [focusUrl]);

  useLayoutEffect(() => {
    if (viewMode !== "ring") {
      setRingGridLayout(null);
      return;
    }
    const el = ringGridRef.current;
    if (!el) return;
    const read = () => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const gapX = parseFloat(cs.columnGap) || 0;
      const gapY = parseFloat(cs.rowGap) || 0;
      if (rect.width < 1 || rect.height < 1) return;
      setRingGridLayout({ w: rect.width, h: rect.height, gapX, gapY });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, [viewMode, focusUrl]);

  useEffect(() => {
    if (!detailOpen && !keywordNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (keywordNote) setKeywordNote(null); else setDetailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, keywordNote]);

  const focusNorm = useMemo(() => normalizeSynapseEndpoint(focusUrl), [focusUrl]);

  const outgoingSynapses = useMemo(() =>
    sortSynapsesForRing(synapses.filter((s) => normalizeSynapseEndpoint(s.source_url) === focusNorm)),
  [focusNorm, synapses]);

  const incomingSynapsesRaw = useMemo(() =>
    sortSynapsesForRing(synapses.filter((s) => normalizeSynapseEndpoint(s.target_url) === focusNorm)),
  [focusNorm, synapses]);

  const ringEdges = useMemo(() => {
    const cells: Array<RingEdge | null> = Array.from({ length: 12 }, () => null);

    // フォーカスプロファイル（dimAlignment計算用）
    const focusDims = computeFocusDimProfile(focusNorm, synapses);
    // フォーカスのグローバル座標（三角形空間）
    const focusXY = focusDims ? nodeGlobalScreenXY(focusDims) : null;

    // 直接接続（1ホップのみ）を収集
    const raw: RingEdge[] = [];
    for (const s of synapses) {
      const srcN = normalizeSynapseEndpoint(s.source_url);
      const tgtN = normalizeSynapseEndpoint(s.target_url);
      const sd = synapseToDims(s);
      const alignment = (focusDims && sd) ? computeDimAlignment(focusDims, sd) : null;
      if (srcN === focusNorm) raw.push({ synapse: s, previewUrl: s.target_url, pickUrl: s.target_url, isOutgoing: true, count: 1, dimAlignment: alignment });
      else if (tgtN === focusNorm) raw.push({ synapse: s, previewUrl: s.source_url, pickUrl: s.source_url, isOutgoing: false, count: 1, dimAlignment: alignment });
    }
    const deduped = dedupeRingEdges(raw);

    /**
     * 三角形グローバルマップ準拠のリング配置
     *
     * 「作品のグローバル座標（workPotential）」の相対方向でセルを決める。
     * フォーカスが移動しても空間の向きが保たれる = スクロール感。
     *
     * フォールバック:
     *   - 作品の次元データなし → シナプス次元の方向を使用
     *   - シナプス次元もなし   → 右（0°）にフォールバック
     *
     * 線の色はシナプス次元（接続の性質）で決まる = 別レイヤー
     */
    type EdgeWithAngle = { edge: RingEdge; angle: number };
    const withAngle: EdgeWithAngle[] = [];

    for (const e of deduped) {
      const neighborNorm = normalizeSynapseEndpoint(e.previewUrl);
      const neighborProfile = computeNodeDimProfile(neighborNorm, synapses);

      let angle: number;

      if (focusXY && neighborProfile) {
        const neighborXY = nodeGlobalScreenXY(neighborProfile);
        const dx = neighborXY.x - focusXY.x;
        const dy = neighborXY.y - focusXY.y;
        if (Math.hypot(dx, dy) >= 0.01) {
          // グローバル空間での相対方向（= スクロール感の源泉）
          angle = Math.atan2(dy, dx);
        } else {
          // 座標がほぼ同じ → シナプス次元の方向をフォールバック
          const sd = synapseToDims(e.synapse);
          const sdXY = sd ? nodeGlobalScreenXY(sd) : null;
          angle = sdXY ? Math.atan2(sdXY.y, sdXY.x) : 0;
        }
      } else {
        // 作品次元データなし → シナプス次元の方向
        const sd = synapseToDims(e.synapse);
        const sdXY = sd ? nodeGlobalScreenXY(sd) : null;
        angle = sdXY ? Math.atan2(sdXY.y, sdXY.x) : 0;
      }

      withAngle.push({ edge: e, angle });
    }

    // dimAlignment 降順でソート（強い接続を好みの方向セルへ優先配置）
    withAngle.sort((a, b) => (b.edge.dimAlignment ?? -1) - (a.edge.dimAlignment ?? -1));

    // 貪欲に最近傍セルへ割り当て（衝突時は次に近いセルへ）
    const usedSlots = new Set<number>();
    for (const { edge, angle } of withAngle) {
      let bestCell = -1;
      let bestDiff = Infinity;
      RING_CELL_ANGLES.forEach((cellAngle, i) => {
        if (usedSlots.has(i)) return;
        const diff = angleDiffRad(angle, cellAngle);
        if (diff < bestDiff) { bestDiff = diff; bestCell = i; }
      });
      if (bestCell >= 0) {
        cells[bestCell] = edge;
        usedSlots.add(bestCell);
      }
    }

    return cells;
  }, [focusNorm, synapses]);

  const displayTitle = resolveContentDisplayTitle(ogp?.title ?? null, focusUrl);

  // フォーカスノードの「次元プロファイル」— 全接続シナプスのdim平均
  const focusDimProfile = useMemo(
    () => computeFocusDimProfile(focusNorm, synapses),
    [focusNorm, synapses],
  );

  const gridCells: ReactNode[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const isCenter = r >= 1 && r <= 2 && c >= 1 && c <= 2;
      if (isCenter && r === 1 && c === 1) {
        gridCells.push(
          <motion.div layoutId={`cell-${focusNorm}`} key="center" layout transition={{ type: "spring", stiffness: 380, damping: 36 }} className="relative z-10 col-span-2 row-span-2 flex min-h-0 min-w-0 items-stretch justify-stretch p-1 sm:p-1.5">
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              disabled={ogpLoading}
              className="relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border-2 border-indigo-200/80 bg-white text-left shadow-[0_4px_24px_rgba(99,102,241,0.1)] transition hover:border-indigo-300 hover:shadow-[0_6px_28px_rgba(99,102,241,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
            >
            {ogpLoading ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 py-3">
                <div className="min-h-0 w-full flex-1 animate-pulse rounded-lg bg-zinc-100" />
                <div className="h-3 w-3/4 shrink-0 rounded bg-zinc-100" />
              </div>
            ) : (
              <>
                  <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
                {ogp?.imageUrl && !imgError ? (
                      <OgpTileMedia pageUrl={focusUrl} imageUrl={ogp.imageUrl} slot="gridHero" loading={false} eager onError={() => setImgError(true)} />
                    ) : (
                      <div className="min-h-0 w-full flex-1 bg-zinc-100" />
                    )}
                    <ContentPlatformMark pageUrl={focusUrl} />
                  </div>
                  <div className="flex shrink-0 flex-col justify-center px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
                    <p className="line-clamp-2 text-center text-[11px] font-semibold leading-snug text-zinc-900 sm:text-xs md:text-sm">
                    {displayTitle}
                  </p>
                </div>
              </>
            )}
          </button>
        </motion.div>,
      );
      continue;
    }
      if (isCenter) continue;

      const ringIdx = RING_GRID_POS.findIndex(([rr, cc]) => rr === r && cc === c);
      const edge = ringIdx >= 0 ? (ringEdges[ringIdx] ?? null) : null;
      const edgeNorm = edge ? normalizeSynapseEndpoint(edge.previewUrl) : null;
      const gravity = edgeNorm ? computeNodeGravity(edgeNorm, focusNorm, synapses) : undefined;
      // 接続シナプスの次元スコア＋フォーカスとのアラインメント
      const synapseDims = edge ? synapseToDims(edge.synapse) : null;
      const dimAlignment = (focusDimProfile && synapseDims)
        ? computeDimAlignment(focusDimProfile, synapseDims)
        : null;
      // 作品ポテンシャル：そのノードに繋がる全シナプスのdim平均（接続が増えるほど精度向上）
      const workPotential = edgeNorm ? computeNodeDimProfile(edgeNorm, synapses) : null;
    gridCells.push(
      <motion.div
          key={edgeNorm ?? `e-${r}-${c}`}
          layoutId={edgeNorm ? `cell-${edgeNorm}` : undefined}
        layout
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="relative z-10 min-h-0 min-w-0 p-1.5 sm:p-2"
        >
          <OgpMiniCell
            synapse={edge?.synapse ?? null}
            previewUrl={edge?.previewUrl}
            pickUrl={edge?.pickUrl}
            dim={false}
            onPick={onFocusUrl}
            gravity={gravity}
            dimAlignment={dimAlignment}
            synapseDims={synapseDims}
            workPotential={workPotential}
            onHoverChange={setHoveredSynapseId}
          />
      </motion.div>,
    );
    }
  }

  // シナプスカードのレンダラ
  function SynapseCard({ s }: { s: SynapseRow }) {
    return (
      <li className="rounded-lg border border-zinc-200/90 bg-white/90 px-2.5 py-2 sm:px-3">
        <SynapseConnectionTitles synapse={s} focusNorm={focusNorm} />
        <p className="mb-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{s.description.trim() || "—"}</p>
        <div className="flex items-center justify-between gap-2">
          {s.keywords?.length ? (
            <p className="text-[10px] font-medium text-zinc-500">{s.keywords.slice(0, 6).join(" · ")}</p>
          ) : <span />}
          <LikeButton synapse={s} accessToken={accessToken} />
        </div>
      </li>
    );
  }

  return (
    <>
      {/* ビュー切替ボタン */}
      <div className="absolute right-3 top-3 z-50">
        <button
          type="button"
          onClick={() => setViewMode((m) => m === "ring" ? "map" : "ring")}
          className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 px-3 py-1.5 text-[10px] font-semibold text-zinc-600 shadow-sm backdrop-blur-sm transition hover:border-indigo-200 hover:text-indigo-700"
          title={viewMode === "ring" ? "全体マップを表示" : "リングビューに戻る"}
        >
          {viewMode === "ring" ? (
            <><span aria-hidden>◎</span> 全体マップ</>
          ) : (
            <><span aria-hidden>⊙</span> リングビュー</>
          )}
        </button>
      </div>

      {/* Galaxy grid / Global map */}
      <div className="relative h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {viewMode === "map" ? (
          <GlobalMapSvg focusUrl={focusUrl} synapses={synapses} onFocusUrl={onFocusUrl} />
        ) : (
          <div className="absolute inset-0 flex min-h-0 items-center justify-center">
            {/* 5:4 横長。リング外シナプス線＋ラベル分の余白を確保するため scale は控えめ */}
            <div
              className="relative min-h-0 w-full min-w-0 max-h-full shrink-0"
              style={{
                aspectRatio: "5 / 4",
                width: "min(82%, calc(100svh - 5rem))",
                transform: "scale(0.96)",
                transformOrigin: "center",
              }}
            >
              <div
                ref={ringGridRef}
                className="relative grid h-full min-h-0 w-full min-w-0 grid-cols-4 grid-rows-4 gap-x-10 gap-y-4 *:min-h-0 sm:gap-x-14 sm:gap-y-5 md:gap-x-16 md:gap-y-6"
              >
                {gridCells}
              </div>
              <RingConnectOverlay ringEdges={ringEdges} synapses={synapses} focusUrl={focusUrl} gridLayout={ringGridLayout} onKeywordNoteClick={(payload) => setKeywordNote(payload)} hoveredSynapseId={hoveredSynapseId} onHoverChange={setHoveredSynapseId} />
            </div>
          </div>
        )}
      </div>

      {/* フォーカス詳細モーダル */}
      <AnimatePresence>
        {detailOpen ? (
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
                {ogp?.imageUrl && !imgError ? (
                  <OgpTileMedia pageUrl={focusUrl} imageUrl={ogp.imageUrl} slot="modal" loading={false} eager onError={() => setImgError(true)} />
                ) : null}
                <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                  {ogp?.siteName ? <p className="text-[11px] font-medium text-indigo-600">{ogp.siteName}</p> : null}
                  <h2 id="focus-detail-title" className="text-base font-semibold leading-snug text-zinc-900 sm:text-lg">{displayTitle}</h2>
                  <a
                    href={withSynapseAffiliate(focusUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={[
                      "inline-flex w-fit items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                      isAmazonUrl(focusUrl)
                        ? "border border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100"
                        : "border border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300 hover:bg-indigo-100",
                    ].join(" ")}
                  >
                    {isAmazonUrl(focusUrl) ? "[amazon] で見る" : "ページを開く"} <span aria-hidden>↗</span>
                  </a>
                  <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">概要</h3>
                    {ogp?.description?.trim() ? (
                      <>
                        <div className={["relative overflow-hidden", descExpanded ? "" : "max-h-[5.5em]"].join(" ")}>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{ogp.description.trim()}</p>
                          {!descExpanded ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-zinc-50/95 to-transparent" />
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDescExpanded((v) => !v)}
                          className="mt-1.5 text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-700"
                        >
                          {descExpanded ? "閉じる" : "もっと読む"}
                        </button>
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed text-zinc-500">概要テキストを取得できませんでした。</p>
                    )}
                  </section>
                  {outgoingSynapses.length + incomingSynapsesRaw.length > 0 ? (
                    <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">シナプス</h3>
                      <ul className="space-y-3">
                        {outgoingSynapses.length > 0 ? (
                          <>
                            <li className="text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-400">出発点 →</li>
                            {outgoingSynapses.map((s) => <SynapseCard key={s.id} s={s} />)}
                          </>
                        ) : null}
                        {incomingSynapsesRaw.length > 0 ? (
                          <>
                            <li className={["text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400", outgoingSynapses.length > 0 ? "mt-4 pt-3 border-t border-zinc-200/70" : ""].join(" ")}>← 着地点</li>
                            {incomingSynapsesRaw.map((s) => <SynapseCard key={s.id} s={s} />)}
                          </>
                        ) : null}
                      </ul>
                    </section>
                  ) : null}
                  <p className="break-all text-[11px] leading-snug text-zinc-500">{focusUrl}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* キーワードノートモーダル */}
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
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
                <span id="keyword-note-title" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">キーワードの出典</span>
                <button type="button" onClick={() => setKeywordNote(null)} className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900">閉じる</button>
              </div>
              <ConnectionWorksLine
                sourceUrl={keywordNote.sourceUrl}
                targetUrl={keywordNote.targetUrl}
                focusUrl={focusUrl}
                onClickWork={(url) => {
                  setKeywordNote(null);
                  onFocusUrl(url);
                  window.setTimeout(() => setDetailOpen(true), 180);
                }}
              />
              <div id="keyword-note-body" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                <h2 className="text-sm font-semibold leading-snug text-indigo-900 sm:text-base">キーワード {keywordNote.keyword}</h2>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-3 sm:px-3.5 sm:py-3.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">つながりの理由</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{keywordNote.description.trim() || "（本文なし）"}</p>
                </div>
                {keywordNote.synapse ? (
                  <div className="flex items-center justify-between gap-2">
                    {keywordNote.synapse.user_id ? (
                      <a
                        href={`/user/${keywordNote.synapse.user_id}`}
                        className="text-[11px] font-medium text-indigo-600 transition hover:text-indigo-800 hover:underline"
                      >
                        投稿者を見る →
                      </a>
                    ) : <span />}
                    <LikeButton synapse={keywordNote.synapse} accessToken={accessToken} />
                  </div>
                ) : null}
                <p className="text-[11px] leading-relaxed text-zinc-500">このキーワードは投稿者が設定しました。</p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
