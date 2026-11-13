import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";

/** マップ（銀河グラフ）への表示閾値: 作品がこの数以上のシナプスに登場して初めてノード化する */
export const MAP_MIN_CONNECTIONS = 2;

/** どちらか一方の端が MAP_MIN_CONNECTIONS 以上の接続を持つシナプスを残す（ハブに繋がる葉は残し、両端とも1本だけの孤立ペアを除く。クライアント表示とサーバー配置計算で共有） */
export function filterMapSynapses<T extends { source_url: string; target_url: string }>(synapses: T[]): T[] {
  const counts = new Map<string, number>();
  for (const s of synapses) {
    const src = normalizeSynapseEndpoint(s.source_url);
    const tgt = normalizeSynapseEndpoint(s.target_url);
    counts.set(src, (counts.get(src) ?? 0) + 1);
    counts.set(tgt, (counts.get(tgt) ?? 0) + 1);
  }
  return synapses.filter((s) => {
    const src = normalizeSynapseEndpoint(s.source_url);
    const tgt = normalizeSynapseEndpoint(s.target_url);
    return Math.max(counts.get(src) ?? 0, counts.get(tgt) ?? 0) >= MAP_MIN_CONNECTIONS;
  });
}
