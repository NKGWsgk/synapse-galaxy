#!/usr/bin/env npx tsx
/**
 * Supabase にシードを投入。各 description から Gemini で keywords を抽出。
 *
 * サンプル URL ルール（scripts/seed-rows.mts）: 本=Amazon /dp/、動画=Netflix・YouTube・Prime Video・Disney+ のみ。
 *
 * 事前: supabase/migrations を適用済みであること。
 * 環境変数: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 *
 * 実行: npm run seed
 *
 * 既存の synapses は全件削除してから挿入する（入れ替え）。
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();
import type { BatchItem } from "../src/lib/gemini/keywords";
import geminiKeywords from "../src/lib/gemini/keywords";
import amazon from "../src/lib/amazon";
import { buildSeedRows } from "./seed-rows.mts";

const { extractKeywordsBatch } = geminiKeywords;
const { withAmazonAffiliate } = amazon;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。");
  process.exit(1);
}

/** Legacy JWT: role が service_role でないと PostgREST で RLS がかかり insert できない */
function assertPrivilegedSupabaseKey(key: string) {
  if (key.startsWith("sb_publishable_")) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY に publishable キーが入っています。Dashboard → Settings → API の Secret（sb_secret_…）または Legacy の service_role JWT を設定してください。",
    );
    process.exit(1);
  }
  if (!key.startsWith("eyJ")) return;
  try {
    const mid = key.split(".")[1];
    if (!mid) return;
    const json = Buffer.from(mid.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    if (payload.role === "anon") {
      console.error(
        "SUPABASE_SERVICE_ROLE_KEY が anon 用 JWT です。Legacy API keys の「service_role」キー（長い eyJ…）か、新しい Secret キー（sb_secret_…）を設定してください。",
      );
      process.exit(1);
    }
  } catch {
    /* 非標準 JWT はスキップ */
  }
}

assertPrivilegedSupabaseKey(serviceKey);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  // PostgREST の Authorization は常にこのキーに固定（セッション混入で RLS になるのを防ぐ）
  accessToken: async () => serviceKey,
});

function fallbackKeywords(description: string): string[] {
  const base = description.replace(/（[^）]+）/g, "");
  const tokenize = (s: string) =>
    s
      .split(/[、，\s「」『』]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 12)
      .filter((t) => !/^[\d#]+$/.test(t));

  const sentences = base.split(/[。]/).map((s) => s.trim()).filter(Boolean);
  const chunks = sentences.length ? sentences : [base];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const sent of chunks) {
    if (out.length >= 6) break;
    const toks = tokenize(sent);
    if (toks.length >= 2) {
      const phrase = `${toks[0]}と${toks[1]}`;
      if (phrase.length <= 22 && !seen.has(phrase)) {
        seen.add(phrase);
        out.push(phrase);
        continue;
      }
    }
    for (const t of toks) {
      if (out.length >= 6) break;
      if (!seen.has(t) && t.length >= 3) {
        seen.add(t);
        out.push(t);
        break;
      }
    }
  }

  const all = tokenize(base);
  for (let i = 0; i + 1 < all.length && out.length < 6; i++) {
    const phrase = `${all[i]}による${all[i + 1]}`;
    if (phrase.length <= 24 && !seen.has(phrase)) {
      seen.add(phrase);
      out.push(phrase);
    }
  }

  if (out.length < 6) {
    for (const t of all) {
      if (out.length >= 6) break;
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }

  return out.slice(0, 6);
}

async function main() {
  console.log("Deleting all rows from synapses…");
  const { error: delError } = await supabase
    .from("synapses")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delError) {
    console.error("Delete error:", delError.message);
    process.exit(1);
  }

  const baseRows = buildSeedRows();
  const batchSize = 12;
  const keywordMap = new Map<number, string[]>();

  for (let start = 0; start < baseRows.length; start += batchSize) {
    const slice = baseRows.slice(start, start + batchSize);
    const items: BatchItem[] = slice.map((r, j) => ({
      index: start + j,
      description: r.description,
    }));

    console.log(`Gemini batch ${start}..${start + slice.length - 1}`);
    const res = await extractKeywordsBatch(items);

    if (!res.ok) {
      console.warn("Gemini 失敗、フォールバック:", res.message);
      for (const it of items) {
        keywordMap.set(it.index, fallbackKeywords(it.description));
      }
      continue;
    }

    for (const r of res.results) {
      keywordMap.set(r.index, r.keywords.length ? r.keywords : fallbackKeywords(baseRows[r.index]!.description));
    }

    for (let i = start; i < start + slice.length; i++) {
      if (!keywordMap.has(i)) {
        keywordMap.set(i, fallbackKeywords(baseRows[i]!.description));
      }
    }
  }

  const inserts = baseRows.map((row, index) => ({
    user_id: null as string | null,
    source_url: withAmazonAffiliate(row.source_url),
    target_url: withAmazonAffiliate(row.target_url),
    description: row.description,
    keywords: keywordMap.get(index) ?? fallbackKeywords(row.description),
  }));

  const { error } = await supabase.from("synapses").insert(inserts);
  if (error) {
    console.error("Insert error:", error.message);
    process.exit(1);
  }

  console.log("Inserted", inserts.length, "synapses.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
