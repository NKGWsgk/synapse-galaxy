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
 * synapse_likes を真とみなして synapses.likes_count を再集計する。
 * DB トリガー（sync_synapse_likes_count）が存在する環境では値が一致するため no-op。
 * トリガー未適用な環境でも整合を保つためのセーフティネット。
 */
async function resyncLikesCount(
  supabase: ReturnType<typeof createServiceClient>,
  synapseId: string,
): Promise<number> {
  const { count } = await supabase
    .from("synapse_likes")
    .select("id", { count: "exact", head: true })
    .eq("synapse_id", synapseId);
  const next = count ?? 0;
  await supabase.from("synapses").update({ likes_count: next }).eq("id", synapseId);
  return next;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: synapseId } = await params;
  const userId = await resolveUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("synapse_likes")
    .insert({ synapse_id: synapseId, user_id: userId });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const alreadyLiked = error?.code === "23505";

  // 通知: シナプス投稿者に liked 通知を送る（初回 like のみ）
  if (!alreadyLiked) {
    const { data: synapse } = await supabase
      .from("synapses")
      .select("user_id")
      .eq("id", synapseId)
      .maybeSingle();

    if (synapse?.user_id && synapse.user_id !== userId) {
      await supabase.from("notifications").insert({
        user_id: synapse.user_id,
        type: "liked",
        synapse_id: synapseId,
        actor_id: userId,
      });
    }
  }

  const likes_count = await resyncLikesCount(supabase, synapseId);
  return NextResponse.json({ ok: true, alreadyLiked, likes_count });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: synapseId } = await params;
  const userId = await resolveUser(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  await supabase
    .from("synapse_likes")
    .delete()
    .eq("synapse_id", synapseId)
    .eq("user_id", userId);

  const likes_count = await resyncLikesCount(supabase, synapseId);
  return NextResponse.json({ ok: true, likes_count });
}

/** ユーザーがいいね済みのシナプスIDセットを返す */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: synapseId } = await params;
  const userId = await resolveUser(req);
  if (!userId) return NextResponse.json({ liked: false });

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("synapse_likes")
    .select("id")
    .eq("synapse_id", synapseId)
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({ liked: Boolean(data) });
}
