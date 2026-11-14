import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/clients";
import { UserProfilePage } from "@/components/galaxy/UserProfilePage";
import { SITE_NAME_EN, SITE_NAME_JA } from "@/lib/siteMetadata";
import { publicDisplayName } from "@/lib/userGalaxy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  let displayName = id.slice(0, 8);
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.auth.admin.getUserById(id);
    if (data?.user) {
      displayName = publicDisplayName(data.user.user_metadata);
    }
  } catch { /* noop */ }
  return {
    title: `${displayName}のシナプス`,
    description: `${SITE_NAME_JA}（${SITE_NAME_EN}）の${displayName}さんのプロフィール。投稿したシナプス（コンテンツ間の接続）と受け取ったいいね数を確認できます。`,
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
    displayName = publicDisplayName(userResult.user.user_metadata);
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
