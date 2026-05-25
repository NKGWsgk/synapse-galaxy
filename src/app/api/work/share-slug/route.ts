import { NextResponse } from "next/server";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { createServiceClient } from "@/lib/supabase/clients";
import { ensureShareSlugForUrl } from "@/lib/workResolve";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const url = normalizeSynapseEndpoint(raw);
    const service = createServiceClient();
    const slug = await ensureShareSlugForUrl(service, url);
    return NextResponse.json({ slug, url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
