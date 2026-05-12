import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;
  const supabase = createServiceClient();

  // ユーザーのシナプス一覧
  const { data: synapses, error } = await supabase
    .from("synapses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // いいね合計
  const totalLikes = (synapses ?? []).reduce((sum, s) => sum + (s.likes_count ?? 0), 0);

  return NextResponse.json({ synapses: synapses ?? [], totalLikes, postCount: (synapses ?? []).length });
}
