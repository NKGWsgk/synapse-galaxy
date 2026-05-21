import type { SynapseRow } from "@/lib/supabase/clients";
import { endpointDisplayUrl, endpointWorkKey, type WorkEndpointMap } from "@/lib/workEndpoint";

export type FocusConnectionSet = {
  id: string;
  synapse: SynapseRow;
  keyword: string | null;
  neighborUrl: string;
  isOutgoing: boolean;
};

function pickEdgeKeyword(s: SynapseRow): string | null {
  const k = s.keywords?.find((x) => x && x.trim());
  return k ? k.trim() : null;
}

/** フォーカス作品に直接つながるシナプスを、スクロールフィード用のセットに並べる */
export function buildFocusConnectionSets(
  focusUrl: string,
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): FocusConnectionSet[] {
  const focusKey = endpointWorkKey(focusUrl, workMap);
  const sets: FocusConnectionSet[] = [];

  for (const s of synapses) {
    const srcK = endpointWorkKey(s.source_url, workMap);
    const tgtK = endpointWorkKey(s.target_url, workMap);
    if (srcK === focusKey) {
      sets.push({
        id: s.id,
        synapse: s,
        keyword: pickEdgeKeyword(s),
        neighborUrl: endpointDisplayUrl(s.target_url, workMap),
        isOutgoing: true,
      });
    } else if (tgtK === focusKey) {
      sets.push({
        id: s.id,
        synapse: s,
        keyword: pickEdgeKeyword(s),
        neighborUrl: endpointDisplayUrl(s.source_url, workMap),
        isOutgoing: false,
      });
    }
  }

  return sets.sort((a, b) => {
    const la = b.synapse.likes_count ?? 0;
    const lb = a.synapse.likes_count ?? 0;
    if (la !== lb) return la - lb;
    return a.id.localeCompare(b.id);
  });
}
