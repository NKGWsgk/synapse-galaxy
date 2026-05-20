import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/clients";
import { buildWorkEndpointMap } from "@/lib/workResolve";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";

const PAGE_SIZE = 1000;
/** PostgREST のデフォルト上限を超える件数を取るための安全上限（無限ループ防止） */
const MAX_PAGES = 50;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  try {
    const supabase = createAnonClient();
    const all: Record<string, unknown>[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("synapses")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (source) {
        const canon = normalizeSynapseEndpoint(source);
        if (canon !== source) {
          q = q.or(`source_url.eq.${source},source_url.eq.${canon}`);
        } else {
          q = q.eq("source_url", source);
        }
      }

      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const chunk = data ?? [];
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }

    const endpointUrls = all.flatMap((s) => {
      const row = s as { source_url?: string; target_url?: string };
      return [row.source_url, row.target_url].filter((u): u is string => typeof u === "string");
    });
    const workEndpoints = await buildWorkEndpointMap(supabase, endpointUrls);

    return NextResponse.json({ synapses: all, workEndpoints });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
