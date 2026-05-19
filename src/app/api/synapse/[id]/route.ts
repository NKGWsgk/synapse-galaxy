import { NextResponse } from "next/server";
import { createAuthedAnonClient, createServiceClient } from "@/lib/supabase/clients";

async function resolveUser(req: Request): Promise<string | null> {
  const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) return null;
  try {
    const token = authz.slice("Bearer ".length).trim();
    const authed = createAuthedAnonClient(token);
    const { data } = await authed.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * DELETE /api/synapse/:id
 * シナプス削除。投稿者本人のみ削除可能。
 * 関連する synapse_likes はカスケード削除（テーブル定義の外部キー制約に従う）。
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: synapseId } = await params;
  const userId = await resolveUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // 所有者確認
  const { data: row, error: fetchError } = await supabase
    .from("synapses")
    .select("user_id")
    .eq("id", synapseId)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 削除実行（関連 likes は ON DELETE CASCADE で削除される想定）
  const { error: deleteError } = await supabase
    .from("synapses")
    .delete()
    .eq("id", synapseId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
