import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/clients";
import { UserProfilePage } from "@/components/galaxy/UserProfilePage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `ユーザー ${id.slice(0, 8)}…`,
    description: "シナプスギャラクシー（Synapse Galaxy）のユーザープロフィール。投稿したシナプス（コンテンツ間の接続）と受け取ったいいね数を確認できます。",
  };
}

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;
  const supabase = createServiceClient();

  const { data: synapses } = await supabase
    .from("synapses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const totalLikes = (synapses ?? []).reduce((sum, s) => sum + ((s as { likes_count?: number }).likes_count ?? 0), 0);

  // Resolve display name (nickname → full_name → email → id-snippet)
  let displayName = userId.slice(0, 12);
  try {
    const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userResult?.user) {
      notFound();
    }
    const meta = userResult.user.user_metadata;
    displayName =
      (meta?.nickname as string | undefined) ??
      (meta?.full_name as string | undefined) ??
      userResult.user.email ??
      userId.slice(0, 12);
  } catch {
    notFound();
  }

  return (
    <UserProfilePage
      userId={userId}
      displayName={displayName}
      synapses={(synapses ?? []) as Parameters<typeof UserProfilePage>[0]["synapses"]}
      totalLikes={totalLikes}
    />
  );
}
