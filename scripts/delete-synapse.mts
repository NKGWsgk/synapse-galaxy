#!/usr/bin/env npx tsx
/**
 * 指定 ID のシナプスを 1 件削除する。
 *
 * 実行: npx tsx scripts/delete-synapse.mts <id>
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const id = process.argv[2];
  if (!id) { console.error("Usage: npx tsx scripts/delete-synapse.mts <id>"); process.exit(1); }

  const { data: before, error: e1 } = await supabase
    .from("synapses")
    .select("id,source_url,target_url,keywords")
    .eq("id", id)
    .maybeSingle();
  if (e1) { console.error(e1); process.exit(1); }
  if (!before) { console.log("(該当 ID なし)"); return; }

  console.log("削除対象:");
  console.log(`  id: ${before.id}`);
  console.log(`  keyword: ${(before.keywords ?? [])[0] ?? "(none)"}`);
  console.log(`  ${before.source_url}`);
  console.log(`    → ${before.target_url}`);

  const { error: e2 } = await supabase.from("synapses").delete().eq("id", id);
  if (e2) { console.error(e2); process.exit(1); }
  console.log("\n✓ 削除しました");
}

main().catch((e) => { console.error(e); process.exit(1); });
