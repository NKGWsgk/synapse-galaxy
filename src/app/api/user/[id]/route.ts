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

  // 表示名（nickname → full_name → email → id-snippet）
  let displayName = userId.slice(0, 12);
  try {
    const { data: userResult } = await supabase.auth.admin.getUserById(userId);
    const meta = userResult?.user?.user_metadata;
    displayName =
      (meta?.nickname as string | undefined) ??
      (meta?.full_name as string | undefined) ??
      userResult?.user?.email ??
      userId.slice(0, 12);
  } catch { /* noop */ }

  return NextResponse.json({
    synapses: synapses ?? [],
    totalLikes,
    postCount: (synapses ?? []).length,
    displayName,
  });
}
