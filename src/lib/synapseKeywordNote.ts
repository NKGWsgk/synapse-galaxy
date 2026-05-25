import type { SynapseRow } from "@/lib/supabase/clients";
import { endpointWorkKey, type WorkEndpointMap } from "@/lib/workEndpoint";

export type KeywordNotePayload = {
  keyword: string;
  description: string;
  sourceUrl: string;
  targetUrl: string;
  synapse?: SynapseRow;
  synapses?: SynapseRow[];
  currentIndex?: number;
};

export type SynapseShareRequest = { id: string; nonce: number };

function pickEdgeKeyword(s: SynapseRow): string | null {
  const k = s.keywords?.find((x) => x && x.trim());
  return k ? k.trim() : null;
}

export function findSynapseById(id: string, synapses: SynapseRow[]): SynapseRow | null {
  return synapses.find((s) => s.id === id) ?? null;
}

export function buildKeywordNoteForSynapse(
  synapse: SynapseRow,
  allSynapses: SynapseRow[],
  workMap: WorkEndpointMap,
): KeywordNotePayload {
  const srcK = endpointWorkKey(synapse.source_url, workMap);
  const tgtK = endpointWorkKey(synapse.target_url, workMap);
  const pairSynapses = allSynapses
    .filter(
      (s) =>
        endpointWorkKey(s.source_url, workMap) === srcK &&
        endpointWorkKey(s.target_url, workMap) === tgtK,
    )
    .sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
  const currentIndex = pairSynapses.findIndex((s) => s.id === synapse.id);
  const keyword = pickEdgeKeyword(synapse) ?? "接続";
  return {
    keyword,
    description: synapse.description,
    sourceUrl: synapse.source_url,
    targetUrl: synapse.target_url,
    synapse,
    synapses: pairSynapses.length > 1 ? pairSynapses : undefined,
    currentIndex: pairSynapses.length > 1 ? Math.max(0, currentIndex) : undefined,
  };
}
