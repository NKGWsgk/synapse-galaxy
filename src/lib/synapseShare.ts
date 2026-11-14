import { createAnonClient, type SynapseRow } from "@/lib/supabase/clients";
import { encodeFocusParam } from "@/lib/focusShareUrl";
import { isSynapseShareId } from "@/lib/synapseShareUrl";
import { normalizeSynapseEndpoint } from "@/lib/urlNormalize";
import { endpointDisplayTitle, lookupWorkEndpoint } from "@/lib/workEndpoint";
import { buildWorkEndpointMap } from "@/lib/workResolve";

export type SynapseShareWork = { title: string; imageUrl: string | null };

export type SynapseShareData = {
  id: string;
  /** 接続タイトル（keywords[0]） */
  title: string;
  reason: string;
  source: SynapseShareWork;
  target: SynapseShareWork;
  /** 人が開くアプリ側の URL（`/?focus=…&synapse=…`） */
  appPath: string;
};

/** シェア用に 1 本のシナプスと両端作品の表示情報をまとめて取得する。見つからなければ null。 */
export async function loadSynapseShare(id: string): Promise<SynapseShareData | null> {
  if (!isSynapseShareId(id)) return null;
  const supabase = createAnonClient();
  const { data } = await supabase.from("synapses").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as SynapseRow;

  const workMap = await buildWorkEndpointMap(supabase, [row.source_url, row.target_url]);
  const work = (url: string): SynapseShareWork => ({
    title: endpointDisplayTitle(url, workMap),
    imageUrl: lookupWorkEndpoint(url, workMap)?.imageUrl ?? null,
  });

  const params = new URLSearchParams();
  let focus: string | null = null;
  try {
    focus = encodeFocusParam(normalizeSynapseEndpoint(row.source_url), workMap);
  } catch {
    focus = null;
  }
  if (focus) params.set("focus", focus);
  params.set("synapse", row.id);

  const title = (row.keywords?.find((k) => k && k.trim()) ?? "").replace(/\s*\n\s*/g, "").trim();
  return {
    id: row.id,
    title,
    reason: (row.description ?? "").trim(),
    source: work(row.source_url),
    target: work(row.target_url),
    appPath: `/?${params.toString()}`,
  };
}
