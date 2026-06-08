import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGraphEndpointNorms, isUrlOnGraph } from "@/lib/graphEndpoints";
import { findCanonicalMatch } from "@/lib/gemini/canonicalize";
import { fetchOgpResilient, mergeOgpTitle, needsWorkDisplayRefresh } from "@/lib/ogpResolve";
import { extractPureWorkTitle } from "@/lib/pureWorkTitle";
import { mergePurchaseLinks, purchaseLinksFromUrl, type PurchaseLinks } from "@/lib/purchaseLinks";
import { canonicalAmazonMediaUrl } from "@/lib/amazon";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { computeWorkFingerprint } from "@/lib/workIdentity";
import { resolveShareSlug } from "@/lib/shareSlugResolve";
import { isLikelyKatakanaRomajiSlug } from "@/lib/workShareSlug";
import { pickBestImageUrl, pickRepresentativeRow } from "@/lib/workRepresentative";

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
    workId: row.canonical_id,
  });
  if (!resolved) return slug;

  await unifyShareSlugForCanonicalId(supabase, row.canonical_id, resolved);
  return resolved;
}

async function ensureMetadataRowForUrl(
  supabase: SupabaseClient,
  rawUrl: string,
  graphNorms: Set<string>,
): Promise<ContentMetadataLite | null> {
  const url = normalizeSynapseEndpoint(rawUrl);
  const existing = await findMetadataByUrl(supabase, rawUrl);
  if (existing && !needsWorkDisplayRefresh(existing.title, existing.image_url, url)) {
    return existing;
  }

  try {
    const og = await fetchOgpResilient(url);
    return await upsertContentMetadata(
      supabase,
      url,
      {
        title: mergeOgpTitle(og.title, existing?.title, url),
        description: og.description ?? existing?.description ?? null,
        imageUrl: og.imageUrl ?? existing?.image_url ?? null,
        siteName: og.siteName ?? existing?.site_name ?? null,
      },
      { graphNorms },
    );
  } catch {
    return existing ?? null;
  }
}

async function runMetadataEnsureBatch(
  supabase: SupabaseClient,
  urls: string[],
  graphNorms: Set<string>,
  concurrency: number,
): Promise<void> {
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    await Promise.all(batch.map((url) => ensureMetadataRowForUrl(supabase, url, graphNorms)));
  }
}

/**
 * グラフ endpoint のうちメタデータ未登録・弱いタイトル・画像不足の URL に OGP を取得して upsert。
 * syncLimit 超過分はバックグラウンドで続行する。
 */
export async function ensureMetadataForEndpointUrls(
  supabase: SupabaseClient,
  endpointUrls: string[],
  concurrency = 4,
  syncLimit = 40,
): Promise<{ ensured: number; pending: number }> {
  const normUrls = Array.from(
    new Set(endpointUrls.map((u) => normalizeSynapseEndpoint(u)).filter(Boolean)),
  );
  if (normUrls.length === 0) return { ensured: 0, pending: 0 };

  const lookupUrls = Array.from(
    new Set(endpointUrls.flatMap((u) => urlLookupCandidates(u)).filter(Boolean)),
  );
  const metaByNorm = new Map<string, { title: string | null; image_url: string | null }>();
  const BATCH = 200;
  for (let i = 0; i < lookupUrls.length; i += BATCH) {
    const batch = lookupUrls.slice(i, i + BATCH);
    const { data } = await supabase.from("contents_metadata").select("url,title,image_url").in("url", batch);
    for (const row of data ?? []) {
      const rec = row as { url: string; title: string | null; image_url: string | null };
      metaByNorm.set(normalizeSynapseEndpoint(rec.url), {
        title: rec.title,
        image_url: rec.image_url,
      });
    }
  }

  const needsOgp = normUrls
    .filter((norm) => {
      const meta = metaByNorm.get(norm);
      return needsWorkDisplayRefresh(meta?.title ?? null, meta?.image_url ?? null, norm);
    })
    .sort((a, b) => {
      const aMissing = !metaByNorm.get(a)?.title?.trim();
      const bMissing = !metaByNorm.get(b)?.title?.trim();
      if (aMissing !== bMissing) return aMissing ? -1 : 1;
      const aNoImg = !metaByNorm.get(a)?.image_url?.trim();
      const bNoImg = !metaByNorm.get(b)?.image_url?.trim();
      if (aNoImg !== bNoImg) return aNoImg ? -1 : 1;
      return a.localeCompare(b);
    });

  if (needsOgp.length === 0) return { ensured: 0, pending: 0 };

  const graphNorms = await fetchGraphEndpointNorms(supabase);
  const syncBatch = needsOgp.slice(0, syncLimit);
  const pendingBatch = needsOgp.slice(syncLimit);

  await runMetadataEnsureBatch(supabase, syncBatch, graphNorms, concurrency);

  if (pendingBatch.length > 0) {
    void runMetadataEnsureBatch(supabase, pendingBatch, graphNorms, concurrency).catch((e) => {
      console.error("[ensureMetadataForEndpointUrls/background]", e);
    });
  }

  return { ensured: syncBatch.length, pending: pendingBatch.length };
}

/** 1 作品の share_slug を Gemini で確保（オンデマンド API 用）。 */
export async function ensureShareSlugForUrl(
  supabase: SupabaseClient,
  rawUrl: string,
): Promise<string | null> {
  const graphNorms = await fetchGraphEndpointNorms(supabase);
  const existing = await ensureMetadataRowForUrl(supabase, rawUrl, graphNorms);
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
  const url = canonicalAmazonMediaUrl(normalizeSynapseEndpoint(rawUrl), fields.title);
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

  const lookupUrls = Array.from(
    new Set(endpointUrls.flatMap((u) => urlLookupCandidates(u)).filter(Boolean)),
  );

  const METADATA_SELECT =
    "url,canonical_id,title,image_url,site_name,work_fingerprint,share_slug,updated_at";
  const BATCH = 200;
  const directRows: ContentMetadataLite[] = [];

  for (let i = 0; i < lookupUrls.length; i += BATCH) {
    const batch = lookupUrls.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("contents_metadata")
      .select(METADATA_SELECT)
      .in("url", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) directRows.push(row as unknown as ContentMetadataLite);
  }

  const byNorm = new Map<string, ContentMetadataLite[]>();
  for (const row of directRows) {
    const norm = normalizeSynapseEndpoint(row.url);
    const list = byNorm.get(norm) ?? [];
    list.push(row);
    byNorm.set(norm, list);
  }

  const canonicalIds = Array.from(
    new Set(
      normUrls
        .map((norm) => byNorm.get(norm)?.[0]?.canonical_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const repRows: ContentMetadataLite[] = [...directRows];
  if (canonicalIds.length > 0) {
    for (let i = 0; i < canonicalIds.length; i += BATCH) {
      const batch = canonicalIds.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from("contents_metadata")
        .select(METADATA_SELECT)
        .in("canonical_id", batch);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) repRows.push(row as unknown as ContentMetadataLite);
    }
  }

  const byWorkId = new Map<string, ContentMetadataLite[]>();
  for (const row of repRows) {
    const list = byWorkId.get(row.canonical_id) ?? [];
    list.push(row);
    byWorkId.set(row.canonical_id, list);
  }

  const out: WorkEndpointMap = {};
  for (const norm of normUrls) {
    const rows = byNorm.get(norm);
    if (!rows?.length) continue;
    const hit = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]!;
    const siblings = byWorkId.get(hit.canonical_id) ?? [hit];
    const rep = pickRepresentativeRow(siblings, norm);
    const imageUrl = pickBestImageUrl(siblings) ?? rep.image_url;
    const displayTitle =
      extractPureWorkTitle(rep.title, rep.url) ?? extractPureWorkTitle(hit.title, hit.url) ?? rep.title;
    out[norm] = {
      workId: hit.canonical_id,
      representativeUrl: rep.url,
      title: displayTitle,
      shareSlug: rep.share_slug?.trim() || null,
      imageUrl,
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
  concurrency = 3,
): Promise<number> {
  const normUrls = Array.from(
    new Set(endpointUrls.map((u) => normalizeSynapseEndpoint(u)).filter(Boolean)),
  );
  if (normUrls.length === 0) return 0;

  const workMap = await buildWorkEndpointMap(supabase, endpointUrls);
  const targets = normUrls
    .map((norm) => ({ norm, info: workMap[norm] }))
    .filter((x): x is { norm: string; info: NonNullable<(typeof workMap)[string]> } => {
      if (!x.info) return false;
      const slug = x.info.shareSlug?.trim();
      return !slug || isLikelyKatakanaRomajiSlug(slug);
    })
    .slice(0, limit);

  let done = 0;
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(({ info }) => ensureShareSlugForUrl(supabase, info.representativeUrl)),
    );
    done += results.filter(Boolean).length;
  }
  return done;
}

export function workKeyForUrl(normUrl: string, workMap: WorkEndpointMap): string {
  return workMap[normUrl]?.workId ?? normUrl;
}

export function representativeUrlForNorm(normUrl: string, workMap: WorkEndpointMap, fallback: string): string {
  return workMap[normUrl]?.representativeUrl ?? fallback;
}
