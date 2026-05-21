"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SynapseRow } from "@/lib/supabase/clients";
import { getOgpImageDisplaySrc, isWeakContentTitleLabel, resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { isVideoStyleOgpPageUrl } from "@/lib/ogpImagePresentation";
import { buildFocusConnectionSets, type FocusConnectionSet } from "@/lib/focusConnections";
import type { WorkEndpointMap } from "@/lib/workEndpoint";
import { fetchWorkOgpFull } from "@/lib/workOgpFull";
import { createBrowserClient } from "@/lib/supabase/browser";
import { WorkPlatformLink } from "@/components/galaxy/WorkPlatformLink";
import { ContentPlatformMark } from "@/components/galaxy/ContentPlatformMark";
import {
  fetchOgpMiniPayload,
  LikeButton,
  OgpTileMedia,
  ogpMiniCache,
} from "@/components/galaxy/FocusCompass";
import {
  FocusDetailModals,
  type FocusDetailController,
  type GraphDetailRequest,
} from "@/components/galaxy/FocusDetailModals";

type Props = {
  focusUrl: string;
  synapses: SynapseRow[];
  workMap: WorkEndpointMap;
  onFocusUrl: (url: string) => void;
  detailRequest?: GraphDetailRequest | null;
  onDetailRequestHandled?: () => void;
};

type OgpMini = { title: string | null; imageUrl: string | null };

function flatKeyword(raw: string): string {
  return raw.normalize("NFC").replace(/\r/g, "").replace(/\n/g, "").replace(/\u200b/g, "");
}

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
      <a href={`/user/${userId}`} className="text-indigo-600 transition hover:text-indigo-800 hover:underline">
        {name ?? "…"}
      </a>
    </span>
  );
}

function useAccessToken(): string | null {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  return accessToken;
}

function useWorkOgp(url: string): { data: OgpMini | null; loading: boolean; imgError: boolean; setImgError: (v: boolean) => void } {
  const [data, setData] = useState<OgpMini | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancel = false;
    const hit = ogpMiniCache.get(url);
    if (hit) {
      // 画像があればタイトルが弱くても表示する（Amazon 等）
      if ((hit.imageUrl ?? "").trim()) {
        setData(hit);
        setLoading(false);
        return;
      }
      const label = resolveContentDisplayTitle(hit.title, url);
      if (!isWeakContentTitleLabel(label, url)) {
        setData(hit);
        setLoading(false);
        return;
      }
      ogpMiniCache.delete(url);
    }
    setLoading(true);
    setImgError(false);
    void fetchOgpMiniPayload(url)
      .then((o) => { if (!cancel) setData(o ?? { title: null, imageUrl: null }); })
      .catch(() => { if (!cancel) setData({ title: null, imageUrl: null }); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [url]);

  return { data, loading, imgError, setImgError };
}

/**
 * スクロール連動インジケーター。
 * sticky ヘッダー直下〜リスト末尾の「読み取り領域」で最も面積が見えているカードを active にする。
 * （センター距離より一般的で、末尾カードでも正しく追従する）
 */
function useActiveConnectionIndex(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  stickyRef: React.RefObject<HTMLDivElement | null>,
  cardRefs: React.MutableRefObject<(HTMLElement | null)[]>,
  count: number,
): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || count === 0) return;

    function updateIndex() {
      const sticky = stickyRef.current;
      if (!root || count === 0) return;

      const rootRect = root.getBoundingClientRect();
      const viewTop = sticky?.getBoundingClientRect().bottom ?? rootRect.top;
      const viewBottom = rootRect.bottom;

      // 末尾までスクロールしたら最後のカードを active に
      if (root.scrollHeight - root.scrollTop - root.clientHeight < 24) {
        setIndex(count - 1);
        return;
      }

      let best = 0;
      let bestVisible = -1;
      for (let i = 0; i < count; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const visible = Math.min(r.bottom, viewBottom) - Math.max(r.top, viewTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = i;
        }
      }
      if (bestVisible >= 0) setIndex(best);
    }

    updateIndex();
    root.addEventListener("scroll", updateIndex, { passive: true });
    window.addEventListener("resize", updateIndex);
    const ro = stickyRef.current ? new ResizeObserver(updateIndex) : null;
    if (stickyRef.current) ro?.observe(stickyRef.current);
    return () => {
      root.removeEventListener("scroll", updateIndex);
      window.removeEventListener("resize", updateIndex);
      ro?.disconnect();
    };
  }, [scrollRef, stickyRef, cardRefs, count]);

  return index;
}

function FocusHeroImage({ url }: { url: string }) {
  const { data, loading, imgError, setImgError } = useWorkOgp(url);
  const displayTitle = resolveContentDisplayTitle(data?.title ?? null, url);
  const showImage = !!data?.imageUrl && !imgError;

  return (
    <div className="relative isolate h-[20dvh] min-h-[6.5rem] max-h-[11rem] w-full overflow-hidden">
      <div className="absolute inset-0">
        <OgpTileMedia
          pageUrl={url}
          imageUrl={showImage ? data!.imageUrl : null}
          slot="feedConnection"
          loading={loading}
          eager
          onError={() => setImgError(true)}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-zinc-900/85 via-zinc-900/35 to-transparent px-3 pb-2 pt-8">
        <p className="line-clamp-1 text-[13px] font-semibold leading-snug text-white">
          {loading ? "読み込み中…" : displayTitle}
        </p>
      </div>
    </div>
  );
}

function FocusWorkIntroPanel({
  url,
  expanded,
  onToggle,
}: {
  url: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [ogp, setOgp] = useState<{ description: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void fetchWorkOgpFull(url)
      .then((data) => {
        if (cancel) return;
        setOgp(data ? { description: data.description } : null);
      })
      .catch(() => { if (!cancel) setOgp(null); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [url]);

  const description = ogp?.description?.trim() ?? "";
  const hasDescription = loading || description.length > 0;

  return (
    <>
      <div className="relative z-[1] flex items-center justify-between gap-2 border-t border-zinc-100 bg-white px-3 py-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          disabled={!hasDescription}
          onClick={() => { if (hasDescription) onToggle(); }}
          className={[
            "flex min-w-0 items-center gap-1 text-left",
            hasDescription ? "active:opacity-70" : "cursor-default",
          ].join(" ")}
        >
          <span className="text-[10px] font-semibold tracking-[0.14em] text-zinc-500">作品紹介</span>
          {hasDescription ? (
            <svg
              className={["h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          ) : null}
        </button>
        <WorkPlatformLink url={url} compact inline />
      </div>

      {expanded ? (
        <div className="border-t border-zinc-100 bg-white px-3 py-2">
          {loading ? (
            <p className="text-[11px] leading-relaxed text-zinc-400">読み込み中…</p>
          ) : description ? (
            <p className="whitespace-pre-wrap text-[11px] leading-[1.45] text-zinc-600 [overflow-wrap:anywhere]">
              {description}
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-500">概要テキストを取得できませんでした。</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function FocusFocusBlock({
  url,
  expanded,
  onToggle,
}: {
  url: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-indigo-200/70 bg-white shadow-sm ring-1 ring-indigo-100/80">
      <FocusHeroImage url={url} />
      <FocusWorkIntroPanel url={url} expanded={expanded} onToggle={onToggle} />
    </div>
  );
}

/** YouTube 16:9 より横幅をやや狭い統一サムネ枠 */
const FEED_THUMB_W = "8.5rem";
const FEED_THUMB_H = "5.375rem";

function ConnectionDirectionMark({ outgoing }: { outgoing: boolean }) {
  return (
    <svg
      className="h-2.5 w-2.5 shrink-0 fill-indigo-500"
      viewBox="0 0 8 8"
      aria-hidden
    >
      {outgoing ? (
        <path d="M2 1 L7 4 L2 7 Z" />
      ) : (
        <path d="M6 1 L1 4 L6 7 Z" />
      )}
    </svg>
  );
}

function ConnectionKeywordRow({
  keyword,
  isOutgoing,
  onKeywordNote,
}: {
  keyword: string | null;
  isOutgoing: boolean;
  onKeywordNote: () => void;
}) {
  if (keyword) {
    const label = flatKeyword(keyword);
    return (
      <button
        type="button"
        onClick={onKeywordNote}
        className="mb-1.5 flex max-w-full items-center gap-1 text-left transition active:opacity-70"
        title={label}
      >
        {!isOutgoing ? <ConnectionDirectionMark outgoing={false} /> : null}
        <span className="min-w-0 text-[13px] font-semibold leading-snug text-indigo-800 [overflow-wrap:anywhere]">
          {label}
        </span>
        {isOutgoing ? <ConnectionDirectionMark outgoing /> : null}
      </button>
    );
  }

  return (
    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-zinc-500">
      {!isOutgoing ? <ConnectionDirectionMark outgoing={false} /> : null}
      <span>{isOutgoing ? "この作品からつながる" : "この作品へつながる"}</span>
      {isOutgoing ? <ConnectionDirectionMark outgoing /> : null}
    </p>
  );
}

function ConnectionDots({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
}) {
  if (count <= 0) return null;
  return (
    <div
      className="flex items-center justify-center gap-0.5 py-px"
      role="tablist"
      aria-label={`接続 ${active + 1} / ${count}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === active}
          aria-label={`接続 ${i + 1} へ移動`}
          onClick={() => onSelect(i)}
          className="flex h-7 w-7 items-center justify-center rounded-full transition active:bg-zinc-200/60"
        >
          <span
            aria-hidden
            className={[
              "rounded-full transition-all duration-200",
              i === active
                ? "h-2 w-2 bg-indigo-500 shadow-sm shadow-indigo-200"
                : "h-1.5 w-1.5 border border-zinc-300/90 bg-white",
            ].join(" ")}
          />
        </button>
      ))}
    </div>
  );
}

function FeedUniformThumb({
  url,
  loading,
  imageUrl,
  imgError,
  onError,
}: {
  url: string;
  loading: boolean;
  imageUrl: string | null | undefined;
  imgError: boolean;
  onError: () => void;
}) {
  const isVideo = isVideoStyleOgpPageUrl(url);
  const showImage = !!imageUrl && !imgError;
  const src = showImage ? getOgpImageDisplaySrc(imageUrl!, url) : "";

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-200 shadow-sm"
      style={{ width: FEED_THUMB_W, height: FEED_THUMB_H }}
    >
      {loading ? <div className="absolute inset-0 z-10 animate-pulse bg-zinc-200" aria-hidden /> : null}
      {!loading && showImage ? (
        isVideo ? (
          // 16:9 映像を 14:9 枠に — 左右をわずかにトリミング
          <img
            src={src}
            alt=""
            className="h-full w-full scale-[1.12] object-cover object-center"
            loading="lazy"
            onError={onError}
          />
        ) : (
          // 縦長（本）— 上下をわずかにトリミング、左右はグレー余白
          <img
            src={src}
            alt=""
            className="absolute left-1/2 top-1/2 h-[112%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2"
            loading="lazy"
            onError={onError}
          />
        )
      ) : null}
      <ContentPlatformMark pageUrl={url} />
    </div>
  );
}

function ConnectionSetCard({
  set,
  cardRef,
  accessToken,
  onPickWork,
  onKeywordNote,
}: {
  set: FocusConnectionSet;
  cardRef: (el: HTMLElement | null) => void;
  accessToken: string | null;
  onPickWork: (url: string) => void;
  onKeywordNote: (set: FocusConnectionSet) => void;
}) {
  const { synapse, keyword, neighborUrl, isOutgoing } = set;
  const { data, loading, imgError, setImgError } = useWorkOgp(neighborUrl);
  const displayTitle = resolveContentDisplayTitle(data?.title ?? null, neighborUrl);
  const description = synapse.description?.trim() ?? "";
  const [descOpen, setDescOpen] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [descTruncated, setDescTruncated] = useState(false);

  useEffect(() => {
    setDescOpen(false);
  }, [set.id]);

  useLayoutEffect(() => {
    if (descOpen || !description) {
      setDescTruncated(false);
      return;
    }
    const el = descRef.current;
    if (!el) return;
    setDescTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [description, descOpen, set.id]);

  return (
    <article
      ref={cardRef}
      className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_1px_8px_rgba(0,0,0,0.05)]"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1 text-left">
          <ConnectionKeywordRow
            keyword={keyword}
            isOutgoing={isOutgoing}
            onKeywordNote={() => onKeywordNote(set)}
          />

          <div className="min-w-0">
            {description ? (
              descOpen ? (
                <button
                  type="button"
                  aria-expanded
                  onClick={() => setDescOpen(false)}
                  className="w-full text-left transition active:opacity-80"
                >
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-500 [overflow-wrap:anywhere]">
                    {description}
                  </p>
                  <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-400">
                    閉じる
                    <svg
                      className="h-3 w-3 shrink-0 rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                    </svg>
                  </span>
                </button>
              ) : (
                <div>
                  <p
                    ref={descRef}
                    className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-500 [overflow-wrap:anywhere]"
                  >
                    {description}
                  </p>
                  {descTruncated ? (
                    <button
                      type="button"
                      aria-expanded={false}
                      onClick={() => setDescOpen(true)}
                      className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-500 transition active:text-indigo-700"
                    >
                      続きを読む
                      <svg
                        className="h-3 w-3 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              )
            ) : (
              <p className="text-[11px] leading-relaxed text-zinc-400">接続理由はキーワードをタップ</p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onPickWork(neighborUrl)}
          className="shrink-0 transition active:opacity-80"
          style={{ width: FEED_THUMB_W }}
        >
          <FeedUniformThumb
            url={neighborUrl}
            loading={loading}
            imageUrl={data?.imageUrl}
            imgError={imgError}
            onError={() => setImgError(true)}
          />
          <p className="mt-1 line-clamp-2 text-center text-[11px] font-semibold leading-snug text-zinc-900 [overflow-wrap:anywhere]">
            {loading ? "読み込み中…" : displayTitle}
          </p>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
        {synapse.user_id ? <PosterLink userId={synapse.user_id} /> : <span />}
        <LikeButton synapse={synapse} accessToken={accessToken} />
      </div>
    </article>
  );
}

export function ScrollFeedView({
  focusUrl,
  synapses,
  workMap,
  onFocusUrl,
  detailRequest,
  onDetailRequestHandled,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<FocusDetailController>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [introOpen, setIntroOpen] = useState(false);
  const accessToken = useAccessToken();

  const connectionSets = useMemo(
    () => buildFocusConnectionSets(focusUrl, synapses, workMap),
    [focusUrl, synapses, workMap],
  );

  const activeConnectionIndex = useActiveConnectionIndex(
    scrollRef,
    stickyRef,
    cardRefs,
    connectionSets.length,
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToTop();
    setIntroOpen(false);
  }, [focusUrl, scrollToTop]);

  useEffect(() => {
    if (!detailRequest) return;
    scrollToTop();
    setIntroOpen(false);
    onDetailRequestHandled?.();
  }, [detailRequest?.nonce, detailRequest, onDetailRequestHandled, scrollToTop]);

  const handlePickWork = useCallback((url: string) => {
    onFocusUrl(url);
  }, [onFocusUrl]);

  const handleKeywordNote = useCallback((set: FocusConnectionSet) => {
    const keyword = set.keyword ?? "接続";
    detailRef.current?.openKeywordNote({
      keyword,
      description: set.synapse.description,
      sourceUrl: set.synapse.source_url,
      targetUrl: set.synapse.target_url,
      synapse: set.synapse,
    });
  }, []);

  const setCardRef = useCallback((index: number) => (el: HTMLElement | null) => {
    cardRefs.current[index] = el;
  }, []);

  const scrollToConnection = useCallback((index: number) => {
    const root = scrollRef.current;
    const el = cardRefs.current[index];
    const sticky = stickyRef.current;
    if (!root || !el) return;
    const stickyH = sticky?.offsetHeight ?? 0;
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetTop = root.scrollTop + (elRect.top - rootRect.top) - stickyH - 6;
    root.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }, []);

  return (
    <>
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      >
        <div
          ref={stickyRef}
          className={[
            "sticky top-0 z-20 isolate flex flex-col gap-1 border-b border-zinc-200/80 bg-zinc-50 px-3 pb-1 pt-1 sm:px-4",
            introOpen ? "" : "max-h-[33dvh] min-h-0 overflow-hidden",
          ].join(" ")}
        >
          <FocusFocusBlock
            url={focusUrl}
            expanded={introOpen}
            onToggle={() => setIntroOpen((v) => !v)}
          />
          {connectionSets.length > 0 ? (
            <ConnectionDots
              count={connectionSets.length}
              active={activeConnectionIndex}
              onSelect={scrollToConnection}
            />
          ) : null}
        </div>

        <div className="relative z-0 space-y-3 px-3 py-3 pb-12 sm:px-4">
          {connectionSets.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-400">まだ接続がありません</p>
          ) : (
            connectionSets.map((set, index) => (
              <ConnectionSetCard
                key={set.id}
                set={set}
                cardRef={setCardRef(index)}
                accessToken={accessToken}
                onPickWork={handlePickWork}
                onKeywordNote={handleKeywordNote}
              />
            ))
          )}
        </div>
      </div>

      <FocusDetailModals
        ref={detailRef}
        focusUrl={focusUrl}
        synapses={synapses}
        workMap={workMap}
        onFocusUrl={onFocusUrl}
        detailModalEnabled={false}
      />
    </>
  );
}
