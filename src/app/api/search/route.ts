import { NextResponse } from "next/server";
import { fetchGraphEndpointNorms, isUrlOnGraph } from "@/lib/graphEndpoints";
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
    .select("url, title, image_url, site_name, updated_at")
    .ilike("title", `%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(32);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data ?? [])
    .filter((r) => typeof r.url === "string" && isUrlOnGraph(r.url, graphNorms))
    .slice(0, 8)
    .map((r) => ({
      url: r.url as string,
      title: r.title as string | null,
      imageUrl: r.image_url as string | null,
      siteName: r.site_name as string | null,
    }));

  return NextResponse.json({ results });
}
