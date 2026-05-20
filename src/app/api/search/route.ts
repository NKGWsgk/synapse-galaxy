import { NextResponse } from "next/server";
import { fetchGraphEndpointNorms, isUrlOnGraph } from "@/lib/graphEndpoints";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
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
    const workId = (r.canonical_id as string) ?? r.url;
    const row: Row = {
      url: normalizeSynapseEndpoint(r.url),
      title: r.title as string | null,
      imageUrl: r.image_url as string | null,
      siteName: r.site_name as string | null,
      updatedAt: (r.updated_at as string) ?? "",
    };
    const prev = byWork.get(workId);
    if (!prev || row.updatedAt > prev.updatedAt) byWork.set(workId, row);
  }

  const results = [...byWork.values()]
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
