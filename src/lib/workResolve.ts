import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGraphEndpointNorms, isUrlOnGraph } from "@/lib/graphEndpoints";
import { findCanonicalMatch } from "@/lib/gemini/canonicalize";
import { extractPureWorkTitle } from "@/lib/pureWorkTitle";
import { mergePurchaseLinks, purchaseLinksFromUrl, type PurchaseLinks } from "@/lib/purchaseLinks";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { computeWorkFingerprint } from "@/lib/workIdentity";
import { resolveShareSlug } from "@/lib/shareSlugResolve";
import { isLikelyKatakanaRomajiSlug } from "@/lib/workShareSlug";

export type ContentMetadataLite = {
  url: string;
  canonical_id: string;
  work_fingerprint: string | null;
  share_slug: string | null;
  purchase_links: unknown;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  updated_at: string;
};

export type WorkEndpointInfo = {
  workId: string;
  representativeUrl: string;
  title: string | null;
  shareSlug: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

export type WorkEndpointMap = Record<string, WorkEndpointInfo>;

function urlLookupCandidates(raw: string): string[] {
  const norm = normalizeSynapseEndpoint(raw);
  return Array.from(new Set([raw.trim(), norm].filter(Boolean)));
}

async function findMetadataByUrl(
  supabase: SupabaseClient,
  rawUrl: string,
): Promise<ContentMetadataLite | null> {
  for (const u of urlLookupCandidates(rawUrl)) {
    const { data } = await supabase
      .from("contents_metadata")
      .select(
        "url,canonical_id,work_fingerprint,share_slug,purchase_links,title,description,image_url,site_name,updated_at",
      )
      .eq("url", u)
      .maybeSingle();
    if (data) return data as unknown as ContentMetadataLite;
  }
  return null;
}

async function findMetadataByFingerprint(
  supabase: SupabaseClient,
  fingerprint: string,
  excludeUrl: string,
): Promise<ContentMetadataLite | null> {
  const { data } = await supabase
    .from("contents_metadata")
    .select(
      "url,canonical_id,work_fingerprint,share_slug,purchase_links,title,description,image_url,site_name,updated_at",
    )
    .eq("work_fingerprint", fingerprint)
    .neq("url", excludeUrl)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data as unknown as ContentMetadataLite) : null;
}

async function unifyPurchaseLinksForCanonicalId(
  supabase: SupabaseClient,
  canonicalId: string,
  delta: PurchaseLinks,
) {
  if (Object.keys(delta).length === 0) return;
  const { data: existing } = await supabase
    .from("contents_metadata")
    .select("purchase_links")
    .eq("canonical_id", canonicalId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const merged = mergePurchaseLinks(existing?.purchase_links, delta);
  await supabase.from("contents_metadata").update({ purchase_links: merged }).eq("canonical_id", canonicalId);
}

async function findShareSlugByCanonicalId(
  supabase: SupabaseClient,
  canonicalId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("contents_metadata")
    .select("share_slug")
    .eq("canonical_id", canonicalId)
    .not("share_slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const slug = (data as { share_slug?: string | null } | null)?.share_slug?.trim();
  return slug || null;
}

async function unifyShareSlugForCanonicalId(
  supabase: SupabaseClient,
  canonicalId: string,
  slug: string,
) {
  const { error } = await supabase
    .from("contents_metadata")
    .update({ share_slug: slug })
    .eq("canonical_id", canonicalId);
  if (error?.message?.includes("share_slug")) return;
  if (error) throw new Error(error.message);
}

async function ensureShareSlugForRow(
  supabase: SupabaseClient,
  row: ContentMetadataLite,
  pureTitle: string | null,
  titleChanged: boolean,
): Promise<string | null> {
  let slug = row.share_slug?.trim() || null;
  if (!slug) {
    slug = await findShareSlugByCanonicalId(supabase, row.canonical_id);
  }
  if (slug && !titleChanged && !isLikelyKatakanaRomajiSlug(slug)) return slug;

  const resolved = await resolveShareSlug({
    title: pureTitle ?? row.title,
    description: row.description,
    url: row.url,
    siteName: row.site_name,
    existingSlug: slug,
    titleChanged,
  });
  if (!resolved) return slug;

  await unifyShareSlugForCanonicalId(supabase, row.canonical_id, resolved);
  return resolved;
}

/** 1 作品の share_slug を Gemini で確保（オンデマンド API 用）。 */
export async function ensureShareSlugForUrl(
  supabase: SupabaseClient,
  rawUrl: string,
): Promise<string | null> {
  const existing = await findMetadataByUrl(supabase, rawUrl);
  if (!existing) return null;
  const pureTitle = extractPureWorkTitle(existing.title, existing.url) ?? existing.title;
  return ensureShareSlugForRow(supabase, existing, pureTitle, false);
}

function pickSearchNeedle(title: string): string | null {
  const cleaned = title
    .replace(/^【[^】]+】/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[|｜].*$/g, " ")
    .replace(/[:：].*$/g, " ")
    .replace(/[（）()［］\[\]「」『』【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+/g).filter(Boolean);
  const best = parts.sort((a, b) => b.length - a.length)[0] ?? cleaned;
  const needle = best.slice(0, 32).trim();
  return needle.length >= 2 ? needle : null;
}

async function resolveCanonicalIdForNewUrl(
  supabase: SupabaseClient,
  graphNorms: Set<string>,
  url: string,
  pureTitle: string | null,
  description: string | null,
  siteName: string | null,
  fingerprint: string,
): Promise<string | null> {
  const byFp = await findMetadataByFingerprint(supabase, fingerprint, url);
  if (byFp) return byFp.canonical_id;

  const needle = pureTitle ? pickSearchNeedle(pureTitle) : null;
  if (!needle) return null;

  const { data: candidates } = await supabase
    .from("contents_metadata")
    .select("canonical_id,title,url,site_name,work_fingerprint")
    .ilike("title", `%${needle}%`)
    .limit(16);

  const packed =
    (candidates ?? [])
      .filter((c) => {
        const rec = c as { url?: unknown };
        return typeof rec?.url === "string" && rec.url !== url && isUrlOnGraph(rec.url, graphNorms);
      })
      .map((c) => {
        const rec = c as {
          canonical_id: string;
          title: string | null;
          url: string;
          site_name: string | null;
          work_fingerprint: string | null;
        };
        return {
          canonicalId: rec.canonical_id,
          title: rec.title ?? null,
          url: rec.url,
          siteName: rec.site_name ?? null,
          fingerprint: rec.work_fingerprint,
        };
      }) ?? [];

  const sameFp = packed.find((p) => p.fingerprint === fingerprint);
  if (sameFp) return sameFp.canonicalId;

  if (packed.length === 0) return null;

  const judged = await findCanonicalMatch(
    { url, title: pureTitle, description, siteName },
    packed.map((p) => ({
      canonicalId: p.canonicalId,
      title: p.title,
      url: p.url,
      siteName: p.siteName,
    })),
  );
  if (judged.ok && judged.matchedCanonicalId) return judged.matchedCanonicalId;
  return null;
}

/**
 * 正規化 URL でメタデータを upsert。作品フィンガープリントと canonical_id を統一ルールで付与。
 */
export async function upsertContentMetadata(
  supabase: SupabaseClient,
  rawUrl: string,
  fields: {
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
  },
  opts?: { graphNorms?: Set<string> },
): Promise<ContentMetadataLite> {
  const url = normalizeSynapseEndpoint(rawUrl);
  const pureTitle = extractPureWorkTitle(fields.title, url) ?? fields.title;
  const fingerprint = computeWorkFingerprint(pureTitle ?? fields.title, url);
  const deltaLinks = purchaseLinksFromUrl(url);

  const existing = await findMetadataByUrl(supabase, rawUrl);
  if (existing) {
    const mergedLinks = mergePurchaseLinks(existing.purchase_links, deltaLinks);
    const updatePayload: Record<string, unknown> = {
      url,
      title: pureTitle,
      description: fields.description,
      image_url: fields.imageUrl,
      site_name: fields.siteName,
      purchase_links: mergedLinks,
      updated_at: new Date().toISOString(),
    };
    updatePayload.work_fingerprint = fingerprint;
    let { data, error } = await supabase
      .from("contents_metadata")
      .update(updatePayload)
      .eq("url", existing.url)
      .select()
      .single();
    if (error?.message?.includes("work_fingerprint")) {
      delete updatePayload.work_fingerprint;
      ({ data, error } = await supabase
        .from("contents_metadata")
        .update(updatePayload)
        .eq("url", existing.url)
        .select()
        .single());
    }
    if (error) throw new Error(error.message);
    let row = data as unknown as ContentMetadataLite;
    await unifyPurchaseLinksForCanonicalId(supabase, row.canonical_id, deltaLinks);
    const titleChanged = (existing.title ?? "") !== (pureTitle ?? "");
    const slug = await ensureShareSlugForRow(supabase, row, pureTitle, titleChanged);
    if (slug) row = { ...row, share_slug: slug };
    return row;
  }

  const graphNorms = opts?.graphNorms ?? (await fetchGraphEndpointNorms(supabase));
  let canonicalId = (await findMetadataByFingerprint(supabase, fingerprint, url))?.canonical_id ?? null;

  if (!canonicalId) {
    canonicalId = await resolveCanonicalIdForNewUrl(
      supabase,
      graphNorms,
      url,
      pureTitle,
      fields.description,
      fields.siteName,
      fingerprint,
    );
  }

  const insertPayload: Record<string, unknown> = {
    url,
    title: pureTitle,
    description: fields.description,
    image_url: fields.imageUrl,
    site_name: fields.siteName,
    purchase_links: deltaLinks,
    updated_at: new Date().toISOString(),
  };
  insertPayload.work_fingerprint = fingerprint;
  if (canonicalId) insertPayload.canonical_id = canonicalId;

  let { data, error } = await supabase.from("contents_metadata").insert(insertPayload).select().single();
  if (error?.message?.includes("work_fingerprint")) {
    delete insertPayload.work_fingerprint;
    ({ data, error } = await supabase.from("contents_metadata").insert(insertPayload).select().single());
  }
  if (error) throw new Error(error.message);
  let row = data as unknown as ContentMetadataLite;
  await unifyPurchaseLinksForCanonicalId(supabase, row.canonical_id, deltaLinks);
  const slug = await ensureShareSlugForRow(supabase, row, pureTitle, true);
  if (slug) row = { ...row, share_slug: slug };
  return row;
}

/** グラフ endpoint（正規化 URL）→ 作品 ID マップ */
export async function buildWorkEndpointMap(
  supabase: SupabaseClient,
  endpointUrls: string[],
): Promise<WorkEndpointMap> {
  const normUrls = Array.from(
    new Set(endpointUrls.map((u) => normalizeSynapseEndpoint(u)).filter(Boolean)),
  );
  if (normUrls.length === 0) return {};

  const { data, error } = await supabase
    .from("contents_metadata")
    .select("url,canonical_id,title,image_url,site_name,work_fingerprint,share_slug,updated_at");
  if (error) throw new Error(error.message);

  const byNorm = new Map<string, ContentMetadataLite[]>();
  for (const row of data ?? []) {
    const rec = row as unknown as ContentMetadataLite;
    const norm = normalizeSynapseEndpoint(rec.url);
    const list = byNorm.get(norm) ?? [];
    list.push(rec);
    byNorm.set(norm, list);
  }

  const byWorkId = new Map<string, ContentMetadataLite>();
  for (const rows of byNorm.values()) {
    const best = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]!;
    const prev = byWorkId.get(best.canonical_id);
    if (!prev || prev.updated_at < best.updated_at) byWorkId.set(best.canonical_id, best);
  }

  const out: WorkEndpointMap = {};
  for (const norm of normUrls) {
    const rows = byNorm.get(norm);
    if (!rows?.length) continue;
    const hit = rows[0]!;
    const rep = byWorkId.get(hit.canonical_id) ?? hit;
    const displayTitle =
      extractPureWorkTitle(rep.title, rep.url) ?? extractPureWorkTitle(hit.title, hit.url) ?? rep.title;
    out[norm] = {
      workId: hit.canonical_id,
      representativeUrl: rep.url,
      title: displayTitle,
      shareSlug: rep.share_slug?.trim() || null,
      imageUrl: rep.image_url,
      siteName: rep.site_name,
    };
  }
  return out;
}

/** スラッグ未設定の作品に Gemini で share_slug を付与（1リクエストあたり上限あり）。 */
export async function backfillMissingShareSlugs(
  supabase: SupabaseClient,
  byWorkId: Map<string, ContentMetadataLite>,
  limit = 6,
): Promise<number> {
  let done = 0;
  for (const rec of byWorkId.values()) {
    if (done >= limit) break;
    const existing = rec.share_slug?.trim();
    if (existing && !isLikelyKatakanaRomajiSlug(existing)) continue;
    const pureTitle = extractPureWorkTitle(rec.title, rec.url) ?? rec.title;
    const slug = await ensureShareSlugForRow(supabase, rec, pureTitle, false);
    if (slug) {
      rec.share_slug = slug;
      done++;
    }
  }
  return done;
}

/** グラフ上の作品だけ share_slug を非同期 backfill する（synapses API の after 用）。 */
export async function backfillShareSlugsForEndpointUrls(
  supabase: SupabaseClient,
  endpointUrls: string[],
  limit = 999,
): Promise<number> {
  const normUrls = Array.from(
    new Set(endpointUrls.map((u) => normalizeSynapseEndpoint(u)).filter(Boolean)),
  );
  if (normUrls.length === 0) return 0;

  const { data, error } = await supabase
    .from("contents_metadata")
    .select("url,canonical_id,title,description,image_url,site_name,work_fingerprint,share_slug,purchase_links,updated_at");
  if (error) return 0;

  const byNorm = new Map<string, ContentMetadataLite[]>();
  for (const row of data ?? []) {
    const rec = row as unknown as ContentMetadataLite;
    const norm = normalizeSynapseEndpoint(rec.url);
    const list = byNorm.get(norm) ?? [];
    list.push(rec);
    byNorm.set(norm, list);
  }

  const byWorkId = new Map<string, ContentMetadataLite>();
  for (const rows of byNorm.values()) {
    const best = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]!;
    const prev = byWorkId.get(best.canonical_id);
    if (!prev || prev.updated_at < best.updated_at) byWorkId.set(best.canonical_id, best);
  }

  const onGraph = new Map<string, ContentMetadataLite>();
  for (const norm of normUrls) {
    const hit = byNorm.get(norm)?.[0];
    if (!hit) continue;
    const rep = byWorkId.get(hit.canonical_id);
    if (rep) onGraph.set(hit.canonical_id, rep);
  }

  return backfillMissingShareSlugs(supabase, onGraph, limit);
}

export function workKeyForUrl(normUrl: string, workMap: WorkEndpointMap): string {
  return workMap[normUrl]?.workId ?? normUrl;
}

export function representativeUrlForNorm(normUrl: string, workMap: WorkEndpointMap, fallback: string): string {
  return workMap[normUrl]?.representativeUrl ?? fallback;
}
