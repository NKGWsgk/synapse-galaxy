"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3-force";

import { isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { getEdgeKeywordRenderPlan } from "@/lib/edgeKeywordDisplay";
import { jaKeywordSoftBreakHints } from "@/lib/jaKeywordLineBreak";
import { ContentPlatformMark } from "@/components/galaxy/ContentPlatformMark";
import {
  contentPlatformDisplayName,
  detectContentPlatform,
  isMusicContentPlatform,
  type AllowedSynapsePlatform,
  type ContentPlatformId,
} from "@/lib/contentPlatform";
import type { SynapseRow } from "@/lib/supabase/clients";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { isAmazonUrl } from "@/lib/amazon";
import { withSynapseAffiliate } from "@/lib/synapseAffiliate";
import { createBrowserClient } from "@/lib/supabase/browser";
import {
  LikeButton,
  OgpTileMedia,
  SynapseConnectionTitles,
  ConnectionWorksLine,
  ConnectionWorksUrlsStrip,
  ogpMiniCache,
  fetchOgpMiniPayload,
  synapseToDims,
  computeNodeDimProfile,
  getDominantDim,
  nodeGlobalScreenXY,
  type DominantDim,
} from "./FocusCompass";

type Props = {
  focusUrl: string;
  synapses: SynapseRow[];
  onFocusUrl: (url: string) => void;
};

// ── Layout constants ─────────────────────────────────────────────────────────

/** Card rectangle dimensions (px in canvas coords) */
const CARD_W = 140;
const CARD_H = 110;

/** Collision radius — slightly larger than card half-diagonal to keep spacing */
const NODE_RADIUS = 92;

/** Link target distance — distance between connected nodes.
 *  Sized so 12 cards at 30° spacing don't overlap (tangential gap at 290 was
 *  marginal at diagonal angles) AND so a 2-line label fits along the spoke:
 *  visible line = LINK_DISTANCE - 2 * cardHalfW = 340 - 140 = 200px. */
const LINK_DISTANCE = 340;

/** Dim anchor radius. Direction is determined by the node's dim profile; distance
 *  is capped at LINK_DISTANCE so the dim force only nudges direction, never pushes
 *  nodes farther out than link force wants. */
const DIM_ANCHOR_RADIUS = LINK_DISTANCE;

/** Pole label scale (just for the background labels — these can sit further out
 *  to suggest "this side of the canvas leans rika/bunkei/art"). */
const POLE_LABEL_RADIUS = 520;

/** N-hop neighborhood cap */
const MAX_NODES = 60;

/** Pole label positions (px in canvas coords) */
const POLES = {
  rika:   { x:  POLE_LABEL_RADIUS * 1.0,  y: -POLE_LABEL_RADIUS * 0.5 },
  bunkei: { x: -POLE_LABEL_RADIUS * 1.0,  y: -POLE_LABEL_RADIUS * 0.5 },
  art:    { x:  0,                        y:  POLE_LABEL_RADIUS * 1.0 },
};

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;

/** +/−／100% UI など、画面中心を軸にしたズームの補間時間 */
const CAMERA_UI_SMOOTH_MS = 340;
/** フィット調整は少し長め */
const CAMERA_FIT_SMOOTH_MS = 520;

/** ツールバー ± は「初期100%」基準で 80/90/100… の 10% 刻み */
const ZOOM_DISPLAY_STEP_PCT = 10;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Wheel と同様に、「ビューポート中心にある世界座標」を保ったまま z0→z1 に変更する pan。
 */
function panForZoomTowardViewportCenter(
  z0: number,
  pan0: { x: number; y: number },
  z1: number,
  vw: number,
  vh: number,
): { x: number; y: number } {
  const cxw = vw / 2;
  const cyw = vh / 2;
  const sx = cxw;
  const sy = cyw;
  const worldX = (sx - pan0.x - cxw) / z0;
  const worldY = (sy - pan0.y - cyw) / z0;
  return {
    x: sx - cxw - worldX * z1,
    y: sy - cyw - worldY * z1,
  };
}

/** ベースズームに対する表示％を決めうちしたときの実倍率（clamp 済み）。 */
function zoomFromBaselineDisplayPercent(baselineZoom: number, displayPercent: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, baselineZoom * (displayPercent / 100)));
}

/** +1 は表示％を約 10% 上げ、−1 は下げる。baseline 未定時は倍率約±10%。 */
function zoomByDisplayPercentStep(
  direction: 1 | -1,
  z0: number,
  pan0: { x: number; y: number },
  baselineZoom: number | undefined,
  vw: number,
  vh: number,
): { z1: number; pan1: { x: number; y: number } } | null {
  if (!baselineZoom || baselineZoom <= 1e-9) {
    const mul = direction > 0 ? 1 + ZOOM_DISPLAY_STEP_PCT / 100 : 1 / (1 + ZOOM_DISPLAY_STEP_PCT / 100);
    const z1 = direction > 0
      ? Math.min(ZOOM_MAX, z0 * mul)
      : Math.max(ZOOM_MIN, z0 * mul);
    if (Math.abs(z1 - z0) < 1e-6) return null;
    return { z1, pan1: panForZoomTowardViewportCenter(z0, pan0, z1, vw, vh) };
  }
  const rawPct100 = (z0 / baselineZoom) * 100;
  const snapped = Math.round(rawPct100 / ZOOM_DISPLAY_STEP_PCT) * ZOOM_DISPLAY_STEP_PCT;
  const nextPct = snapped + direction * ZOOM_DISPLAY_STEP_PCT;
  const z1 = zoomFromBaselineDisplayPercent(baselineZoom, nextPct);
  if (Math.abs(z1 - z0) < 1e-6) return null;
  return { z1, pan1: panForZoomTowardViewportCenter(z0, pan0, z1, vw, vh) };
}

// ── Color & dominant-dim ─────────────────────────────────────────────────────

const DIM_STROKE: Record<DominantDim, string> = {
  rika:     "rgba(59,130,246,0.72)",
  bunkei:   "rgba(234,179,8,0.78)",
  art:      "rgba(244,63,94,0.72)",
  balanced: "rgba(99,102,241,0.55)",
};

const DIM_MARKER: Record<DominantDim, string> = {
  rika:     "#3b82f6",
  bunkei:   "#eab308",
  art:      "#f43f5e",
  balanced: "#6366f1",
};

// ── Graph construction ───────────────────────────────────────────────────────

type GraphNode = {
  norm: string;
  url: string; // canonical url to use when clicking (one of the endpoints)
  isHub: boolean;
  hop: 1 | 2; // hub is treated as hop 0; non-hub hop=1 or 2
  dimAnchorX: number;
  dimAnchorY: number;
  // d3-force simulation fields (mutated by sim)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type GraphLink = {
  // d3 mutates these from strings/ids to node refs after init — we keep both via id().
  source: string | GraphNode;
  target: string | GraphNode;
  /** Representative synapse for this pair (most-liked). */
  synapse: SynapseRow;
  /** All synapses for this directed pair (source → target), sorted by likes desc. */
  synapses: SynapseRow[];
  dominant: DominantDim;
  /** Representative keyword (from the most-liked synapse). */
  keyword: string | null;
  /** Stacked keywords from other synapses for the same pair (max 2 visible peek). */
  stackedKeywords: string[];
};

function pickEdgeKeyword(s: SynapseRow): string | null {
  const k = s.keywords?.find((x) => x && x.trim());
  return k ? k.trim() : null;
}

function computeAnchorForNorm(norm: string, synapses: SynapseRow[]): { x: number; y: number } {
  const p = computeNodeDimProfile(norm, synapses);
  if (!p) return { x: 0, y: 0 };
  const xy = nodeGlobalScreenXY(p);
  const mag = Math.hypot(xy.x, xy.y);
  if (mag < 0.5) return { x: 0, y: 0 };
  // Normalize to a fixed radius. Direction is preserved, distance is *not* allowed
  // to grow with how strongly the node leans toward a dim pole. This way the link
  // force alone determines distance; dim only nudges direction.
  const ux = xy.x / mag;
  const uy = xy.y / mag;
  return { x: ux * DIM_ANCHOR_RADIUS, y: uy * DIM_ANCHOR_RADIUS };
}

type NeighborMap = Map<string, Set<string>>;

/** Build adjacency map keyed by normalized URL */
function buildNeighborMap(synapses: SynapseRow[]): { neighbors: NeighborMap; urlForNorm: Map<string, string> } {
  const neighbors: NeighborMap = new Map();
  const urlForNorm = new Map<string, string>();
  for (const s of synapses) {
    const sN = normalizeSynapseEndpoint(s.source_url);
    const tN = normalizeSynapseEndpoint(s.target_url);
    if (!urlForNorm.has(sN)) urlForNorm.set(sN, normalizeSynapseEndpoint(s.source_url));
    if (!urlForNorm.has(tN)) urlForNorm.set(tN, normalizeSynapseEndpoint(s.target_url));
    if (!neighbors.has(sN)) neighbors.set(sN, new Set());
    if (!neighbors.has(tN)) neighbors.set(tN, new Set());
    neighbors.get(sN)!.add(tN);
    neighbors.get(tN)!.add(sN);
  }
  return { neighbors, urlForNorm };
}

function buildGraph(focusUrl: string, synapses: SynapseRow[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const focusNorm = normalizeSynapseEndpoint(focusUrl);
  const { neighbors, urlForNorm } = buildNeighborMap(synapses);

  // Ensure focus url is in urlForNorm even if not yet in synapses
  if (!urlForNorm.has(focusNorm)) urlForNorm.set(focusNorm, focusUrl);

  const hopMap = new Map<string, 1 | 2>();
  const oneHop = neighbors.get(focusNorm) ?? new Set<string>();
  for (const n of oneHop) {
    if (n === focusNorm) continue;
    hopMap.set(n, 1);
  }
  for (const n1 of oneHop) {
    const further = neighbors.get(n1) ?? new Set<string>();
    for (const n2 of further) {
      if (n2 === focusNorm) continue;
      if (hopMap.has(n2)) continue;
      hopMap.set(n2, 2);
    }
  }

  // Degree, likes count for ranking
  function degree(norm: string): number {
    return neighbors.get(norm)?.size ?? 0;
  }
  function likesFor(norm: string): number {
    let v = 0;
    for (const s of synapses) {
      const sN = normalizeSynapseEndpoint(s.source_url);
      const tN = normalizeSynapseEndpoint(s.target_url);
      if (sN === norm || tN === norm) v = Math.max(v, s.likes_count ?? 0);
    }
    return v;
  }

  // Cap to MAX_NODES total (hub + neighborhood). Drop lowest-priority 2-hop first.
  let memberNorms: string[] = [focusNorm, ...hopMap.keys()];
  const totalIncludingHub = memberNorms.length;
  if (totalIncludingHub > MAX_NODES) {
    // Separate by hop, sort 2-hop by priority (drop bottom)
    const oneHopArr: string[] = [];
    const twoHopArr: string[] = [];
    for (const [n, h] of hopMap) (h === 1 ? oneHopArr : twoHopArr).push(n);
    twoHopArr.sort((a, b) => {
      const la = likesFor(a), lb = likesFor(b);
      if (la !== lb) return lb - la;
      const da = degree(a), db = degree(b);
      if (da !== db) return db - da;
      return a.localeCompare(b);
    });
    const remainingSlots = MAX_NODES - 1 - oneHopArr.length;
    const keptTwo = remainingSlots > 0 ? twoHopArr.slice(0, remainingSlots) : [];
    memberNorms = [focusNorm, ...oneHopArr, ...keptTwo];
  }

  const memberSet = new Set(memberNorms);
  const nodes: GraphNode[] = memberNorms.map((norm) => {
    const isHub = norm === focusNorm;
    const a = computeAnchorForNorm(norm, synapses);
    return {
      norm,
      url: urlForNorm.get(norm) ?? norm,
      isHub,
      hop: isHub ? 1 : (hopMap.get(norm) ?? 1),
      dimAnchorX: a.x,
      dimAnchorY: a.y,
    };
  });

  // Build links for synapses whose both endpoints are members.
  // Aggregate ALL synapses with the same directed (source, target) pair into
  // a single GraphLink so the renderer can show stacked keywords and a
  // thicker line for richer connections.
  const linksByPair = new Map<string, GraphLink>();
  for (const s of synapses) {
    const sN = normalizeSynapseEndpoint(s.source_url);
    const tN = normalizeSynapseEndpoint(s.target_url);
    if (!memberSet.has(sN) || !memberSet.has(tN)) continue;
    if (sN === tN) continue;
    const key = `${sN}::${tN}`;
    const existing = linksByPair.get(key);
    if (existing) {
      existing.synapses.push(s);
    } else {
      const d = synapseToDims(s);
      const dominant: DominantDim = d ? getDominantDim(d) : "balanced";
      linksByPair.set(key, {
        source: sN,
        target: tN,
        synapse: s,
        synapses: [s],
        dominant,
        keyword: pickEdgeKeyword(s),
        stackedKeywords: [],
      });
    }
  }
  // Within each pair, sort synapses by likes desc → representative = most liked.
  // Stack peeking labels from up to 2 next-most-liked synapses (with different keywords).
  const links: GraphLink[] = [];
  for (const l of linksByPair.values()) {
    l.synapses.sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
    l.synapse = l.synapses[0];
    l.keyword = pickEdgeKeyword(l.synapse);
    const seenKw = new Set<string>();
    if (l.keyword) seenKw.add(l.keyword);
    l.stackedKeywords = [];
    for (let i = 1; i < l.synapses.length && l.stackedKeywords.length < 2; i++) {
      const k = pickEdgeKeyword(l.synapses[i]);
      if (k && !seenKw.has(k)) {
        seenKw.add(k);
        l.stackedKeywords.push(k);
      }
    }
    links.push(l);
  }

  return { nodes, links };
}

// ── Ray-rect intersection: shorten line so arrow tip lands on target card edge ─

function rayRectIntersection(
  cx: number, cy: number,
  tx: number, ty: number,
  halfW: number, halfH: number,
): { x: number; y: number } {
  // Ray from (cx,cy) outward to (tx,ty) — we want the intersection with the rect
  // centered on (tx,ty). Reverse: from target center to source center, find exit point.
  const dx = cx - tx;
  const dy = cy - ty;
  if (dx === 0 && dy === 0) return { x: tx, y: ty };
  const sx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const sy = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: tx + dx * t, y: ty + dy * t };
}

// ── Card component ───────────────────────────────────────────────────────────

function GraphCard({
  url,
  isFocus,
  loadingHint,
  onPointerDown,
}: {
  url: string;
  isFocus: boolean;
  loadingHint?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const [data, setData] = useState<{ title: string | null; imageUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancel = false;
    const hit = ogpMiniCache.get(url);
    if (hit) {
      const label = resolveContentDisplayTitle(hit.title, url);
      if (!isWeakContentTitleLabel(label, url) && (hit.imageUrl ?? "").trim()) {
        setData(hit); setLoading(false); return;
      }
      ogpMiniCache.delete(url);
    }
    setLoading(true);
    void fetchOgpMiniPayload(url)
      .then((o) => { if (!cancel) setData(o ?? { title: null, imageUrl: null }); })
      .catch(() => { if (!cancel) setData({ title: null, imageUrl: null }); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [url]);

  const displayTitle = resolveContentDisplayTitle(data?.title ?? null, url).slice(0, 60);
  const showImage = !!data?.imageUrl && !imgError;

  return (
    <div
      onPointerDown={onPointerDown}
      className={[
        "relative flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-[0_3px_12px_rgba(0,0,0,0.08)] transition-transform duration-150 will-change-transform",
        isFocus ? "ring-2 ring-indigo-400" : "ring-1 ring-zinc-200/70",
        loadingHint ? "" : "hover:scale-[1.04] hover:z-30",
      ].join(" ")}
      style={{ width: CARD_W, height: CARD_H, cursor: "pointer", touchAction: "none" }}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <OgpTileMedia
          pageUrl={url}
          imageUrl={showImage ? data!.imageUrl : null}
          slot="gridMini"
          loading={loading}
          onError={() => setImgError(true)}
        />
      </div>
      <div className="relative flex min-h-[2.875rem] shrink-0 flex-col justify-center px-1.5 py-1">
        <p
          className="line-clamp-2 w-full overflow-hidden text-center text-[11px] font-medium leading-snug text-zinc-900 break-keep break-words"
          title={displayTitle}
        >
          {displayTitle}
        </p>
      </div>
      <ContentPlatformMark pageUrl={url} />
    </div>
  );
}

// ── Edge label (midpoint pill) ───────────────────────────────────────────────

/** ラベル枠の横幅上限 */
const EDGE_LABEL_MAX_W = 220;

function edgeKeywordDisplayLines(keyword: string): string[] {
  const plan = getEdgeKeywordRenderPlan(keyword);
  if (plan.mode === "explicit") return [...plan.lines];
  const hinted = jaKeywordSoftBreakHints(plan.raw);
  return hinted.includes("\n") ? hinted.split("\n") : [hinted];
}

function EdgeKeywordSvg({
  x,
  y,
  zoom,
  keyword,
  stackedKeywords,
  onActivate,
}: {
  x: number;
  y: number;
  zoom: number;
  keyword: string;
  stackedKeywords?: string[];
  onActivate: () => void;
}) {
  const counterScale = 1 / Math.max(zoom, 0.35);
  const lines = edgeKeywordDisplayLines(keyword);
  const lineHeight = 13;
  const fontSize = 11;
  const padX = 10;
  const padY = 5;
  const maxGlyphs = Math.max(...lines.map((l) => [...l.replace(/\u200b/g, "")].length), 1);
  const w = Math.min(EDGE_LABEL_MAX_W, Math.max(52, maxGlyphs * 7 + padX * 2));
  const h = lines.length * lineHeight + padY * 2;
  const peeks = stackedKeywords ?? [];
  const textStartY = -((lines.length - 1) * lineHeight) / 2;

  return (
    <g
      data-edge-keyword-svg
      transform={`translate(${x}, ${y}) scale(${counterScale})`}
      pointerEvents="all"
      style={{ cursor: "pointer" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
    >
      {peeks.map((_, idx) => {
        const depth = idx + 1;
        return (
          <rect
            key={idx}
            aria-hidden
            x={-w / 2 + depth * 3}
            y={-h / 2 - depth * 3}
            width={w}
            height={h}
            rx={12}
            ry={12}
            fill="white"
            stroke="#e0e7ff"
            strokeWidth={1}
            opacity={0.55 - depth * 0.12}
          />
        );
      })}
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={12}
        ry={12}
        fill="#ffffff"
        stroke="#c7d2fe"
        strokeWidth={1}
      />
      <text
        x={0}
        y={textStartY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fill="#4338ca"
        fontWeight={600}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

// ── Keyword-note modal helper components ────────────────────────────────────

/** 2作品名を framed で表示（バンド背景なし、ラベルなし）。
 *  「シナプス」ラベル付きの ConnectionWorksLine の slim 版。
 *  作品クリックでそのページへ遷移できる（onClickWork コールバック経由）。 */
function KeywordModalWorksLine({ sourceUrl, targetUrl, focusUrl, onClickWork }: {
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
    void Promise.all([
      fetch(`/api/ogp?url=${encodeURIComponent(sourceUrl)}`).then((r) => r.json()).then((j) => resolveContentDisplayTitle(j.title ?? null, sourceUrl)),
      fetch(`/api/ogp?url=${encodeURIComponent(targetUrl)}`).then((r) => r.json()).then((j) => resolveContentDisplayTitle(j.title ?? null, targetUrl)),
    ])
      .then(([a, b]) => { if (cancelled) return; setFrom(a); setTo(b); setLoading(false); })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sourceUrl, targetUrl]);

  // Truncate display titles to a uniform max length so both boxes look balanced.
  const MAX = 22;
  const truncate = (s: string) => (s.length > MAX ? s.slice(0, MAX - 1) + "…" : s);
  const leftRaw = loading ? "取得中…" : (from ?? sourceUrl);
  const rightRaw = loading ? "取得中…" : (to ?? targetUrl);
  const left = truncate(leftRaw);
  const right = truncate(rightRaw);
  const focusNorm = normalizeSynapseEndpoint(focusUrl);
  const srcActive = normalizeSynapseEndpoint(sourceUrl) === focusNorm;
  const tgtActive = normalizeSynapseEndpoint(targetUrl) === focusNorm;
  // Fixed widths + fixed height + 2-line clamp = balanced boxes regardless of title length.
  const baseCls = "flex h-12 w-40 items-center justify-center rounded-lg px-2.5 py-1.5 text-center text-[11px] leading-snug ring-1 ring-inset transition";
  const activeCls = `${baseCls} bg-indigo-50 font-bold text-indigo-700 ring-indigo-200 hover:bg-indigo-100`;
  const mutedCls  = `${baseCls} bg-white font-medium text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:text-indigo-700 hover:ring-indigo-200`;
  return (
    <div id="keyword-note-connection" className="shrink-0 border-b border-zinc-100 px-4 py-3 sm:px-5">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onClickWork?.(sourceUrl)}
          className={srcActive ? activeCls : mutedCls}
          title={leftRaw}
        >
          <span className="line-clamp-2 break-words">{left}</span>
        </button>
        <span className="shrink-0 text-base font-normal text-zinc-400" aria-hidden>→</span>
        <button
          type="button"
          onClick={() => onClickWork?.(targetUrl)}
          className={tgtActive ? activeCls : mutedCls}
          title={rightRaw}
        >
          <span className="line-clamp-2 break-words">{right}</span>
        </button>
      </div>
    </div>
  );
}

/** 詳細パネル内の「関連シナプス」リスト行。
 *  出発: 本作 → 相手 / 着地: 相手 → 本作 の3カラム（長題は折り込み）。
 *  キーワード・接続理由・いいねを続けて表示。
 */
function RelatedSynapseRow({ synapse, direction, focusNorm, accessToken, onClickOther }: {
  synapse: SynapseRow;
  direction: "outgoing" | "incoming";
  focusNorm: string;
  accessToken: string | null;
  onClickOther: (url: string) => void;
}) {
  // 「相手」作品 = focus じゃない方
  const otherUrl = direction === "outgoing" ? synapse.target_url : synapse.source_url;
  const otherNorm = normalizeSynapseEndpoint(otherUrl);
  const isFocusSrc = normalizeSynapseEndpoint(synapse.source_url) === focusNorm;

  const [otherTitle, setOtherTitle] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/ogp?url=${encodeURIComponent(otherUrl)}`)
      .then((r) => r.json())
      .then((j: { title?: string | null }) => { if (!cancelled) setOtherTitle(resolveContentDisplayTitle(j.title ?? null, otherUrl)); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [otherUrl]);

  const rawOtherTitle = otherTitle ?? otherUrl;
  const firstKeyword = synapse.keywords?.find((k) => k && k.trim())?.trim();

  const thisWorkPill = (
    <span
      className="inline-flex h-10 shrink-0 items-center justify-center self-stretch whitespace-nowrap rounded-lg bg-indigo-50 px-3 text-[11px] font-bold text-indigo-800 ring-1 ring-inset ring-indigo-200 sm:h-11 sm:min-w-[4rem]"
      title="いま詳細を開いている作品"
    >
      本作
    </span>
  );
  const otherWorkChip = (
    <button
      type="button"
      onClick={() => onClickOther(otherUrl)}
      className={[
        "flex min-h-[2.875rem] min-w-0 w-full flex-col justify-center rounded-lg px-2.5 py-1.5 text-left ring-1 ring-inset transition sm:min-h-11",
        "bg-white text-[11px] font-medium leading-snug text-zinc-700 ring-zinc-200",
        "hover:bg-zinc-50 hover:text-zinc-900 hover:ring-zinc-300",
      ].join(" ")}
      title={rawOtherTitle}
    >
      <span className="line-clamp-2 w-full break-words text-center sm:text-left">{rawOtherTitle}</span>
    </button>
  );
  const arrow = (
    <span className="shrink-0 text-base font-semibold text-zinc-300" aria-hidden>→</span>
  );

  return (
    <li className="rounded-xl border border-zinc-200/90 bg-white/95 px-3 py-2.5">
      <div className="mb-2 grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-x-2">
        {direction === "outgoing" ? (
          <>
            {thisWorkPill}
            <div className="flex shrink-0 items-center justify-center">{arrow}</div>
            {otherWorkChip}
          </>
        ) : (
          <>
            {otherWorkChip}
            <div className="flex shrink-0 items-center justify-center">{arrow}</div>
            {thisWorkPill}
          </>
        )}
      </div>
      {firstKeyword ? (
        <p className="mb-1.5 text-[13px] font-bold leading-snug text-indigo-700">「{firstKeyword}」</p>
      ) : null}
      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-500">{synapse.description.trim() || "—"}</p>
      <div className="mt-2 flex items-center justify-end">
        <LikeButton synapse={synapse} accessToken={accessToken} />
      </div>
      <span hidden>{otherNorm}{isFocusSrc ? "" : ""}</span>
    </li>
  );
}

/** 投稿者リンク。ID から display name を取得して "投稿者: XXX" を表示 */
function PosterLink({ userId }: { userId: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/user/${userId}`)
      .then((r) => r.json())
      .then((j: { displayName?: string }) => { if (!cancelled) setName(j.displayName ?? null); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [userId]);
  return (
    <span className="text-[11px] font-medium text-zinc-500">
      投稿者:{" "}
      <a
        href={`/user/${userId}`}
        className="text-indigo-600 transition hover:text-indigo-800 hover:underline"
      >
        {name ?? "…"}
      </a>
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function GraphView({ focusUrl, synapses, onFocusUrl }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentLayerRef = useRef<HTMLDivElement>(null);
  const viewportCenterRef = useRef({ cx: 0, cy: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  // Camera state. Initial values are overridden by the focus-tween effect once
  // viewport + world layout are ready.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.62);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const gesturingRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist0: number; zoom0: number; pan0: { x: number; y: number } } | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const pendingCameraRef = useRef<{ p: { x: number; y: number }; z: number } | null>(null);

  const applyCameraDom = useCallback((p: { x: number; y: number }, z: number) => {
    panRef.current = p;
    zoomRef.current = z;
    const el = contentLayerRef.current;
    if (el) {
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${z})`;
      el.style.willChange = gesturingRef.current ? "transform" : "auto";
    }
  }, []);

  const scheduleCameraDom = useCallback((p: { x: number; y: number }, z: number) => {
    pendingCameraRef.current = { p, z };
    if (cameraRafRef.current != null) return;
    cameraRafRef.current = requestAnimationFrame(() => {
      cameraRafRef.current = null;
      const pending = pendingCameraRef.current;
      if (!pending) return;
      applyCameraDom(pending.p, pending.z);
    });
  }, [applyCameraDom]);

  useEffect(() => {
    if (!gesturingRef.current) applyCameraDom(pan, zoom);
  }, [pan, zoom, viewport.w, viewport.h, applyCameraDom]);

  /** フォーカス初回Tweenで算出した pan/zoom。ツールバー％はこれを100% とする（実倍率は変更しない）。 */
  const [cameraUIBaseline, setCameraUIBaseline] = useState<{
    pan: { x: number; y: number };
    zoom: number;
  } | null>(null);
  /** setState より先に effect 内で読む用（初回で baseline 確定後も deps 変化なしで済ませる）。 */
  const cameraUIBaselineRef = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null);

  const cameraAnimTokenRef = useRef(0);
  const smoothCameraTo = useCallback(
    (targetPan: { x: number; y: number }, targetZoom: number, durationMs: number) => {
      const token = ++cameraAnimTokenRef.current;
      const startPan = panRef.current;
      const startZoom = zoomRef.current;
      const t0 = performance.now();
      function step(now: number) {
        if (token !== cameraAnimTokenRef.current) return;
        const k = Math.min(1, (now - t0) / durationMs);
        const e = easeOutCubic(k);
        const p = {
          x: startPan.x + (targetPan.x - startPan.x) * e,
          y: startPan.y + (targetPan.y - startPan.y) * e,
        };
        const z = startZoom + (targetZoom - startZoom) * e;
        applyCameraDom(p, z);
        if (k < 1) {
          requestAnimationFrame(step);
        } else {
          setPan(p);
          setZoom(z);
        }
      }
      requestAnimationFrame(step);
    },
    [applyCameraDom],
  );

  // Build graph (memoized on focus + synapses identity) — used for VISIBILITY
  // filtering only (which N=2 nodes to render). Positions come from the global
  // world layout in worldPositionsRef.
  const { nodes: builtNodes, links: builtLinks } = useMemo(
    () => buildGraph(focusUrl, synapses),
    [focusUrl, synapses],
  );

  // Global world layout — positions for every node in the DB. Computed once
  // per `synapses` identity via d3-force pre-settled simulation. Clicking a
  // card never recomputes these; the camera just pans/zooms.
  const worldPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Simulation refs — these hold ALL world nodes/links (not just visible).
  // Drag handling reads/writes these.
  const simNodesRef = useRef<GraphNode[]>([]);
  const simLinksRef = useRef<GraphLink[]>([]);
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  // tick counter triggers re-render on each ticked frame
  const [, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  // ── Build the GLOBAL world layout (all nodes + all synapses) ──────────────
  // Runs whenever `synapses` identity changes. Pre-settles d3-force ~400 ticks
  // synchronously so positions are stable before first paint. Positions for
  // unchanged nodes are preserved across rebuilds via worldPositionsRef.
  useEffect(() => {
    simRef.current?.stop();
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // 1) Collect ALL nodes + ALL links from the entire synapse set.
    const { neighbors, urlForNorm } = buildNeighborMap(synapses);
    const allNorms = Array.from(neighbors.keys());

    // Pick the algorithmic "starting point" — the node with most direct
    // connections. NOT a semantic center; just the anchor we begin laying out
    // from. Swappable later for "trending", "user-pinned", etc.
    function pickStartNorm(): string | null {
      let bestNorm: string | null = null;
      let bestDeg = -1;
      let bestLikes = -1;
      const likesByNorm = new Map<string, number>();
      for (const s of synapses) {
        const sN = normalizeSynapseEndpoint(s.source_url);
        const tN = normalizeSynapseEndpoint(s.target_url);
        const l = s.likes_count ?? 0;
        likesByNorm.set(sN, (likesByNorm.get(sN) ?? 0) + l);
        likesByNorm.set(tN, (likesByNorm.get(tN) ?? 0) + l);
      }
      for (const [norm, set] of neighbors) {
        const deg = set.size;
        if (deg === 0) continue; // skip isolated/island nodes
        const likes = likesByNorm.get(norm) ?? 0;
        if (
          deg > bestDeg ||
          (deg === bestDeg && likes > bestLikes) ||
          (deg === bestDeg && likes === bestLikes && (bestNorm == null || norm < bestNorm))
        ) {
          bestNorm = norm;
          bestDeg = deg;
          bestLikes = likes;
        }
      }
      return bestNorm;
    }
    const startNorm = pickStartNorm();

    // BFS from start → for each node, record:
    //   - hop: distance in number of synapse links
    //   - parent: a neighbor on the previous ring (closer to start)
    // Used to place each node at hop × LINK_DISTANCE from origin, with its
    // angular position influenced by its parent's angle (anti-zigzag).
    const hopByNorm = new Map<string, number>();
    const parentByNorm = new Map<string, string>();
    if (startNorm) {
      hopByNorm.set(startNorm, 0);
      let frontier: string[] = [startNorm];
      while (frontier.length > 0) {
        const next: string[] = [];
        const sorted = [...frontier].sort(); // deterministic order
        for (const cur of sorted) {
          const ns = neighbors.get(cur);
          if (!ns) continue;
          const curHop = hopByNorm.get(cur)!;
          const sortedNs = [...ns].sort();
          for (const nb of sortedNs) {
            if (hopByNorm.has(nb)) continue;
            hopByNorm.set(nb, curHop + 1);
            parentByNorm.set(nb, cur);
            next.push(nb);
          }
        }
        frontier = next;
      }
    }
    // Islands: unreachable nodes are placed at a sentinel ring far out.
    const ISLAND_HOP = 6;
    for (const norm of allNorms) {
      if (!hopByNorm.has(norm)) hopByNorm.set(norm, ISLAND_HOP);
    }

    // Deterministic per-node offset derived from the norm string — replaces
    // Math.random() so the layout is reproducible across reloads.
    function hashOffset(s: string): { ox: number; oy: number } {
      let h1 = 0x811c9dc5 >>> 0;
      let h2 = 0xdeadbeef >>> 0;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
      }
      // Map to roughly -50..+50 px on each axis
      const ox = (((h1 & 0xffff) / 0xffff) - 0.5) * 100;
      const oy = (((h2 & 0xffff) / 0xffff) - 0.5) * 100;
      return { ox, oy };
    }

    // Position cache is intentionally NOT used as a "preserve existing" mechanism.
    // Layout is fully recomputed from synapses every time the data changes — a
    // new work may shift other works to find a globally optimal arrangement.
    const worldNodes: GraphNode[] = allNorms.map((norm) => {
      const a = computeAnchorForNorm(norm, synapses);
      const { ox, oy } = hashOffset(norm);
      const isStart = norm === startNorm;
      // Pin the start node to world (0,0) — algorithmic anchor.
      const initX = isStart ? 0 : (a.x + ox);
      const initY = isStart ? 0 : (a.y + oy);
      return {
        norm,
        url: urlForNorm.get(norm) ?? norm,
        isHub: false,
        hop: 1,
        dimAnchorX: a.x,
        dimAnchorY: a.y,
        x: initX,
        y: initY,
        ...(isStart ? { fx: 0, fy: 0 } : {}),
      };
    });

    // Aggregate synapses per directed (source, target) pair. Each link carries
    // the full list of synapses sorted by likes; the most-liked one is the
    // representative (used for label + click), and up to 2 next keywords are
    // stacked behind the label.
    const worldLinksByPair = new Map<string, GraphLink>();
    for (const s of synapses) {
      const sN = normalizeSynapseEndpoint(s.source_url);
      const tN = normalizeSynapseEndpoint(s.target_url);
      if (sN === tN) continue;
      const key = `${sN}::${tN}`;
      const existing = worldLinksByPair.get(key);
      if (existing) {
        existing.synapses.push(s);
      } else {
        const d = synapseToDims(s);
        const dominant: DominantDim = d ? getDominantDim(d) : "balanced";
        worldLinksByPair.set(key, {
          source: sN,
          target: tN,
          synapse: s,
          synapses: [s],
          dominant,
          keyword: pickEdgeKeyword(s),
          stackedKeywords: [],
        });
      }
    }
    const worldLinks: GraphLink[] = [];
    for (const l of worldLinksByPair.values()) {
      l.synapses.sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
      l.synapse = l.synapses[0];
      l.keyword = pickEdgeKeyword(l.synapse);
      const seen = new Set<string>();
      if (l.keyword) seen.add(l.keyword);
      l.stackedKeywords = [];
      for (let i = 1; i < l.synapses.length && l.stackedKeywords.length < 2; i++) {
        const k = pickEdgeKeyword(l.synapses[i]);
        if (k && !seen.has(k)) { seen.add(k); l.stackedKeywords.push(k); }
      }
      worldLinks.push(l);
    }

    if (worldNodes.length === 0) {
      simNodesRef.current = [];
      simLinksRef.current = [];
      worldPositionsRef.current = new Map();
      setTick((t) => (t + 1) % 1000000);
      return;
    }

    // ── Triangle detection: links that participate in a triangle (3 mutually
    //    connected nodes) get a stronger link strength. This makes tightly-
    //    interconnected groups clump together as a unit without us having to
    //    explicitly "detect clusters" — the structure emerges from the rule.
    const undirectedNeighborSets = new Map<string, Set<string>>();
    for (const l of worldLinks) {
      const sN = typeof l.source === "string" ? l.source : (l.source as GraphNode).norm;
      const tN = typeof l.target === "string" ? l.target : (l.target as GraphNode).norm;
      if (!undirectedNeighborSets.has(sN)) undirectedNeighborSets.set(sN, new Set());
      if (!undirectedNeighborSets.has(tN)) undirectedNeighborSets.set(tN, new Set());
      undirectedNeighborSets.get(sN)!.add(tN);
      undirectedNeighborSets.get(tN)!.add(sN);
    }
    const triangleLinkKeys = new Set<string>();
    for (const l of worldLinks) {
      const sN = typeof l.source === "string" ? l.source : (l.source as GraphNode).norm;
      const tN = typeof l.target === "string" ? l.target : (l.target as GraphNode).norm;
      const sNeighbors = undirectedNeighborSets.get(sN)!;
      const tNeighbors = undirectedNeighborSets.get(tN)!;
      // Find any third node connected to both endpoints → triangle exists
      let inTriangle = false;
      for (const n of sNeighbors) {
        if (n !== tN && tNeighbors.has(n)) { inTriangle = true; break; }
      }
      if (inTriangle) {
        triangleLinkKeys.add(`${sN}::${tN}`);
        triangleLinkKeys.add(`${tN}::${sN}`);
      }
    }

    // 2) Build d3 simulation. Strong link force + strong charge so topology
    //    (hop distance) determines physical distance: directly-connected nodes
    //    sit at LINK_DISTANCE, anything else gets pushed apart. Triangle links
    //    are 2.5× stronger so clusters clump. A weak uniform outward gravity
    //    spreads the graph so lines have natural breathing room.
    const sim = d3
      .forceSimulation<GraphNode, GraphLink>(worldNodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(worldLinks)
          .id((d) => d.norm)
          .distance(LINK_DISTANCE)
          .strength((l) => {
            const sN = typeof l.source === "string" ? l.source : (l.source as GraphNode).norm;
            const tN = typeof l.target === "string" ? l.target : (l.target as GraphNode).norm;
            // Triangle links are ~50% stronger — strong enough to clump
            // clusters together, but not so strong that they pull direct
            // neighbors away from their natural link distance.
            return triangleLinkKeys.has(`${sN}::${tN}`) ? 1.5 : 1.0;
          }),
      )
      .force(
        "charge",
        // Global repulsion (no distanceMax) — keeps 2-hop nodes from collapsing
        // toward the centroid of their parents.
        d3.forceManyBody<GraphNode>().strength(-1200),
      )
      .force("collide", d3.forceCollide<GraphNode>().radius(NODE_RADIUS).strength(0.92))
      // Dim gravity: extremely weak — just enough to nudge unconnected clusters
      // toward their dim pole side. Does not affect link-determined distances.
      .force(
        "dimX",
        d3.forceX<GraphNode>((n) => n.dimAnchorX).strength(0.003),
      )
      .force(
        "dimY",
        d3.forceY<GraphNode>((n) => n.dimAnchorY).strength(0.003),
      )
      // ── Radial anchor: each node is pulled toward radius (hop × LINK_DISTANCE).
      //    Combined with the pinned start at (0,0) and link force, this makes
      //    1-hop sit at ring 1 (340), 2-hop at ring 2 (680), etc.
      .force(
        "radial",
        d3.forceRadial<GraphNode>((n) => (hopByNorm.get(n.norm) ?? 1) * LINK_DISTANCE, 0, 0)
          .strength(0.4),
      )
      .alpha(1)
      .alphaDecay(0.012)
      .velocityDecay(0.4);

    // 3) Pre-settle more ticks (~700) so stronger forces have time to settle.
    sim.stop();
    for (let i = 0; i < 700; i++) sim.tick();

    // 4) SNAP POST-PROCESS — cluster-aware slot assignment per ring.
    //    - Each node's target ring = hop × LINK_DISTANCE (already enforced by
    //      forceRadial; snap rounds to exact ring radius).
    //    - Slot count per ring chosen from preset [3, 6, 9, 12, 18, 24, 36].
    //    - Slot ordering: children of the same parent → adjacent slots
    //      (prevents zigzag); triangle members get additional adjacency boost.
    const RADIUS_STEP = LINK_DISTANCE;
    const RING_SLOT_PRESETS = [3, 6, 9, 12, 18, 24, 36];

    // Group nodes by ring (= hop)
    const ringGroups = new Map<number, GraphNode[]>();
    for (const n of worldNodes) {
      const hop = hopByNorm.get(n.norm) ?? 1;
      if (!ringGroups.has(hop)) ringGroups.set(hop, []);
      ringGroups.get(hop)!.push(n);
    }

    const snappedById = new Map<string, { x: number; y: number }>();
    // Place start node at origin
    if (startNorm) snappedById.set(startNorm, { x: 0, y: 0 });

    // Process rings in order (ring 1, 2, 3, ...) so each ring can use its
    // parent ring's positions for angle ordering.
    const ringIndices = [...ringGroups.keys()].sort((a, b) => a - b);
    for (const hop of ringIndices) {
      if (hop === 0) continue; // start node already placed
      const group = ringGroups.get(hop)!;
      const ringR = hop * RADIUS_STEP;
      const N = group.length;
      if (N === 0) continue;

      // Compute "preferred angle" for each node from the circular mean of
      // ALL already-placed neighbors (any ring), not just the BFS parent.
      // This way a 2-hop node connected to two 1-hop neighbors lands at
      // the midpoint angle between them — bringing connected pairs close.
      function circularMean(angles: number[]): number {
        if (angles.length === 0) return 0;
        let sx = 0, sy = 0;
        for (const a of angles) { sx += Math.cos(a); sy += Math.sin(a); }
        return Math.atan2(sy, sx);
      }
      type WithAngle = { node: GraphNode; prefAngle: number; placedNeighborCount: number };
      const withAngle: WithAngle[] = group.map((n) => {
        const ns = neighbors.get(n.norm);
        const placedAngles: number[] = [];
        if (ns) {
          for (const nb of ns) {
            const p = snappedById.get(nb);
            if (p) placedAngles.push(Math.atan2(p.y, p.x));
          }
        }
        let prefAngle: number;
        if (placedAngles.length > 0) {
          prefAngle = circularMean(placedAngles);
        } else {
          prefAngle = Math.atan2(n.y ?? 0, n.x ?? 0);
        }
        if (!isFinite(prefAngle)) prefAngle = 0;
        return { node: n, prefAngle, placedNeighborCount: placedAngles.length };
      });

      // Sort by number of placed neighbors descending (most-constrained first),
      // then by pref angle, then norm. Nodes with more placed neighbors have
      // less room for adjustment, so we satisfy them first.
      withAngle.sort((a, b) => {
        if (a.placedNeighborCount !== b.placedNeighborCount) {
          return b.placedNeighborCount - a.placedNeighborCount;
        }
        if (a.prefAngle !== b.prefAngle) return a.prefAngle - b.prefAngle;
        return a.node.norm.localeCompare(b.node.norm);
      });

      // Pick slot count from preset
      // Slot count chosen so adjacent slots are ~LINK_DISTANCE apart in
      // tangential space. circumference = 2π * ringR; ideal slot count =
      // circumference / LINK_DISTANCE. Pick smallest preset ≥ that, and also
      // ≥ N (so all nodes fit).
      const idealSlotCount = Math.ceil((2 * Math.PI * ringR) / LINK_DISTANCE);
      const slotCount = RING_SLOT_PRESETS.find((p) => p >= Math.max(idealSlotCount, N)) ?? RING_SLOT_PRESETS[RING_SLOT_PRESETS.length - 1];
      const slotAngles: number[] = [];
      for (let i = 0; i < slotCount; i++) {
        slotAngles.push((i / slotCount) * 2 * Math.PI - Math.PI);
      }

      // Assign each node to the nearest free slot to its preferred angle.
      const takenSlots = new Set<number>();
      for (const wa of withAngle) {
        let bestSlot = -1;
        let bestDist = Infinity;
        for (let i = 0; i < slotCount; i++) {
          if (takenSlots.has(i)) continue;
          let d = Math.abs(wa.prefAngle - slotAngles[i]);
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d < bestDist) { bestDist = d; bestSlot = i; }
        }
        if (bestSlot < 0) continue;
        takenSlots.add(bestSlot);
        const a = slotAngles[bestSlot];
        snappedById.set(wa.node.norm, {
          x: Math.cos(a) * ringR,
          y: Math.sin(a) * ringR,
        });
      }
    }

    // ── Barycenter refinement: iterate a few times to let nodes shift toward
    //    the angular center of all their neighbors (not just the BFS parent).
    //    Helps connected pairs on the same ring end up in adjacent slots.
    const BARYCENTER_ITERATIONS = 3;
    for (let iter = 0; iter < BARYCENTER_ITERATIONS; iter++) {
      // Process rings outward (deeper rings depend on shallower placements)
      for (const hop of ringIndices) {
        if (hop === 0) continue;
        const group = ringGroups.get(hop)!;
        const ringR = hop * RADIUS_STEP;
        if (group.length === 0) continue;
        const idealSlotCount = Math.ceil((2 * Math.PI * ringR) / LINK_DISTANCE);
        const slotCount = RING_SLOT_PRESETS.find((p) => p >= Math.max(idealSlotCount, group.length)) ?? RING_SLOT_PRESETS[RING_SLOT_PRESETS.length - 1];
        const slotAngles: number[] = [];
        for (let i = 0; i < slotCount; i++) {
          slotAngles.push((i / slotCount) * 2 * Math.PI - Math.PI);
        }
        // Compute new preferred angle (circular mean of all placed neighbors)
        const newPrefs = group.map((n) => {
          const ns = neighbors.get(n.norm);
          const placedAngles: number[] = [];
          if (ns) {
            for (const nb of ns) {
              const p = snappedById.get(nb);
              if (p) placedAngles.push(Math.atan2(p.y, p.x));
            }
          }
          let sx = 0, sy = 0;
          for (const a of placedAngles) { sx += Math.cos(a); sy += Math.sin(a); }
          const angle = placedAngles.length > 0 ? Math.atan2(sy, sx) : 0;
          return { node: n, prefAngle: angle };
        });
        // Re-assign slots greedily. Sort by (norm) for determinism.
        newPrefs.sort((a, b) => a.node.norm.localeCompare(b.node.norm));
        const takenSlots = new Set<number>();
        for (const wa of newPrefs) {
          let bestSlot = -1;
          let bestDist = Infinity;
          for (let i = 0; i < slotCount; i++) {
            if (takenSlots.has(i)) continue;
            let d = Math.abs(wa.prefAngle - slotAngles[i]);
            if (d > Math.PI) d = 2 * Math.PI - d;
            if (d < bestDist) { bestDist = d; bestSlot = i; }
          }
          if (bestSlot < 0) continue;
          takenSlots.add(bestSlot);
          const a = slotAngles[bestSlot];
          snappedById.set(wa.node.norm, {
            x: Math.cos(a) * ringR,
            y: Math.sin(a) * ringR,
          });
        }
      }
    }

    // 5) Save snapped positions
    const newPositions = new Map<string, { x: number; y: number }>();
    for (const n of worldNodes) {
      const snapped = snappedById.get(n.norm);
      if (snapped) {
        n.x = snapped.x;
        n.y = snapped.y;
        n.fx = snapped.x;
        n.fy = snapped.y;
        newPositions.set(n.norm, snapped);
      } else if (typeof n.x === "number" && typeof n.y === "number") {
        newPositions.set(n.norm, { x: n.x, y: n.y });
        n.fx = n.x;
        n.fy = n.y;
      }
    }
    worldPositionsRef.current = newPositions;
    simNodesRef.current = worldNodes;
    simLinksRef.current = worldLinks;
    simRef.current = sim;

    setTick((t) => (t + 1) % 1000000);

    return () => {
      sim.stop();
    };
  }, [synapses]);


  // Measure viewport
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setViewport({ w: r.width, h: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera tween: first load fits N=1 neighborhood and locks that zoom as UI "100%".
  // When focus moves to another work, keep that zoom and re-center pan (always 100% scale).
  useEffect(() => {
    if (viewport.w === 0 || viewport.h === 0) return;
    const worldPos = worldPositionsRef.current;
    if (worldPos.size === 0) return;

    let hubPos: { x: number; y: number } | null = null;
    for (const n of builtNodes) {
      if (!n.isHub) continue;
      const p = worldPos.get(n.norm);
      if (p) hubPos = p;
      break;
    }
    if (!hubPos) return;

    const stored = cameraUIBaselineRef.current;
    let targetZoom: number;
    let targetPan: { x: number; y: number };

    if (stored && stored.zoom > 1e-9) {
      targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, stored.zoom));
      targetPan = { x: -hubPos.x * targetZoom, y: -hubPos.y * targetZoom };
    } else {
      // Establish "100%" scale once from bbox of hub + immediate (N=1) neighbors.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const hx = CARD_W / 2;
      const hy = CARD_H / 2;
      for (const n of builtNodes) {
        if (!n.isHub && n.hop !== 1) continue;
        const p = worldPos.get(n.norm);
        if (!p) continue;
        if (p.x - hx < minX) minX = p.x - hx;
        if (p.y - hy < minY) minY = p.y - hy;
        if (p.x + hx > maxX) maxX = p.x + hx;
        if (p.y + hy > maxY) maxY = p.y + hy;
      }
      if (!isFinite(minX)) return;
      const bboxW = Math.max(1, maxX - minX);
      const bboxH = Math.max(1, maxY - minY);
      const PAD = 60;
      const zX = (viewport.w - PAD * 2) / bboxW;
      const zY = (viewport.h - PAD * 2) / bboxH;
      targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zX, zY) * 1.1));
      targetPan = { x: -hubPos.x * targetZoom, y: -hubPos.y * targetZoom };
      cameraUIBaselineRef.current = { pan: targetPan, zoom: targetZoom };
      setCameraUIBaseline(cameraUIBaselineRef.current);
    }

    smoothCameraTo(targetPan, targetZoom, 320);
    return () => {
      cameraAnimTokenRef.current += 1;
    };
  }, [focusUrl, builtNodes, viewport.w, viewport.h, smoothCameraTo]);

  // ── Pan / Zoom interactions ─────────────────────────────────────────────────
  const wheelTimerRef = useRef<number | null>(null);
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const z0 = zoomRef.current;
    const p0 = panRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z0 * factor));
    const cxw = rect.width / 2;
    const cyw = rect.height / 2;
    const worldX = (cx - p0.x - cxw) / z0;
    const worldY = (cy - p0.y - cyw) / z0;
    const newPan = { x: cx - cxw - worldX * z1, y: cy - cyw - worldY * z1 };
    applyCameraDom(newPan, z1);
    setPan(newPan);
    setZoom(z1);
    if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
  }, [applyCameraDom]);

  const viewportLocalFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const pointerDistance = useCallback(() => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }, []);

  const pointerMidClient = useCallback(() => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return null;
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }, []);

  // Background drag (pan) + pinch zoom
  const bgDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const commitCameraState = useCallback(() => {
    gesturingRef.current = false;
    requestAnimationFrame(() => {
      setPan({ ...panRef.current });
      setZoom(zoomRef.current);
    });
  }, []);

  const touchActiveRef = useRef(false);

  const applyPinchZoom = useCallback((midClientX: number, midClientY: number, dist: number) => {
    const pinch = pinchRef.current;
    const cxw = viewportCenterRef.current.cx;
    const cyw = viewportCenterRef.current.cy;
    if (!pinch || dist < 1 || cxw <= 0) return;
    const local = viewportLocalFromClient(midClientX, midClientY);
    const z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinch.zoom0 * (dist / pinch.dist0)));
    const worldX = (local.x - pinch.pan0.x - cxw) / pinch.zoom0;
    const worldY = (local.y - pinch.pan0.y - cyw) / pinch.zoom0;
    scheduleCameraDom(
      { x: local.x - cxw - worldX * z1, y: local.y - cyw - worldY * z1 },
      z1,
    );
  }, [scheduleCameraDom, viewportLocalFromClient]);

  // iOS: Touch Events で 2 本指ピンチ（Pointer Events + capture では取れないことが多い）
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const isTouchBlockedTarget = (target: EventTarget | null) => {
      const t = target as HTMLElement | null;
      if (!t?.closest) return false;
      return !!(
        t.closest("[data-graph-zoom-toolbar]")
        || t.closest("[data-edge-keyword-svg]")
        || t.closest("[data-graph-node]")
      );
    };

    const initPinchFromTouches = (touches: TouchList) => {
      if (touches.length < 2) return;
      const dist = Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      );
      bgDragRef.current = null;
      if (dist > 8) {
        pinchRef.current = {
          dist0: dist,
          zoom0: zoomRef.current,
          pan0: { ...panRef.current },
        };
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        touchActiveRef.current = true;
        gesturingRef.current = true;
        cameraAnimTokenRef.current += 1;
        initPinchFromTouches(e.touches);
        return;
      }
      if (e.touches.length !== 1 || isTouchBlockedTarget(e.target)) return;
      e.preventDefault();
      touchActiveRef.current = true;
      gesturingRef.current = true;
      cameraAnimTokenRef.current += 1;
      pinchRef.current = null;
      const t = e.touches[0];
      bgDragRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchActiveRef.current) return;
      e.preventDefault();
      if (e.touches.length >= 2) {
        if (!pinchRef.current) initPinchFromTouches(e.touches);
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        applyPinchZoom(midX, midY, dist);
        return;
      }
      const d = bgDragRef.current;
      if (!d || e.touches.length !== 1) return;
      const t = e.touches[0];
      scheduleCameraDom(
        { x: d.panX + (t.clientX - d.startX), y: d.panY + (t.clientY - d.startY) },
        zoomRef.current,
      );
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchActiveRef.current) return;
      if (e.touches.length === 1) {
        pinchRef.current = null;
        const t = e.touches[0];
        bgDragRef.current = {
          startX: t.clientX,
          startY: t.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        return;
      }
      if (e.touches.length >= 2) {
        initPinchFromTouches(e.touches);
        bgDragRef.current = null;
        return;
      }
      touchActiveRef.current = false;
      bgDragRef.current = null;
      pinchRef.current = null;
      commitCameraState();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    el.addEventListener("gesturestart", (e) => e.preventDefault());
    el.addEventListener("gesturechange", (e) => e.preventDefault());
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyPinchZoom, commitCameraState, scheduleCameraDom]);

  const onBgPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("[data-graph-zoom-toolbar]")) return;
    if (t?.closest("[data-edge-keyword-svg]")) return;

    cameraAnimTokenRef.current += 1;
    gesturingRef.current = true;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      bgDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      pinchRef.current = null;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } else if (pointersRef.current.size === 2) {
      bgDragRef.current = null;
      const dist = pointerDistance();
      if (dist > 8) {
        pinchRef.current = {
          dist0: dist,
          zoom0: zoomRef.current,
          pan0: { ...panRef.current },
        };
      }
    }
  }, [pointerDistance]);

  const processPointerMove = useCallback((e: { pointerId: number; clientX: number; clientY: number }) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      const dist = pointerDistance();
      const midClient = pointerMidClient();
      if (!midClient) return;
      applyPinchZoom(midClient.x, midClient.y, dist);
      return;
    }

    const d = bgDragRef.current;
    if (!d) return;
    scheduleCameraDom(
      { x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) },
      zoomRef.current,
    );
  }, [pointerDistance, pointerMidClient, applyPinchZoom, scheduleCameraDom]);

  const onBgPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    processPointerMove(e);
  }, [processPointerMove]);

  const onBgPointerUpRef = useRef<(e: { pointerId: number; clientX: number; clientY: number; currentTarget?: EventTarget | null }) => void>(() => {});

  const onBgPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    pointersRef.current.delete(e.pointerId);
    try {
      const cap = viewportRef.current ?? (e.currentTarget as HTMLDivElement | null);
      cap?.releasePointerCapture(e.pointerId);
    } catch { /* noop */ }

    const bg = bgDragRef.current;

    if (pointersRef.current.size === 1) {
      pinchRef.current = null;
      const [remaining] = [...pointersRef.current.values()];
      bgDragRef.current = {
        startX: remaining.x,
        startY: remaining.y,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      return;
    }

    if (pointersRef.current.size >= 2) {
      const dist = pointerDistance();
      if (dist > 8) {
        pinchRef.current = {
          dist0: dist,
          zoom0: zoomRef.current,
          pan0: { ...panRef.current },
        };
      }
      bgDragRef.current = null;
      return;
    }

    bgDragRef.current = null;
    pinchRef.current = null;
    commitCameraState();

    const d = nodeDragRef.current;
    nodeDragRef.current = null;
    if (!d) return;
    const moved = bg ? Math.hypot(e.clientX - bg.startX, e.clientY - bg.startY) > 5 : false;
    if (moved) return;
    if (!d.isHub) {
      onFocusUrl(d.url);
      window.setTimeout(() => {
        setDetailUrl(d.url);
        setDetailOpen(true);
      }, 180);
    } else {
      setDetailUrl(d.url);
      setDetailOpen(true);
    }
  }, [commitCameraState, onFocusUrl, pointerDistance]);

  useEffect(() => {
    onBgPointerUpRef.current = (e) => {
      onBgPointerUp({
        ...e,
        currentTarget: viewportRef.current,
        pointerType: "touch",
        button: 0,
        buttons: 0,
      } as React.PointerEvent<HTMLDivElement>);
    };
  }, [onBgPointerUp]);

  useEffect(() => {
    const onWindowMove = (e: PointerEvent) => {
      if (pointersRef.current.size === 0) return;
      processPointerMove(e);
    };
    const onWindowUp = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      onBgPointerUpRef.current?.(e);
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
    };
  }, [processPointerMove]);

  // Node drag — handles single-click vs drag distinction
  type NodeDrag = {
    norm: string;
    url: string;
    isHub: boolean;
    startX: number; startY: number;
    moved: boolean;
    pointerId: number;
    // pre-drag fixed state to restore on release
    hadFx: boolean;
  };
  const nodeDragRef = useRef<NodeDrag | null>(null);

  const onNodePointerDown = useCallback((norm: string, url: string, isHub: boolean) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // No stopPropagation / no setPointerCapture: the canvas's pan handler
      // also receives the event so the user can pan by dragging anywhere
      // including over cards. Movement > threshold cancels the click.
      nodeDragRef.current = {
        norm, url, isHub,
        startX: e.clientX, startY: e.clientY,
        moved: false,
        pointerId: e.pointerId,
        hadFx: false,
      };
    },
  []);

  const onNodePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = nodeDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // Track movement but DO NOT drag the node. The canvas handles panning.
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true;
    }
  }, []);

  const onNodePointerUp = useCallback(() => {
    const d = nodeDragRef.current;
    if (!d) return;
    nodeDragRef.current = null;
    if (d.moved) return; // canvas handled the pan — no click
    // Click — open detail + refocus camera. No layout change.
    if (!d.isHub) {
      onFocusUrl(d.url);
      // Delay popup so the user *sees* the camera glide to the clicked card.
      window.setTimeout(() => {
        setDetailUrl(d.url);
        setDetailOpen(true);
      }, 180);
    } else {
      setDetailUrl(d.url);
      setDetailOpen(true);
    }
  }, [onFocusUrl]);

  // ── Detail panel state ───────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUrl, setDetailUrl] = useState<string>(focusUrl);
  useEffect(() => {
    if (!detailOpen) setDetailUrl(focusUrl);
  }, [focusUrl, detailOpen]);

  // Keyword note modal
  const [keywordNote, setKeywordNote] = useState<{
    keyword: string;
    description: string;
    sourceUrl: string;
    targetUrl: string;
    synapse?: SynapseRow;
    /** All synapses for this directed pair (sorted by likes desc). */
    synapses?: SynapseRow[];
    /** Index in `synapses` of the currently shown one. */
    currentIndex?: number;
  } | null>(null);

  // ── Detail OGP fetch for the currently-detailed URL ─────────────────────
  const [detailOgp, setDetailOgp] = useState<{ title: string | null; imageUrl: string | null; description: string | null; siteName: string | null } | null>(null);
  const [detailOgpLoading, setDetailOgpLoading] = useState(false);
  const [detailImgError, setDetailImgError] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  useEffect(() => {
    if (!detailOpen) return;
    let cancelled = false;
    setDescExpanded(false);
    setDetailImgError(false);
    setDetailOgpLoading(true);
    const cached = ogpMiniCache.get(detailUrl);
    if (cached?.title || cached?.imageUrl) {
      setDetailOgp({ title: cached.title, imageUrl: cached.imageUrl, description: null, siteName: null });
    }
    async function load(refresh: boolean) {
      const qs = new URLSearchParams({ url: detailUrl });
      if (refresh) qs.set("refresh", "1");
      const r = await fetch(`/api/ogp?${qs}`, { cache: "no-store" });
      const data = (await r.json()) as { error?: string; title?: string | null; imageUrl?: string | null; description?: string | null; siteName?: string | null };
      if (cancelled) return;
      if (data.error) { setDetailOgp(null); return; }
      setDetailOgp({ title: data.title ?? null, imageUrl: data.imageUrl ?? null, description: data.description ?? null, siteName: data.siteName ?? null });
      const label = resolveContentDisplayTitle(data.title ?? null, detailUrl);
      if (!refresh && (isWeakContentTitleLabel(label, detailUrl) || !(data.imageUrl ?? "").trim())) {
        await load(true);
      }
    }
    void load(false).catch(() => { if (!cancelled) setDetailOgp(null); })
      .finally(() => { if (!cancelled) setDetailOgpLoading(false); });
    return () => { cancelled = true; };
  }, [detailOpen, detailUrl]);

  // ESC closes modals
  useEffect(() => {
    if (!detailOpen && !keywordNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (keywordNote) setKeywordNote(null);
      else setDetailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen, keywordNote]);

  // Access token for like button
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Synapses for the detail panel (incoming + outgoing for detailUrl)
  const detailFocusNorm = useMemo(() => normalizeSynapseEndpoint(detailUrl), [detailUrl]);
  const outgoingSynapses = useMemo(() =>
    synapses.filter((s) => normalizeSynapseEndpoint(s.source_url) === detailFocusNorm)
      .sort((a, b) => a.id.localeCompare(b.id)),
  [synapses, detailFocusNorm]);
  const incomingSynapses = useMemo(() =>
    synapses.filter((s) => normalizeSynapseEndpoint(s.target_url) === detailFocusNorm)
      .sort((a, b) => a.id.localeCompare(b.id)),
  [synapses, detailFocusNorm]);

  const detailDisplayTitle = resolveContentDisplayTitle(detailOgp?.title ?? null, detailUrl);

  // ── Render ──────────────────────────────────────────────────────────────
  const centerX = viewport.w / 2;
  const centerY = viewport.h / 2;
  viewportCenterRef.current = { cx: centerX, cy: centerY };

  // Render ALL nodes in the world map (not just N=2). Off-screen cards are
  // culled by checking their projected screen position against the viewport
  // bounds + a generous margin. The current focus is marked as the "hub" for
  // visual emphasis (ring outline).
  const simByNorm = new Map<string, GraphNode>();
  for (const n of simNodesRef.current) simByNorm.set(n.norm, n);

  const focusNormForRender = normalizeSynapseEndpoint(focusUrl);
  type RenderNode = GraphNode & { x: number; y: number };
  const nodes: RenderNode[] = [];
  const nodePosByNorm = new Map<string, { x: number; y: number }>();

  // Off-screen culling: card screen position = center + pan + zoom * world.
  // Skip cards whose center is outside viewport by more than CULL_MARGIN px.
  const CULL_MARGIN = (CARD_W * zoom) / 2 + 220;

  for (const wn of simNodesRef.current) {
    const live = simByNorm.get(wn.norm);
    const wp = worldPositionsRef.current.get(wn.norm);
    const x = (typeof live?.x === "number" ? live.x : wp?.x);
    const y = (typeof live?.y === "number" ? live.y : wp?.y);
    if (typeof x !== "number" || typeof y !== "number") continue;
    // Off-screen cull
    const sx = centerX + pan.x + x * zoom;
    const sy = centerY + pan.y + y * zoom;
    if (sx < -CULL_MARGIN || sx > viewport.w + CULL_MARGIN || sy < -CULL_MARGIN || sy > viewport.h + CULL_MARGIN) {
      continue;
    }
    const isFocus = wn.norm === focusNormForRender;
    nodes.push({ ...wn, isHub: isFocus, x, y });
    nodePosByNorm.set(wn.norm, { x, y });
  }

  // Pole-label opacity fades out when zoomed in
  const poleOpacity = Math.max(0, Math.min(0.5, (1.4 - zoom) * 0.5));

  // Edge lines (SVG) + keyword labels (HTML — foreignObject は iOS Safari で描画されない)
  const edgeLineElements: React.ReactNode[] = [];
  const edgeLabelElements: React.ReactNode[] = [];
  {
    const CARD_PAD = 6;
    const cardRects = nodes
      .map((n) => ({ norm: n.norm, cx: n.x, cy: n.y, hw: CARD_W / 2 + CARD_PAD, hh: CARD_H / 2 + CARD_PAD }));
    const LABEL_HW = 70;
    const LABEL_HH = 22;
    const placedLabels: Array<{ x: number; y: number }> = [];
    const overlapsAny = (lx: number, ly: number) => {
      for (const c of cardRects) {
        if (Math.abs(lx - c.cx) < c.hw + LABEL_HW && Math.abs(ly - c.cy) < c.hh + LABEL_HH) return true;
      }
      for (const p of placedLabels) {
        if (Math.abs(lx - p.x) < LABEL_HW * 2 - 8 && Math.abs(ly - p.y) < LABEL_HH * 2 - 4) return true;
      }
      return false;
    };

    for (let i = 0; i < simLinksRef.current.length; i++) {
      const l = simLinksRef.current[i];
      const sNorm = typeof l.source === "string" ? l.source : l.source.norm;
      const tNorm = typeof l.target === "string" ? l.target : l.target.norm;
      const sInView = nodePosByNorm.has(sNorm);
      const tInView = nodePosByNorm.has(tNorm);
      if (!sInView && !tInView) continue;
      const sPos = sInView ? nodePosByNorm.get(sNorm) : worldPositionsRef.current.get(sNorm);
      const tPos = tInView ? nodePosByNorm.get(tNorm) : worldPositionsRef.current.get(tNorm);
      if (!sPos || !tPos) continue;
      const halfW = CARD_W / 2;
      const halfH = CARD_H / 2;
      const tipPt = rayRectIntersection(sPos.x, sPos.y, tPos.x, tPos.y, halfW, halfH);
      const srcEdge = rayRectIntersection(tipPt.x, tipPt.y, sPos.x, sPos.y, halfW, halfH);
      const dx = tipPt.x - srcEdge.x;
      const dy = tipPt.y - srcEdge.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ARROW_LEN = 10;
      const ux = dx / len;
      const uy = dy / len;
      const lineEndX = tipPt.x - ux * ARROW_LEN;
      const lineEndY = tipPt.y - uy * ARROW_LEN;
      const baseMidX = (srcEdge.x + lineEndX) / 2;
      const baseMidY = (srcEdge.y + lineEndY) / 2;

      let labelX = baseMidX;
      let labelY = baseMidY;
      if (l.keyword) {
        const perpX = -uy;
        const perpY = ux;
        const tryOffsets: Array<[number, number]> = [[0, 0]];
        for (const d of [28, 56, 84, 112]) {
          tryOffsets.push([perpX * d, perpY * d], [-perpX * d, -perpY * d]);
        }
        for (const along of [40, -40, 80, -80]) {
          for (const dPerp of [28, -28, 56, -56]) {
            tryOffsets.push([ux * along + perpX * dPerp, uy * along + perpY * dPerp]);
          }
        }
        let bestX = baseMidX;
        let bestY = baseMidY;
        let placed = false;
        for (const [ox, oy] of tryOffsets) {
          const cx = baseMidX + ox;
          const cy = baseMidY + oy;
          if (!overlapsAny(cx, cy)) {
            bestX = cx;
            bestY = cy;
            placed = true;
            break;
          }
        }
        if (!placed) {
          bestX = baseMidX + perpX * 140;
          bestY = baseMidY + perpY * 140;
        }
        labelX = bestX;
        labelY = bestY;
        placedLabels.push({ x: labelX, y: labelY });
      }

      const stroke = DIM_STROKE[l.dominant];
      const synCount = l.synapses.length;
      const lineWidth = Math.min(5, 1.6 + Math.log2(synCount) * 1.4);
      edgeLineElements.push(
        <g key={i} pointerEvents="none">
          <line x1={srcEdge.x} y1={srcEdge.y} x2={lineEndX} y2={lineEndY} stroke={stroke} strokeWidth={lineWidth} strokeLinecap="butt" />
          <line x1={lineEndX} y1={lineEndY} x2={tipPt.x} y2={tipPt.y} stroke="transparent" strokeWidth={0.1} markerEnd={`url(#arrow-${l.dominant})`} />
        </g>,
      );
      if (l.keyword) {
        edgeLabelElements.push(
          <EdgeKeywordSvg
            key={`${l.synapse.id}-${l.keyword}`}
            x={labelX}
            y={labelY}
            zoom={zoom}
            keyword={l.keyword}
            stackedKeywords={l.stackedKeywords}
            onActivate={() => {
              setKeywordNote({
                keyword: l.keyword!,
                description: l.synapse.description,
                sourceUrl: l.synapse.source_url,
                targetUrl: l.synapse.target_url,
                synapse: l.synapse,
                synapses: l.synapses,
                currentIndex: 0,
              });
            }}
          />,
        );
      }
    }
  }

  return (
    <>
      <div
        ref={viewportRef}
        className="relative h-full w-full overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
        onPointerCancel={onBgPointerUp}
        style={{ cursor: bgDragRef.current ? "grabbing" : "grab", touchAction: "none" }}
      >
        {/* Content layer — single transform handles pan + zoom for cards + svg */}
        <div
          ref={contentLayerRef}
          style={{
            position: "absolute",
            left: centerX,
            top: centerY,
            width: 0,
            height: 0,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: "none",
          }}
        >
          {/* SVG edges — covers a big virtual area */}
          <svg
            width={4000}
            height={4000}
            viewBox="-2000 -2000 4000 4000"
            style={{ position: "absolute", left: -2000, top: -2000, overflow: "visible" }}
          >
            <defs>
              {(Object.keys(DIM_MARKER) as DominantDim[]).map((d) => (
                <marker
                  key={d}
                  id={`arrow-${d}`}
                  markerWidth={10}
                  markerHeight={8}
                  refX={10}
                  refY={4}
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0,0 L10,4 L0,8 Z" fill={DIM_MARKER[d]} />
                </marker>
              ))}
            </defs>
            {edgeLineElements}
            {edgeLabelElements}
          </svg>

          {/* Cards */}
          {nodes.map((n) => {
            if (typeof n.x !== "number" || typeof n.y !== "number") return null;
            return (
              <div
                key={n.norm}
                data-graph-node
                style={{
                  position: "absolute",
                  left: n.x,
                  top: n.y,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "auto",
                  zIndex: n.isHub ? 20 : 10,
                }}
                onPointerMove={onNodePointerMove}
                onPointerUp={onNodePointerUp}
                onPointerCancel={onNodePointerUp}
              >
                <GraphCard
                  url={n.url}
                  isFocus={n.isHub}
                  onPointerDown={onNodePointerDown(n.norm, n.url, n.isHub)}
                />
              </div>
            );
          })}
        </div>

        {/* Zoom controls — viewport の setPointerCapture から除外（親 onPointerDown より先で止める） */}
        <div
          data-graph-zoom-toolbar
          className="pointer-events-auto absolute right-5 top-5 z-[120] flex flex-col items-stretch overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              if (viewport.w <= 0 || viewport.h <= 0) return;
              const next = zoomByDisplayPercentStep(
                1,
                zoomRef.current,
                panRef.current,
                cameraUIBaseline?.zoom,
                viewport.w,
                viewport.h,
              );
              if (!next) return;
              smoothCameraTo(next.pan1, next.z1, CAMERA_UI_SMOOTH_MS);
            }}
            disabled={
              viewport.w <= 0 ||
              zoomByDisplayPercentStep(
                1,
                zoom,
                pan,
                cameraUIBaseline?.zoom,
                viewport.w,
                viewport.h,
              ) === null
            }
            className="flex h-11 w-11 items-center justify-center text-zinc-700 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title={`ズームイン（+${ZOOM_DISPLAY_STEP_PCT}%）`}
            aria-label={`ズームイン（+${ZOOM_DISPLAY_STEP_PCT}%）`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="h-px bg-zinc-200" aria-hidden />
          <button
            type="button"
            onClick={() => {
              if (viewport.w <= 0 || viewport.h <= 0) return;
              const next = zoomByDisplayPercentStep(
                -1,
                zoomRef.current,
                panRef.current,
                cameraUIBaseline?.zoom,
                viewport.w,
                viewport.h,
              );
              if (!next) return;
              smoothCameraTo(next.pan1, next.z1, CAMERA_UI_SMOOTH_MS);
            }}
            disabled={
              viewport.w <= 0 ||
              zoomByDisplayPercentStep(
                -1,
                zoom,
                pan,
                cameraUIBaseline?.zoom,
                viewport.w,
                viewport.h,
              ) === null
            }
            className="flex h-11 w-11 items-center justify-center text-zinc-700 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title={`ズームアウト（−${ZOOM_DISPLAY_STEP_PCT}%）`}
            aria-label={`ズームアウト（−${ZOOM_DISPLAY_STEP_PCT}%）`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="h-px bg-zinc-200" aria-hidden />
          {/* Zoom % display (also clickable to reset zoom to 1) */}
          <button
            type="button"
            onClick={() => {
              if (viewport.w <= 0 || viewport.h <= 0) return;
              const b = cameraUIBaseline;
              if (b) {
                smoothCameraTo(b.pan, b.zoom, CAMERA_UI_SMOOTH_MS);
                return;
              }
              const z0 = zoomRef.current;
              const z1 = 1;
              const pan1 = panForZoomTowardViewportCenter(z0, panRef.current, z1, viewport.w, viewport.h);
              smoothCameraTo(pan1, z1, CAMERA_UI_SMOOTH_MS);
            }}
            className="flex h-8 w-11 items-center justify-center text-[11px] font-semibold tabular-nums text-zinc-500 transition hover:bg-indigo-50 hover:text-indigo-700"
            title={
              cameraUIBaseline
                ? "初期の表示領域（100%）に戻す"
                : "ズーム100%にリセット"
            }
            aria-label={
              cameraUIBaseline ? "初期の表示領域（100%）に戻す" : "ズーム100%にリセット"
            }
          >
            {cameraUIBaseline && cameraUIBaseline.zoom > 1e-9
              ? `${Math.round((zoom / cameraUIBaseline.zoom) * 100)}%`
              : `${Math.round(zoom * 100)}%`}
          </button>
          <div className="h-px bg-zinc-200" aria-hidden />
          {/* 初期100% と同じ向き／範囲へ戻す（旧「全体フィット」の枠線アイコン） */}
          <button
            type="button"
            onClick={() => {
              if (viewport.w <= 0 || viewport.h <= 0) return;
              const b = cameraUIBaseline;
              if (b) {
                smoothCameraTo(b.pan, b.zoom, CAMERA_UI_SMOOTH_MS);
                return;
              }
              const worldPos = worldPositionsRef.current;
              if (worldPos.size === 0) return;
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              const hx = CARD_W / 2;
              const hy = CARD_H / 2;
              for (const bn of builtNodes) {
                const p = worldPos.get(bn.norm);
                if (!p) continue;
                if (p.x - hx < minX) minX = p.x - hx;
                if (p.y - hy < minY) minY = p.y - hy;
                if (p.x + hx > maxX) maxX = p.x + hx;
                if (p.y + hy > maxY) maxY = p.y + hy;
              }
              if (!isFinite(minX)) return;
              const bboxW = maxX - minX;
              const bboxH = maxY - minY;
              const cx = (minX + maxX) / 2;
              const cy = (minY + maxY) / 2;
              const PAD = 60;
              const vp = viewportRef.current?.getBoundingClientRect();
              if (!vp) return;
              const zX = (vp.width - PAD * 2) / Math.max(1, bboxW);
              const zY = (vp.height - PAD * 2) / Math.max(1, bboxH);
              const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zX, zY)));
              const targetPan = { x: -cx * z, y: -cy * z };
              smoothCameraTo(targetPan, z, CAMERA_FIT_SMOOTH_MS);
            }}
            className="flex h-11 w-11 items-center justify-center text-zinc-700 transition hover:bg-indigo-50 hover:text-indigo-700"
            title={
              cameraUIBaseline ? "初期表示（100%）に戻す" : "全体にフィット"
            }
            aria-label={
              cameraUIBaseline ? "初期表示（100%）に戻す" : "全体にフィット"
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Detail modal */}
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
                {detailOgp?.imageUrl && !detailImgError ? (
                  <OgpTileMedia pageUrl={detailUrl} imageUrl={detailOgp.imageUrl} slot="modal" loading={false} eager onError={() => setDetailImgError(true)} />
                ) : null}
                <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                  <h2 id="focus-detail-title" className="text-base font-semibold leading-snug text-zinc-900 sm:text-lg">
                    {detailOgpLoading ? "読み込み中…" : detailDisplayTitle}
                  </h2>
                  {(() => {
                    const platform = detectContentPlatform(detailUrl);
                    const PLATFORM_BTN: Record<
                      Exclude<ContentPlatformId, "other">,
                      { cls: string }
                    > = {
                      amazon: { cls: "bg-[#FF9900] text-white hover:brightness-95" },
                      youtube: { cls: "bg-[#FF0000] text-white hover:brightness-95" },
                      netflix: { cls: "bg-black text-[#E50914] hover:bg-zinc-900" },
                      disney: { cls: "bg-[#0063E5] text-white hover:brightness-95" },
                      prime: { cls: "bg-[#00A8E1] text-white hover:brightness-95" },
                      hulu: { cls: "bg-[#1CE783] text-zinc-900 hover:brightness-95" },
                      unext: { cls: "bg-[#0099FF] text-white hover:brightness-95" },
                      spotify: { cls: "bg-[#1DB954] text-white hover:brightness-95" },
                      apple_music: { cls: "bg-[#FA243C] text-white hover:brightness-95" },
                      youtube_music: { cls: "bg-[#FF0000] text-white hover:brightness-95" },
                    };
                    const meta = platform !== "other" ? PLATFORM_BTN[platform] : null;
                    const name =
                      platform !== "other"
                        ? contentPlatformDisplayName(platform as AllowedSynapsePlatform)
                        : null;
                    const label = name
                      ? isMusicContentPlatform(platform)
                        ? `${name}で聴く`
                        : `${name}で作品をみる`
                      : "ページを開く";
                    const cls = meta ? meta.cls : "bg-indigo-600 text-white hover:bg-indigo-500";
                    return (
                      <a
                        href={withSynapseAffiliate(detailUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${cls}`}
                      >
                        {label} <span aria-hidden>↗</span>
                      </a>
                    );
                  })()}
                  <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">概要</h3>
                    {detailOgp?.description?.trim() ? (
                      <>
                        <div className={["relative overflow-hidden", descExpanded ? "" : "max-h-[5.5em]"].join(" ")}>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{detailOgp.description.trim()}</p>
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
                  {outgoingSynapses.length + incomingSynapses.length > 0 ? (
                    <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                      <ul className="space-y-3">
                        {outgoingSynapses.length > 0 ? (
                          <>
                            <li className="text-[10px] font-semibold tracking-[0.05em] text-indigo-500">関連シナプス：出発</li>
                            {outgoingSynapses.map((s) => (
                              <RelatedSynapseRow
                                key={s.id}
                                synapse={s}
                                direction="outgoing"
                                focusNorm={detailFocusNorm}
                                accessToken={accessToken}
                                onClickOther={(url) => {
                                  onFocusUrl(url);
                                  window.setTimeout(() => {
                                    setDetailUrl(url);
                                    setDetailOpen(true);
                                  }, 180);
                                }}
                              />
                            ))}
                          </>
                        ) : null}
                        {incomingSynapses.length > 0 ? (
                          <>
                            <li className={["text-[10px] font-semibold tracking-[0.05em] text-zinc-500", outgoingSynapses.length > 0 ? "mt-4 pt-3 border-t border-zinc-200/70" : ""].join(" ")}>関連シナプス：着地</li>
                            {incomingSynapses.map((s) => (
                              <RelatedSynapseRow
                                key={s.id}
                                synapse={s}
                                direction="incoming"
                                focusNorm={detailFocusNorm}
                                accessToken={accessToken}
                                onClickOther={(url) => {
                                  onFocusUrl(url);
                                  window.setTimeout(() => {
                                    setDetailUrl(url);
                                    setDetailOpen(true);
                                  }, 180);
                                }}
                              />
                            ))}
                          </>
                        ) : null}
                      </ul>
                    </section>
                  ) : null}
                  <p className="break-all text-[11px] leading-snug text-zinc-500">{detailUrl}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Keyword note modal */}
      <AnimatePresence>
        {keywordNote ? (
          <motion.div key="keyword-note-overlay" className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <button type="button" aria-label="閉じる" className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px]" onClick={() => setKeywordNote(null)} />
            <motion.div
              role="dialog" aria-modal="true" aria-labelledby="keyword-note-title" aria-describedby="keyword-note-connection keyword-note-urls keyword-note-body"
              className="relative z-10 flex max-h-[min(85vh,620px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)]"
              initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-end gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
                <span id="keyword-note-title" className="sr-only">シナプス詳細</span>
                <button type="button" onClick={() => setKeywordNote(null)} className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900">閉じる</button>
              </div>
              <KeywordModalWorksLine
                sourceUrl={keywordNote.sourceUrl}
                targetUrl={keywordNote.targetUrl}
                focusUrl={focusUrl}
                onClickWork={(url) => {
                  // Close the keyword modal, refocus on the clicked work,
                  // and open its detail panel (matches the main-canvas click flow).
                  setKeywordNote(null);
                  onFocusUrl(url);
                  window.setTimeout(() => {
                    setDetailUrl(url);
                    setDetailOpen(true);
                  }, 180);
                }}
              />
              <ConnectionWorksUrlsStrip sourceUrl={keywordNote.sourceUrl} targetUrl={keywordNote.targetUrl} />
              <div id="keyword-note-body" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                <h2 className="text-sm font-semibold leading-snug text-indigo-900 sm:text-base">「{keywordNote.keyword}」</h2>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-3 sm:px-3.5 sm:py-3.5">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">接続理由</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{keywordNote.description.trim() || "（本文なし）"}</p>
                </div>
                {keywordNote.synapse ? (
                  <div className="flex items-center justify-between gap-2">
                    {keywordNote.synapse.user_id ? (
                      <PosterLink userId={keywordNote.synapse.user_id} />
                    ) : <span />}
                    <LikeButton synapse={keywordNote.synapse} accessToken={accessToken} />
                  </div>
                ) : null}
                {/* Multi-synapse navigation: when this pair has >1 synapse, show
                    prev/next + index indicator. */}
                {keywordNote.synapses && keywordNote.synapses.length > 1 ? (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const arr = keywordNote.synapses!;
                        const cur = keywordNote.currentIndex ?? 0;
                        const next = (cur - 1 + arr.length) % arr.length;
                        const s = arr[next];
                        setKeywordNote({
                          ...keywordNote,
                          synapse: s,
                          keyword: pickEdgeKeyword(s) ?? keywordNote.keyword,
                          description: s.description,
                          currentIndex: next,
                        });
                      }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      ← 前
                    </button>
                    <span className="text-[10px] font-medium tabular-nums text-zinc-500">
                      {(keywordNote.currentIndex ?? 0) + 1} / {keywordNote.synapses.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const arr = keywordNote.synapses!;
                        const cur = keywordNote.currentIndex ?? 0;
                        const next = (cur + 1) % arr.length;
                        const s = arr[next];
                        setKeywordNote({
                          ...keywordNote,
                          synapse: s,
                          keyword: pickEdgeKeyword(s) ?? keywordNote.keyword,
                          description: s.description,
                          currentIndex: next,
                        });
                      }}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      次 →
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

