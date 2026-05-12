#!/usr/bin/env npx tsx
/**
 * POST/DELETE /api/synapse/[id]/like の動作確認スクリプト。
 * 唯一のユーザーで magic-link 経由のセッションが取れないため、service-role で
 * sign-in 用 token を生成してから API を叩く。
 *
 * 動作対象: 既に 1 件 like がついている 90f592b9 系のシナプス（実行時に DB から拾う）。
 *
 * 副作用: 一時的に synapse_likes に行を作って消す。
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TARGET_EMAIL = "shigeki1046@gmail.com";
const API_BASE = process.env.SYNAPSE_API_BASE ?? "http://localhost:3000";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function generateAccessToken(userId: string): Promise<string> {
  // generateLink → magic link URL から token_hash を取り出し、verifyOtp で session 化
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TARGET_EMAIL,
  });
  if (error) throw error;
  const url = new URL(data.properties.action_link);
  const tokenHash = url.searchParams.get("token") ?? url.searchParams.get("token_hash");
  if (!tokenHash) throw new Error(`token_hash 抽出失敗: ${data.properties.action_link}`);

  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verErr) throw verErr;
  if (verified.user?.id !== userId) {
    throw new Error(`user mismatch: ${verified.user?.id} vs ${userId}`);
  }
  return verified.session!.access_token;
}

async function fetchSynapseLikesCount(synapseId: string): Promise<number> {
  const { data } = await admin.from("synapses").select("likes_count").eq("id", synapseId).maybeSingle();
  return data?.likes_count ?? -1;
}

async function main() {
  // 検証対象: いいねがまだ無いシナプス（重複 like を避けるため）を 1 件選ぶ
  const { data: syns } = await admin.from("synapses").select("id,likes_count").eq("likes_count", 0).limit(1);
  const target = syns?.[0];
  if (!target) throw new Error("likes_count=0 のシナプスが見つからない");
  console.log(`# target synapse: ${target.id} (likes_count=${target.likes_count})`);

  const { data: usersRes } = await admin.auth.admin.listUsers();
  const user = usersRes.users.find((u) => u.email === TARGET_EMAIL);
  if (!user) throw new Error("target user not found");
  const token = await generateAccessToken(user.id);
  console.log(`# obtained access token for ${user.email}: ${token.slice(0, 16)}...`);

  // POST /like
  const postRes = await fetch(`${API_BASE}/api/synapse/${target.id}/like`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const postJson = await postRes.json();
  console.log(`# POST  status=${postRes.status} body=${JSON.stringify(postJson)}`);
  const afterPost = await fetchSynapseLikesCount(target.id);
  console.log(`#   DB likes_count after POST: ${afterPost}`);

  // DELETE /like
  const delRes = await fetch(`${API_BASE}/api/synapse/${target.id}/like`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const delJson = await delRes.json();
  console.log(`# DELETE status=${delRes.status} body=${JSON.stringify(delJson)}`);
  const afterDel = await fetchSynapseLikesCount(target.id);
  console.log(`#   DB likes_count after DELETE: ${afterDel}`);

  const passPost = postRes.ok && postJson.likes_count === 1 && afterPost === 1;
  const passDel = delRes.ok && delJson.likes_count === 0 && afterDel === 0;
  console.log(`# RESULT: POST=${passPost ? "OK" : "NG"} DELETE=${passDel ? "OK" : "NG"}`);
  if (!passPost || !passDel) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
