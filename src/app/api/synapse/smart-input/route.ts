import { NextResponse } from "next/server";
import { z } from "zod";
import { withAmazonAffiliate } from "@/lib/amazon";
import { findCanonicalMatch } from "@/lib/gemini/canonicalize";
import { evaluateSynapseDimensions } from "@/lib/gemini/dimensions";
import { fetchOgp } from "@/lib/ogp";
import { mergePurchaseLinks, purchaseLinksFromUrl } from "@/lib/purchaseLinks";
import { createAuthedAnonClient, createServiceClient } from "@/lib/supabase/clients";
const bodySchema = z.object({
  sourceUrl: z.string().url(),
  targetUrl: z.string().url(),
  title: z.string().min(1).max(30),
  description: z.string().min(1).max(4000),
});

type ContentMetadataLite = {
  url: string;
  canonical_id: string;
  purchase_links: unknown;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  updated_at: string;
};

function normalizeTitleForSearch(title: string): string {
  return title
    .replace(/^【[^】]+】/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[|｜].*$/g, " ")
    .replace(/[:：].*$/g, " ")
    .replace(/[（）()［］\[\]「」『』【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSearchNeedle(title: string): string | null {
  const cleaned = normalizeTitleForSearch(title);
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+/g).filter(Boolean);
  // 日本語タイトルはスペースが無いことが多いので、まずは先頭の塊を優先
  const best = parts.sort((a, b) => b.length - a.length)[0] ?? cleaned;
  const needle = best.slice(0, 32).trim();
  return needle.length >= 2 ? needle : null;
}

async function unifyPurchaseLinksForCanonicalId(
  supabase: ReturnType<typeof createServiceClient>,
  canonicalId: string,
  delta: Record<string, string>,
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

async function upsertMetadata(url: string) {
  const og = await fetchOgp(url);
  const supabase = createServiceClient();

  const deltaLinks = purchaseLinksFromUrl(url);

  // 既存 URL は canonical_id を固定したままメタだけ更新
  const { data: existing } = await supabase
    .from("contents_metadata")
    .select("url,canonical_id,purchase_links,title,description,image_url,site_name,updated_at")
    .eq("url", url)
    .maybeSingle();
  if (existing) {
    const ex = existing as unknown as ContentMetadataLite;
    const mergedLinks = mergePurchaseLinks(ex.purchase_links, deltaLinks);
    const { data, error } = await supabase
      .from("contents_metadata")
      .update({
        title: og.title,
        description: og.description,
        image_url: og.imageUrl,
        site_name: og.siteName,
        purchase_links: mergedLinks,
        updated_at: new Date().toISOString(),
      })
      .eq("url", url)
      .select()
      .single();
    if (error) throw new Error(error.message);
    const row = data as unknown as ContentMetadataLite;
    await unifyPurchaseLinksForCanonicalId(supabase, row.canonical_id, deltaLinks);
    return data;
  }

  // 新規 URL: title で候補を引いて Gemini で同一判定
  const needle = og.title ? pickSearchNeedle(og.title) : null;
  let matchedCanonicalId: string | null = null;
  if (needle) {
    const { data: candidates } = await supabase
      .from("contents_metadata")
      .select("canonical_id,title,url,site_name")
      .ilike("title", `%${needle}%`)
      .limit(12);

    const packed =
      (candidates ?? [])
        .filter((c) => {
          const rec = c as unknown as { url?: unknown };
          return typeof rec?.url === "string" && rec.url !== url;
        })
        .map((c) => {
          const rec = c as unknown as {
            canonical_id: string;
            title: string | null;
            url: string;
            site_name: string | null;
          };
          return {
            canonicalId: rec.canonical_id,
            title: rec.title ?? null,
            url: rec.url,
            siteName: rec.site_name ?? null,
          };
        }) ?? [];

    const judged = await findCanonicalMatch(
      { url, title: og.title ?? null, description: og.description ?? null, siteName: og.siteName ?? null },
      packed,
    );
    if (judged.ok) {
      matchedCanonicalId = judged.matchedCanonicalId;
    }
  }

  const insertPayload: Record<string, unknown> = {
    url,
    title: og.title,
    description: og.description,
    image_url: og.imageUrl,
    site_name: og.siteName,
    purchase_links: deltaLinks,
    updated_at: new Date().toISOString(),
  };
  if (matchedCanonicalId) {
    insertPayload.canonical_id = matchedCanonicalId;
  }

  const { data, error } = await supabase.from("contents_metadata").insert(insertPayload).select().single();
  if (error) throw new Error(error.message);
  const row = data as unknown as ContentMetadataLite;
  await unifyPurchaseLinksForCanonicalId(supabase, row.canonical_id, deltaLinks);
  return data;
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sourceUrl: rawSource, targetUrl: rawTarget, title, description } = parsed.data;

  const sourceUrl = withAmazonAffiliate(rawSource);
  const targetUrl = withAmazonAffiliate(rawTarget);

  try {
    // ログイン中なら Authorization の access token から user_id を確定（クライアントの自己申告より優先）
    let authedUserId: string | null = null;
    const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (authz?.startsWith("Bearer ")) {
      const token = authz.slice("Bearer ".length).trim();
      try {
        const authed = createAuthedAnonClient(token);
        const { data } = await authed.auth.getUser();
        authedUserId = data.user?.id ?? null;
      } catch {
        authedUserId = null;
      }
    }

    // メタデータ取得（並行）
    const [sourceMeta, targetMeta] = await Promise.all([
      upsertMetadata(sourceUrl),
      upsertMetadata(targetUrl),
    ]);

    // AI次元評価（失敗してもシナプス保存は続行）
    const dimResult = await evaluateSynapseDimensions({
      sourceTitle: (sourceMeta as { title?: string | null } | null)?.title ?? null,
      sourceUrl,
      targetTitle: (targetMeta as { title?: string | null } | null)?.title ?? null,
      targetUrl,
      connectionTitle: title,
      connectionDescription: description,
    });
    const dims = dimResult.ok ? dimResult.dimensions : null;
    if (!dimResult.ok) {
      console.warn("[smart-input] 次元評価失敗（スキップして保存続行）:", dimResult.message);
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("synapses")
      .insert({
        // body の userId は誤ってFKに刺さる事故が起きやすいので、ログイン済み時のみ採用
        user_id: authedUserId ?? null,
        source_url: sourceUrl,
        target_url: targetUrl,
        description,
        keywords: [title],
        dim_rika:   dims?.dim_rika   ?? null,
        dim_bunkei: dims?.dim_bunkei ?? null,
        dim_art:    dims?.dim_art    ?? null,
        dim_time:   dims?.dim_time   ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ synapse: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[smart-input]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
