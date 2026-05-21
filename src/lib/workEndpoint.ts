import { resolveContentDisplayTitle } from "@/lib/ogpDisplay";
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

/** UI 用の作品名（workMap の title 優先、なければ URL からフォールバック） */
export function endpointDisplayTitle(url: string, workMap: WorkEndpointMap): string {
  const norm = normEndpoint(url);
  const info = workMap[norm];
  const pageUrl = info?.representativeUrl ?? url;
  if (info?.title) return resolveContentDisplayTitle(info.title, pageUrl);
  return resolveContentDisplayTitle(null, url);
}
