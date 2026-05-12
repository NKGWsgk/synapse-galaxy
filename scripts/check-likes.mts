#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const { data: users } = await s.auth.admin.listUsers();
  console.log(`# Users (${users.users.length})`);
  for (const u of users.users) console.log(`  - ${u.id.slice(0,8)} ${u.email} created=${u.created_at.slice(0,10)}`);
  console.log();

  const { data: syns } = await s.from("synapses").select("id,user_id,keywords,likes_count").order("created_at", { ascending: true });
  const byUser = new Map<string, number>();
  for (const x of syns ?? []) byUser.set(x.user_id ?? "(null)", (byUser.get(x.user_id ?? "(null)") ?? 0) + 1);
  console.log(`# Synapse user_id 分布`);
  for (const [k, v] of byUser) console.log(`  - ${k}: ${v} 件`);
  console.log();

  console.log(`# Synapses likes_count`);
  for (const x of syns ?? []) console.log(`  - ${x.keywords?.[0]?.slice(0,30) ?? "(no kw)"}: likes_count=${x.likes_count ?? "null"}`);
  console.log();

  const { data: likes, error: likesErr } = await s.from("synapse_likes").select("synapse_id,user_id,created_at").limit(20);
  console.log(`# synapse_likes rows`);
  if (likesErr) console.log(`  ERROR: ${likesErr.message}`);
  else if (!likes || likes.length === 0) console.log("  (table exists but no rows)");
  else for (const x of likes) console.log(`  - synapse=${x.synapse_id.slice(0,8)} user=${x.user_id.slice(0,8)} at=${x.created_at.slice(0,10)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
