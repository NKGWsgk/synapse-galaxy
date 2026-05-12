#!/usr/bin/env npx tsx
/**
 * 既存の user_id = null の synapses を、現状唯一のユーザー（shigeki1046@gmail.com）に紐付ける。
 * 一度きりの実行を想定。
 *
 * 安全弁:
 *  - users.length === 1 でない場合は中断
 *  - 想定ユーザー（shigeki1046@gmail.com）でない場合は中断
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const TARGET_EMAIL = "shigeki1046@gmail.com";

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const { data: usersRes, error: usersErr } = await s.auth.admin.listUsers();
  if (usersErr) throw usersErr;
  const users = usersRes.users;
  if (users.length !== 1) {
    console.error(`想定外: users.length = ${users.length}（1 以外）。中断。`);
    process.exit(1);
  }
  const owner = users[0];
  if (owner.email !== TARGET_EMAIL) {
    console.error(`想定外: 唯一のユーザー email = ${owner.email}（${TARGET_EMAIL} ではない）。中断。`);
    process.exit(1);
  }

  const { data: orphans, error: orphErr } = await s
    .from("synapses")
    .select("id")
    .is("user_id", null);
  if (orphErr) throw orphErr;
  console.log(`# user_id=null synapses: ${orphans?.length ?? 0} 件`);

  if (!orphans || orphans.length === 0) {
    console.log("バックフィル対象なし。終了。");
    return;
  }

  const { data: updated, error: upErr } = await s
    .from("synapses")
    .update({ user_id: owner.id })
    .is("user_id", null)
    .select("id");
  if (upErr) throw upErr;
  console.log(`# updated rows: ${updated?.length ?? 0} → owner ${owner.id} (${owner.email})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
