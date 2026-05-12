#!/usr/bin/env npx tsx
/**
 * synapses.likes_count を synapse_likes の集計値で再計算してバックフィル。
 * DB トリガー（supabase/migrations/20260512000000_likes_count_trigger.sql）が
 * 本番に未適用な状況でも整合性を取り戻すための一時しのぎ。
 * トリガー適用後も idempotent なので安全に再実行可。
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const { data: syns, error: synErr } = await s.from("synapses").select("id,likes_count");
  if (synErr) throw synErr;

  const { data: likes, error: lkErr } = await s.from("synapse_likes").select("synapse_id");
  if (lkErr) throw lkErr;

  const counts = new Map<string, number>();
  for (const l of likes ?? []) counts.set(l.synapse_id, (counts.get(l.synapse_id) ?? 0) + 1);

  let changed = 0;
  for (const row of syns ?? []) {
    const actual = counts.get(row.id) ?? 0;
    if ((row.likes_count ?? 0) !== actual) {
      const { error } = await s.from("synapses").update({ likes_count: actual }).eq("id", row.id);
      if (error) {
        console.error(`  ! ${row.id.slice(0, 8)} update 失敗: ${error.message}`);
        continue;
      }
      console.log(`  - ${row.id.slice(0, 8)} likes_count: ${row.likes_count ?? "null"} -> ${actual}`);
      changed += 1;
    }
  }
  console.log(`# changed: ${changed} / ${syns?.length ?? 0}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
