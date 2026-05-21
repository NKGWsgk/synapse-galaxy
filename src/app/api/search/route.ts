import { NextResponse } from "next/server";
import { fetchGraphEndpointNorms, isUrlOnGraph } from "@/lib/graphEndpoints";
import { extractPureWorkTitle } from "@/lib/pureWorkTitle";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { computeWorkFingerprint } from "@/lib/workIdentity";
import { createAnonClient } from "@/lib/supabase/clients";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });

  const supabase = createAnonClient();
  const graphNorms = await fetchGraphEndpointNorms(supabase);
  if (graphNorms.size === 0) return NextResponse.json({ results: [] });

  const { data, error } = await supabase
    .from("contents_metadata")
    .select("url, title, image_url, site_name, updated_at, canonical_id")
    .ilike("title", `%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(48);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    url: string;
    title: string | null;
    imageUrl: string | null;
    siteName: string | null;
    updatedAt: string;
  };

  const byWork = new Map<string, Row>();

  for (const r of data ?? []) {
    if (typeof r.url !== "string" || !isUrlOnGraph(r.url, graphNorms)) continue;
    const normUrl = normalizeSynapseEndpoint(r.url);
    const pure = extractPureWorkTitle(r.title as string | null, normUrl) ?? (r.title as string | null);
    const groupKey = computeWorkFingerprint(pure, normUrl);
    const row: Row = {
      url: normUrl,
      title: pure,
      imageUrl: r.image_url as string | null,
      siteName: r.site_name as string | null,
      updatedAt: (r.updated_at as string) ?? "",
    };
    const prev = byWork.get(groupKey);
    if (!prev || row.updatedAt > prev.updatedAt) byWork.set(groupKey, row);
  }

  // 同一正規化 URL は1件に（canonical 未統合の残骸対策）
  const byNormUrl = new Map<string, Row>();
  for (const row of byWork.values()) {
    const prev = byNormUrl.get(row.url);
    if (!prev || row.updatedAt > prev.updatedAt) byNormUrl.set(row.url, row);
  }

  const results = [...byNormUrl.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)
    .map(({ url, title, imageUrl, siteName }) => ({
      url,
      title,
      imageUrl,
      siteName,
    }));

  return NextResponse.json({ results });
}
