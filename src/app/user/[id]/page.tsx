import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/clients";
import { UserProfilePage } from "@/components/galaxy/UserProfilePage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `ユーザー ${id.slice(0, 8)}… | Synapse Galaxy` };
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

  return (
    <UserProfilePage
      userId={userId}
      synapses={(synapses ?? []) as Parameters<typeof UserProfilePage>[0]["synapses"]}
      totalLikes={totalLikes}
    />
  );
}
