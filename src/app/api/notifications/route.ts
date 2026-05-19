import { NextResponse } from "next/server";
import { createAuthedAnonClient, createServiceClient } from "@/lib/supabase/clients";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";

async function resolveUser(req: Request): Promise<{ userId: string; token: string } | null> {
  const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authz?.startsWith("Bearer ")) return null;
  try {
    const token = authz.slice("Bearer ".length).trim();
    const authed = createAuthedAnonClient(token);
    const { data } = await authed.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return null;
    return { userId, token };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = await resolveUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAuthedAnonClient(auth.token);

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, synapse_id, actor_id, read, created_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const synapseIds = [...new Set((data ?? []).map((n) => n.synapse_id).filter(Boolean))] as string[];
  const focusUrlBySynapseId = new Map<string, string>();

  if (synapseIds.length > 0) {
    const service = createServiceClient();
    const { data: synapses } = await service
      .from("synapses")
      .select("id, source_url")
      .in("id", synapseIds);

    for (const row of synapses ?? []) {
      const rec = row as { id: string; source_url: string };
      focusUrlBySynapseId.set(rec.id, normalizeSynapseEndpoint(rec.source_url));
    }
  }

  const notifications = (data ?? []).map((n) => ({
    ...n,
    focusUrl: n.synapse_id ? focusUrlBySynapseId.get(n.synapse_id) ?? null : null,
  }));

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}
