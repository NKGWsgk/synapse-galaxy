import { NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_SYNAPSE_URL_MESSAGE, isAllowedSynapseUrl } from "@/lib/contentPlatform";
import { fetchGraphEndpointNorms } from "@/lib/graphEndpoints";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { evaluateSynapseDimensions } from "@/lib/gemini/dimensions";
import { suggestEdgeKeywordLineBreak } from "@/lib/gemini/edgeKeywordBreak";
import { fetchOgpResilient, pureTitleForResponse } from "@/lib/ogpResolve";
import { SYNAPSE_EDGE_REASON_MAX_CHARS, SYNAPSE_EDGE_TITLE_MAX_CHARS } from "@/lib/synapseLimits";
import { createAuthedAnonClient, createServiceClient } from "@/lib/supabase/clients";
import { upsertContentMetadata } from "@/lib/workResolve";
const synapseUrlSchema = z
  .string()
  .url()
  .refine(isAllowedSynapseUrl, { message: ALLOWED_SYNAPSE_URL_MESSAGE });

const bodySchema = z.object({
  sourceUrl: synapseUrlSchema,
  targetUrl: synapseUrlSchema,
  title: z.string().min(1).max(SYNAPSE_EDGE_TITLE_MAX_CHARS),
  description: z.string().min(1).max(SYNAPSE_EDGE_REASON_MAX_CHARS),
});

async function upsertMetadata(url: string, graphNorms: Set<string>) {
  const og = await fetchOgpResilient(url);
  const supabase = createServiceClient();
  return upsertContentMetadata(
    supabase,
    url,
    {
      title: pureTitleForResponse(og.title, url),
      description: og.description,
      imageUrl: og.imageUrl,
      siteName: og.siteName,
    },
    { graphNorms },
  );
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
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const first =
      fieldErrors.sourceUrl?.[0] ??
      fieldErrors.targetUrl?.[0] ??
      parsed.error.issues[0]?.message;
    return NextResponse.json({ error: first ?? "Invalid request" }, { status: 400 });
  }

  const { sourceUrl: rawSource, targetUrl: rawTarget, title, description } = parsed.data;

  const sourceUrl = normalizeSynapseEndpoint(rawSource);
  const targetUrl = normalizeSynapseEndpoint(rawTarget);

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

    if (!authedUserId) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const graphNorms = await fetchGraphEndpointNorms(supabase);

    // メタデータ取得（並行）
    const [sourceMeta, targetMeta] = await Promise.all([
      upsertMetadata(sourceUrl, graphNorms),
      upsertMetadata(targetUrl, graphNorms),
    ]);

    // AI次元評価・接続題折返し案（並行／いずれの失敗も保存は続行）
    const [dimResult, keywordStored] = await Promise.all([
      evaluateSynapseDimensions({
        sourceTitle: (sourceMeta as { title?: string | null } | null)?.title ?? null,
        sourceUrl,
        targetTitle: (targetMeta as { title?: string | null } | null)?.title ?? null,
        targetUrl,
        connectionTitle: title,
        connectionDescription: description,
      }),
      suggestEdgeKeywordLineBreak(title),
    ]);
    const dims = dimResult.ok ? dimResult.dimensions : null;
    if (!dimResult.ok) {
      console.warn("[smart-input] 次元評価失敗（スキップして保存続行）:", dimResult.message);
    }

    const { data, error } = await supabase
      .from("synapses")
      .insert({
        // body の userId は誤ってFKに刺さる事故が起きやすいので、ログイン済み時のみ採用
        user_id: authedUserId,
        source_url: sourceUrl,
        target_url: targetUrl,
        description,
        keywords: [keywordStored],
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

    // 通知: 同じコンテンツにシナプスを繋いだユーザーへ new_synapse
    const [{ data: bySource }, { data: byTarget }] = await Promise.all([
      supabase
        .from("synapses")
        .select("user_id")
        .in("source_url", [sourceUrl, targetUrl])
        .not("user_id", "is", null)
        .neq("user_id", authedUserId),
      supabase
        .from("synapses")
        .select("user_id")
        .in("target_url", [sourceUrl, targetUrl])
        .not("user_id", "is", null)
        .neq("user_id", authedUserId),
    ]);

    const recipientIds = new Set<string>();
    for (const row of [...(bySource ?? []), ...(byTarget ?? [])]) {
      const uid = (row as { user_id?: string | null }).user_id;
      if (uid && uid !== authedUserId) recipientIds.add(uid);
    }

    if (recipientIds.size > 0) {
      await supabase.from("notifications").insert(
        [...recipientIds].map((user_id) => ({
          user_id,
          type: "new_synapse" as const,
          synapse_id: (data as { id: string }).id,
          actor_id: authedUserId,
        })),
      );
    }

    return NextResponse.json({ synapse: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[smart-input]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
