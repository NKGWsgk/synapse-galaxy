#!/usr/bin/env npx tsx
/**
 * 全シナプス（接続）の一覧をタイトル/キーワード/出発・着地と共に表示する。
 *
 * 実行: npx tsx scripts/list-synapses.mts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type SynapseRow = {
  id: string;
  source_url: string;
  target_url: string;
  description: string;
  keywords: string[] | null;
  dim_rika: number | null;
  dim_bunkei: number | null;
  dim_art: number | null;
  dim_time: number | null;
  created_at: string;
};

type MetaRow = {
  url: string;
  title: string | null;
};

async function main() {
  const { data: synapses, error } = await supabase
    .from("synapses")
    .select("id,source_url,target_url,description,keywords,dim_rika,dim_bunkei,dim_art,dim_time,created_at")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); process.exit(1); }
  if (!synapses || synapses.length === 0) { console.log("(no synapses)"); return; }

  // URL→title マップを作る
  const urls = new Set<string>();
  for (const s of synapses as SynapseRow[]) {
    urls.add(s.source_url);
    urls.add(s.target_url);
  }
  const { data: metas } = await supabase
    .from("contents_metadata")
    .select("url,title")
    .in("url", [...urls]);
  const titleByUrl = new Map<string, string | null>();
  for (const m of (metas ?? []) as MetaRow[]) titleByUrl.set(m.url, m.title);

  function shortTitle(url: string): string {
    const t = titleByUrl.get(url);
    if (t && t.trim()) return t.trim().slice(0, 40);
    try { return new URL(url).hostname; } catch { return url.slice(0, 40); }
  }

  console.log(`\n=== シナプス一覧 (${synapses.length}件) ===\n`);
  for (const s of synapses as SynapseRow[]) {
    const kw = (s.keywords ?? []).filter((x) => x && x.trim());
    const titleStr = kw[0] ?? "(no keyword)";
    const src = shortTitle(s.source_url);
    const tgt = shortTitle(s.target_url);
    const dims = (s.dim_rika != null)
      ? `rika=${s.dim_rika} bunkei=${s.dim_bunkei} art=${s.dim_art} time=${s.dim_time}`
      : "(no dims)";

    console.log(`◆ ${titleStr}`);
    console.log(`  ${src}`);
    console.log(`    → ${tgt}`);
    console.log(`  desc: ${(s.description ?? "").slice(0, 100).replace(/\n/g, " ")}`);
    console.log(`  ${dims}`);
    console.log(`  id: ${s.id}  created: ${new Date(s.created_at).toISOString().slice(0, 10)}`);
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
