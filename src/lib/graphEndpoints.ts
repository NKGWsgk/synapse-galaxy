import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";

/** いずれかのシナプス endpoint として登場する URL（正規化済み） */
export async function fetchGraphEndpointNorms(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("synapses").select("source_url, target_url");
  if (error) throw new Error(error.message);

  const norms = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.source_url === "string") {
      norms.add(normalizeSynapseEndpoint(row.source_url));
    }
    if (typeof row.target_url === "string") {
      norms.add(normalizeSynapseEndpoint(row.target_url));
    }
  }
  return norms;
}

export function isUrlOnGraph(url: string, graphNorms: Set<string>): boolean {
  return graphNorms.has(normalizeSynapseEndpoint(url));
}
