import { resolveContentDisplayTitle } from "@/lib/ogpDisplay";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import {
  representativeUrlForNorm,
  workKeyForUrl,
  type WorkEndpointInfo,
  type WorkEndpointMap,
} from "@/lib/workResolve";

export type { WorkEndpointInfo };

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

/** workMap から作品メタを引く（endpoint norm / workId / 代表 URL のいずれかで一致） */
export function lookupWorkEndpoint(
  url: string,
  workMap: WorkEndpointMap,
  workKey?: string,
): WorkEndpointInfo | null {
  const norm = normEndpoint(url);
  if (workMap[norm]) return workMap[norm];
  if (workKey) {
    for (const info of Object.values(workMap)) {
      if (info.workId === workKey) return info;
    }
  }
  for (const info of Object.values(workMap)) {
    if (normEndpoint(info.representativeUrl) === norm) return info;
  }
  return null;
}

/** UI 用の作品名（workMap の title 優先、なければ URL からフォールバック） */
export function endpointDisplayTitle(url: string, workMap: WorkEndpointMap): string {
  const norm = normEndpoint(url);
  const info = workMap[norm];
  const pageUrl = info?.representativeUrl ?? url;
  if (info?.title) return resolveContentDisplayTitle(info.title, pageUrl);
  return resolveContentDisplayTitle(null, url);
}
