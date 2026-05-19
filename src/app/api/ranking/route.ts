import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/clients";

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("synapses")
    .select("user_id, likes_count")
    .not("user_id", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = new Map<string, { totalLikes: number; postCount: number }>();
  for (const row of data ?? []) {
    if (!row.user_id) continue;
    const prev = map.get(row.user_id) ?? { totalLikes: 0, postCount: 0 };
    map.set(row.user_id, {
      totalLikes: prev.totalLikes + (row.likes_count ?? 0),
      postCount: prev.postCount + 1,
    });
  }

  const topIds = [...map.entries()]
    .sort((a, b) => b[1].totalLikes - a[1].totalLikes || b[1].postCount - a[1].postCount)
    .slice(0, 10)
    .map(([id]) => id);

  // ユーザー名・アバターをまとめて取得
  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMeta = new Map(
    (usersData?.users ?? []).map((u) => [
      u.id,
      {
        name:
          (u.user_metadata?.nickname as string | undefined) ??
          (u.user_metadata?.full_name as string | undefined) ??
          u.email ??
          u.id.slice(0, 8),
        avatar: (u.user_metadata?.avatar_url as string | undefined) ?? null,
      },
    ]),
  );

  const ranking = topIds.map((userId, i) => ({
    rank: i + 1,
    userId,
    name: userMeta.get(userId)?.name ?? userId.slice(0, 8),
    avatar: userMeta.get(userId)?.avatar ?? null,
    ...map.get(userId)!,
  }));

  return NextResponse.json({ ranking });
}
