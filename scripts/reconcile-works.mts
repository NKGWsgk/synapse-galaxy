#!/usr/bin/env npx tsx
/**
 * 作品統合ルールで DB を修復:
 * - contents_metadata.url を endpoint 正規化
 * - 同一 URL / 同一 work_fingerprint の行を canonical_id で統合
 * - synapses の endpoint URL を代表 URL に寄せる
 *
 * 実行: npx tsx scripts/reconcile-works.mts
 * 適用: npx tsx scripts/reconcile-works.mts --apply
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const mod = (p: string) => `${p}?v=${Date.now()}`;
const { mergePurchaseLinks } = await import(mod("../src/lib/purchaseLinks.ts"));
const { normalizeSynapseEndpoint } = await import(mod("../src/lib/urlNormalize.ts"));
const { computeWorkFingerprint } = await import(mod("../src/lib/workIdentity.ts"));
const { extractPureWorkTitle } = await import(mod("../src/lib/pureWorkTitle.ts"));

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type MetaRow = {
  url: string;
  canonical_id: string;
  work_fingerprint: string | null;
  purchase_links: unknown;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  updated_at: string;
};

type SynapseRow = { id: string; source_url: string; target_url: string };

function pickRepresentativeUrl(urls: string[]): string {
  const norms = urls.map((u) => normalizeSynapseEndpoint(u));
  const dp = norms.find((u) => /\/dp\/[A-Z0-9]{10}$/i.test(u));
  if (dp) return dp;
  return norms.sort((a, b) => a.length - b.length)[0] ?? urls[0]!;
}

async function hasWorkFingerprintColumn(): Promise<boolean> {
  const { error } = await supabase.from("contents_metadata").select("work_fingerprint").limit(1);
  if (!error) return true;
  if (/work_fingerprint/i.test(error.message)) return false;
  throw new Error(error.message);
}

async function main() {
  const fingerprintCol = await hasWorkFingerprintColumn();
  if (!fingerprintCol) {
    console.warn(
      "work_fingerprint 列がありません。supabase/migrations/20260520000000_work_fingerprint.sql を適用してください。canonical_id の統合のみ続行します。",
    );
  }

  const { data: metaRaw, error: metaErr } = await supabase.from("contents_metadata").select("*");
  if (metaErr) throw new Error(metaErr.message);

  const { data: synapsesRaw, error: synErr } = await supabase
    .from("synapses")
    .select("id,source_url,target_url");
  if (synErr) throw new Error(synErr.message);

  const rows = (metaRaw ?? []) as MetaRow[];
  const synapses = (synapsesRaw ?? []) as SynapseRow[];

  console.log(`metadata rows: ${rows.length}, synapses: ${synapses.length}`);
  console.log(APPLY ? "MODE: apply" : "MODE: dry-run (pass --apply to write)");

  // url 正規化 & 重複行マージ
  const byNormUrl = new Map<string, MetaRow[]>();
  for (const row of rows) {
    const norm = normalizeSynapseEndpoint(row.url);
    const list = byNormUrl.get(norm) ?? [];
    list.push({ ...row, url: norm });
    byNormUrl.set(norm, list);
  }

  const survivors: MetaRow[] = [];
  const deleteUrls: string[] = [];
  const urlAlias = new Map<string, string>();

  for (const [, group] of byNormUrl) {
    const sorted = [...group].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const keeper = sorted[0]!;
    let links = keeper.purchase_links;
    for (const dup of sorted.slice(1)) {
      links = mergePurchaseLinks(links, dup.purchase_links as Record<string, string>);
      deleteUrls.push(dup.url);
      urlAlias.set(dup.url, keeper.url);
    }
    for (const g of group) urlAlias.set(g.url, keeper.url);
    survivors.push({ ...keeper, purchase_links: links });
  }

  // fingerprint 再計算 & canonical 統合
  for (const row of survivors) {
    const pure = extractPureWorkTitle(row.title, row.url) ?? row.title;
    row.work_fingerprint = computeWorkFingerprint(pure, row.url);
  }

  const byFp = new Map<string, MetaRow[]>();
  for (const row of survivors) {
    const fp = row.work_fingerprint!;
    const list = byFp.get(fp) ?? [];
    list.push(row);
    byFp.set(fp, list);
  }

  const canonicalMaster = new Map<string, string>();
  for (const [, group] of byFp) {
    const sorted = [...group].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const masterId = sorted[0]!.canonical_id;
    const repUrl = pickRepresentativeUrl(sorted.map((r) => r.url));
    for (const row of sorted) {
      canonicalMaster.set(row.canonical_id, masterId);
      urlAlias.set(row.url, repUrl);
      row.canonical_id = masterId;
      row.url = repUrl;
    }
  }

  // 代表 URL で survivors を再集約（同一 canonical で複数 URL が残る場合）
  const finalByUrl = new Map<string, MetaRow>();
  for (const row of survivors) {
    const existing = finalByUrl.get(row.url);
    if (!existing) {
      finalByUrl.set(row.url, row);
      continue;
    }
    existing.purchase_links = mergePurchaseLinks(
      existing.purchase_links,
      row.purchase_links as Record<string, string>,
    );
    if (row.updated_at > existing.updated_at) {
      existing.title = row.title ?? existing.title;
      existing.description = row.description ?? existing.description;
      existing.image_url = row.image_url ?? existing.image_url;
      existing.site_name = row.site_name ?? existing.site_name;
      existing.work_fingerprint = row.work_fingerprint;
      existing.canonical_id = row.canonical_id;
    }
    if (existing.url !== row.url) deleteUrls.push(row.url);
  }

  const finalMeta = [...finalByUrl.values()];
  const repByNorm = new Map(finalMeta.map((r) => [normalizeSynapseEndpoint(r.url), r.url]));
  for (const row of rows) {
    const norm = normalizeSynapseEndpoint(row.url);
    const rep = repByNorm.get(norm);
    if (rep && row.url !== rep) deleteUrls.push(row.url);
  }

  console.log(`after merge: metadata ${finalMeta.length}, delete ${deleteUrls.length} rows`);

  const synapseUpdates: { id: string; source_url: string; target_url: string }[] = [];
  for (const s of synapses) {
    const src = urlAlias.get(s.source_url) ?? normalizeSynapseEndpoint(s.source_url);
    const tgt = urlAlias.get(s.target_url) ?? normalizeSynapseEndpoint(s.target_url);
    if (src !== s.source_url || tgt !== s.target_url) {
      synapseUpdates.push({ id: s.id, source_url: src, target_url: tgt });
    }
  }
  console.log(`synapse URL updates: ${synapseUpdates.length}`);

  const fpGroups = [...byFp.entries()].filter(([, g]) => g.length > 1);
  console.log(`fingerprint groups merged: ${fpGroups.length}`);
  for (const [fp, g] of fpGroups.slice(0, 8)) {
    console.log(`  ${fp} → ${g.length} urls → canonical ${g[0]!.canonical_id}`);
  }

  if (!APPLY) return;

  for (const url of [...new Set(deleteUrls)]) {
    const { error } = await supabase.from("contents_metadata").delete().eq("url", url);
    if (error) console.warn(`delete failed: ${url.slice(0, 80)}… ${error.message}`);
  }

  for (const row of finalMeta) {
    const pure = extractPureWorkTitle(row.title, row.url) ?? row.title;
    row.title = pure;
    const payload: Record<string, unknown> = {
      url: row.url,
      canonical_id: row.canonical_id,
      purchase_links: row.purchase_links,
      title: pure,
      description: row.description,
      image_url: row.image_url,
      site_name: row.site_name,
      updated_at: new Date().toISOString(),
    };
    if (fingerprintCol && row.work_fingerprint) {
      payload.work_fingerprint = row.work_fingerprint;
    }
    const { error } = await supabase.from("contents_metadata").upsert(payload, { onConflict: "url" });
    if (error) throw new Error(`upsert ${row.url}: ${error.message}`);
  }

  for (const u of synapseUpdates) {
    const { error } = await supabase
      .from("synapses")
      .update({ source_url: u.source_url, target_url: u.target_url })
      .eq("id", u.id);
    if (error) throw new Error(`synapse ${u.id}: ${error.message}`);
  }

  // 孤立 canonical の purchase_links を代表行に集約
  const byCanon = new Map<string, MetaRow[]>();
  for (const row of finalMeta) {
    const list = byCanon.get(row.canonical_id) ?? [];
    list.push(row);
    byCanon.set(row.canonical_id, list);
  }
  for (const [cid, group] of byCanon) {
    let merged: Record<string, string> = {};
    for (const row of group) {
      merged = mergePurchaseLinks(merged, row.purchase_links as Record<string, string>);
    }
    await supabase.from("contents_metadata").update({ purchase_links: merged }).eq("canonical_id", cid);
  }

  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
