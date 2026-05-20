import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import {
  representativeUrlForNorm,
  workKeyForUrl,
  type WorkEndpointMap,
} from "@/lib/workResolve";

export type { WorkEndpointMap };

export function normEndpoint(url: string): string {
  return normalizeSynapseEndpoint(url);
}

/** グラフ・フォーカスのノードキー（作品 ID 優先） */
export function endpointWorkKey(url: string, workMap: WorkEndpointMap): string {
  return workKeyForUrl(normEndpoint(url), workMap);
}

export function endpointDisplayUrl(url: string, workMap: WorkEndpointMap): string {
  const norm = normEndpoint(url);
  return representativeUrlForNorm(norm, workMap, url);
}
