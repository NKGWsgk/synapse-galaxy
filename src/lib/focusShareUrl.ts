import { amazonAsinFromUrl, isAmazonUrl } from "@/lib/amazon";
import { detectContentPlatform } from "@/lib/contentPlatform";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import type { WorkEndpointMap } from "@/lib/workResolve";
import { isAcceptableShareSlug, shareSlugKey } from "@/lib/workShareSlug";

const AMAZON_ASIN_ONLY = /^[A-Z0-9]{10}$/i;
const AMAZON_COM = /^a\.com\/([A-Z0-9]{10})$/i;
const YOUTUBE = /^y\/([A-Za-z0-9_-]{11})$/;
const YOUTUBE_MUSIC = /^ym\/([A-Za-z0-9_-]{11})$/;
const NETFLIX = /^n\/(\d+)$/;
const SPOTIFY = /^s\/(track|album|episode|show)\/([A-Za-z0-9]+)$/;
const SLUG_DISAMBIG = /^(.+)~([0-9a-f]{6})$/i;

function youtubeVideoId(url: URL): string | null {
  if (url.hostname === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    return id || null;
  }
  if (url.hostname.includes("youtube.com")) {
    return url.searchParams.get("v");
  }
  return null;
}

function netflixTitleId(url: URL): string | null {
  const m = url.pathname.match(/\/title\/(\d+)/);
  return m?.[1] ?? null;
}

function spotifyPath(url: URL): string | null {
  const m = url.pathname.match(/\/(track|album|episode|show)\/([A-Za-z0-9]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function encodePlatformFallback(normalizedUrl: string): string {
  const norm = normalizeSynapseEndpoint(normalizedUrl);
  try {
    const u = new URL(norm);
    const platform = detectContentPlatform(norm);

    if (platform === "amazon") {
      const asin = amazonAsinFromUrl(norm);
      if (!asin) return norm;
      const host = u.hostname.toLowerCase();
      if (host.includes("amazon.com") && !host.includes("amazon.co.jp")) {
        return `a.com/${asin.toUpperCase()}`;
      }
      return asin.toUpperCase();
    }

    if (platform === "youtube") {
      const vid = youtubeVideoId(u);
      if (vid) return `y/${vid}`;
    }

    if (platform === "youtube_music") {
      const vid = youtubeVideoId(u);
      if (vid) return `ym/${vid}`;
    }

    if (platform === "netflix") {
      const id = netflixTitleId(u);
      if (id) return `n/${id}`;
    }

    if (platform === "spotify") {
      const path = spotifyPath(u);
      if (path) return `s/${path}`;
    }
  } catch {
    /* fall through */
  }
  return norm;
}

function workInfoForUrl(normalizedUrl: string, workMap?: WorkEndpointMap) {
  if (!workMap) return null;
  const norm = normalizeSynapseEndpoint(normalizedUrl);
  return workMap[norm] ?? null;
}

function shareSlugForWork(info: { shareSlug?: string | null }): string | null {
  const slug = info.shareSlug?.trim();
  if (!slug || !isAcceptableShareSlug(slug)) return null;
  return slug;
}

/** 英語スラッグ → 代表 URL（同名は workId 接尾辞で区別）。 */
function lookupWorkBySlug(raw: string, workMap: WorkEndpointMap): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const disambig = trimmed.match(SLUG_DISAMBIG);
  const slugBody = disambig ? disambig[1]! : trimmed;
  const idHint = disambig?.[2]?.toLowerCase();
  const slugKey = shareSlugKey(slugBody);

  const matches: string[] = [];
  for (const info of Object.values(workMap)) {
    const baseSlug = shareSlugForWork(info);
    if (!baseSlug || shareSlugKey(baseSlug) !== slugKey) continue;

    const url = normalizeSynapseEndpoint(info.representativeUrl);
    if (idHint) {
      if (info.workId.replace(/-/g, "").toLowerCase().startsWith(idHint)) return url;
      continue;
    }
    matches.push(url);
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  return [...matches].sort()[0]!;
}

/** ブラウザ URL の `?focus=` 用。作品名スラッグ（ASCII）優先、なければプラットフォーム ID。 */
export function encodeFocusParam(normalizedUrl: string, workMap?: WorkEndpointMap): string {
  const info = workInfoForUrl(normalizedUrl, workMap);
  const baseSlug = info ? shareSlugForWork(info) : null;
  if (baseSlug) {
    const key = shareSlugKey(baseSlug);
    let collision = false;
    for (const other of Object.values(workMap ?? {})) {
      if (!info || other.workId === info.workId) continue;
      const otherSlug = shareSlugForWork(other);
      if (otherSlug && shareSlugKey(otherSlug) === key) {
        collision = true;
        break;
      }
    }
    if (collision && info) {
      const suffix = info.workId.replace(/-/g, "").slice(0, 6).toLowerCase();
      return `${baseSlug}~${suffix}`;
    }
    return baseSlug;
  }
  return encodePlatformFallback(normalizedUrl);
}

/** `?focus=` を正規化済み作品 URL に復元（スラッグ・旧形式すべて対応）。 */
export function decodeFocusParam(raw: string, workMap?: WorkEndpointMap): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  if (workMap && Object.keys(workMap).length > 0) {
    const byTitle = lookupWorkBySlug(trimmed, workMap);
    if (byTitle) return byTitle;
  }

  if (AMAZON_ASIN_ONLY.test(trimmed)) {
    return normalizeSynapseEndpoint(`https://www.amazon.co.jp/dp/${trimmed.toUpperCase()}`);
  }

  const comMatch = trimmed.match(AMAZON_COM);
  if (comMatch) {
    return normalizeSynapseEndpoint(`https://www.amazon.com/dp/${comMatch[1]!.toUpperCase()}`);
  }

  const ytMatch = trimmed.match(YOUTUBE);
  if (ytMatch) {
    return normalizeSynapseEndpoint(`https://www.youtube.com/watch?v=${ytMatch[1]}`);
  }

  const ymMatch = trimmed.match(YOUTUBE_MUSIC);
  if (ymMatch) {
    return normalizeSynapseEndpoint(`https://music.youtube.com/watch?v=${ymMatch[1]}`);
  }

  const nfMatch = trimmed.match(NETFLIX);
  if (nfMatch) {
    return normalizeSynapseEndpoint(`https://www.netflix.com/title/${nfMatch[1]}`);
  }

  const spMatch = trimmed.match(SPOTIFY);
  if (spMatch) {
    return normalizeSynapseEndpoint(`https://open.spotify.com/${spMatch[1]}/${spMatch[2]}`);
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || isAmazonUrl(trimmed)) {
    return normalizeSynapseEndpoint(trimmed);
  }

  return trimmed;
}

export function syncFocusParamInSearchParams(
  params: URLSearchParams,
  publicUrl: string,
  workMap?: WorkEndpointMap,
): boolean {
  const encoded = encodeFocusParam(publicUrl, workMap);
  const current = params.get("focus");
  if (current === encoded) return false;
  params.set("focus", encoded);
  return true;
}
