import { NextResponse } from "next/server";
import { createAnonClient, createServiceClient } from "@/lib/supabase/clients";
import { buildWorkEndpointMap } from "@/lib/workResolve";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { computeGalaxyLayout } from "@/lib/galaxyLayout";

const PAGE_SIZE = 1000;

/** GET /api/layout — return the cached positions (fast, for initial render) */
export async function GET() {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("layout_cache")
      .select("positions, synapse_count, computed_at")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ positions: null });
    }

    return NextResponse.json({
      positions: data.positions,
      synapseCount: data.synapse_count,
      computedAt: data.computed_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[layout/GET]", msg);
    return NextResponse.json({ positions: null });
  }
}

/** POST /api/layout — recompute layout from all current synapses and save to cache */
export async function POST() {
  try {
    const supabase = createAnonClient();
    const service = createServiceClient();

    // Fetch all synapses (same pagination as /api/synapses)
    const all: Record<string, unknown>[] = [];
    for (let page = 0; page < 50; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("synapses")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      all.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }

    if (all.length === 0) {
      return NextResponse.json({ ok: true, synapseCount: 0 });
    }

    const endpointUrls = all.flatMap((s) => {
      const row = s as { source_url?: string; target_url?: string };
      return [row.source_url, row.target_url].filter((u): u is string => typeof u === "string");
    });

    const workMap = await buildWorkEndpointMap(supabase, endpointUrls);

    // Cast rows to SynapseRow-compatible shape
    const synapses = all as Parameters<typeof computeGalaxyLayout>[0];

    const posMap = computeGalaxyLayout(synapses, workMap);
    const positions = Array.from(posMap.entries()).map(([norm, { x, y }]) => ({ norm, x, y }));

    const { error: upsertError } = await service
      .from("layout_cache")
      .upsert({
        id: 1,
        positions,
        synapse_count: all.length,
        computed_at: new Date().toISOString(),
      });

    if (upsertError) throw new Error(upsertError.message);

    console.log(`[layout/POST] Recomputed ${positions.length} positions for ${all.length} synapses`);
    return NextResponse.json({ ok: true, synapseCount: all.length, nodeCount: positions.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[layout/POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
