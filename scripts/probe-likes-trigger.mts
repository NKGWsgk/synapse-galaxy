#!/usr/bin/env npx tsx
/**
 * 既存 synapse_likes 行に対応する synapses.likes_count を確認し、
 * トリガーが効いているかを確かめる。
 * 副作用なし（read-only）。
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
  const { data: likes } = await s.from("synapse_likes").select("synapse_id");
  const counts = new Map<string, number>();
  for (const l of likes ?? []) counts.set(l.synapse_id, (counts.get(l.synapse_id) ?? 0) + 1);

  console.log(`# synapse_likes 集計: ${likes?.length ?? 0} 行`);
  for (const [sid, c] of counts) {
    const { data } = await s.from("synapses").select("id,likes_count").eq("id", sid).maybeSingle();
    console.log(`  - ${sid.slice(0, 8)} likes(actual)=${c} likes_count(stored)=${data?.likes_count}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
