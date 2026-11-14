import { NextResponse } from "next/server";
import { loadSynapseShare } from "@/lib/synapseShare";

/** GET /api/synapse/:id/share — シェア文面用に、接続タイトルと両端の作品名を返す */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadSynapseShare(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: data.id,
    title: data.title,
    source: { title: data.source.title },
    target: { title: data.target.title },
  });
}
