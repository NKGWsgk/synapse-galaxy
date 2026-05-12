import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/clients";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });

  const supabase = createAnonClient();

  const { data, error } = await supabase
    .from("contents_metadata")
    .select("url, title, image_url, site_name")
    .ilike("title", `%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data ?? []).map((r) => ({
    url: r.url as string,
    title: r.title as string | null,
    imageUrl: r.image_url as string | null,
    siteName: r.site_name as string | null,
  }));

  return NextResponse.json({ results });
}
