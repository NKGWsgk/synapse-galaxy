import { NextResponse } from "next/server";
import { createAuthedAnonClient } from "@/lib/supabase/clients";

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

export async function POST(req: Request) {
  const auth = await resolveUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAuthedAnonClient(auth.token);

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", auth.userId)
    .eq("read", false);

  return NextResponse.json({ ok: true });
}
