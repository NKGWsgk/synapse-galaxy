#!/usr/bin/env npx tsx
/**
 * 既存シナプスの接続短題（keywords 配列の先頭の非空要素）に対し、
 * suggestEdgeKeywordLineBreak と同じ処理で改行 U+000A を DB に書き込む。
 *
 * 前提:
 *   - smart-input 以外で入ったデータは DB に \n が無いことが多い → 本スクリプトで揃える
 *   - 表示側では二重に改行を付けず、DB の keywords だけを信頼する
 *
 * 実行:
 *   npx tsx scripts/backfill-edge-keyword-breaks.mts
 *
 * ドライラン（更新しない）:
 *   BACKFILL_DRY_RUN=1 npx tsx scripts/backfill-edge-keyword-breaks.mts
 *
 * 環境変数:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY, GEMINI_EDGE_KEYWORD_BREAK=1 （smart-input と同じ）
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import synapseLimits from "../src/lib/synapseLimits.ts";

const { SYNAPSE_EDGE_AI_BREAK_FROM_CHARS, SYNAPSE_EDGE_TITLE_MAX_CHARS } = synapseLimits;

const PAGE = 400;
const dryRun = process.env.BACKFILL_DRY_RUN === "1";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_EDGE_KEYWORD_BREAK !== "1") {
    console.error("GEMINI_API_KEY と GEMINI_EDGE_KEYWORD_BREAK=1 が必要です（smart-input と同条件）。");
    process.exit(1);
  }

  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const edgeMod = new URL("../src/lib/gemini/edgeKeywordBreak.ts", import.meta.url).href;
  const { suggestEdgeKeywordLineBreak } = await import(edgeMod);

  type Row = { id: string; keywords: string[] | null };
  const resolved = new Map<string, string>();

  async function breakKeyword(text: string): Promise<string> {
    const key = text.normalize("NFC").trimEnd();
    if (resolved.has(key)) return resolved.get(key)!;
    const out = await suggestEdgeKeywordLineBreak(key);
    resolved.set(key, out);
    await new Promise((r) => setTimeout(r, 400));
    return out;
  }

  let from = 0;
  let totalRows = 0;
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;

  console.log(dryRun ? "DRY RUN（DB は更新しません）\n" : "DB を更新します\n");

  for (;;) {
    const { data, error } = await supabase
      .from("synapses")
      .select("id,keywords")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("fetch error:", error);
      process.exit(1);
    }
    const chunk = (data ?? []) as Row[];
    if (chunk.length === 0) break;

    for (const row of chunk) {
      totalRows++;
      const kw = row.keywords;
      if (!kw?.length) {
        skipped++;
        continue;
      }
      const idx = kw.findIndex((x) => x && x.trim());
      if (idx < 0) {
        skipped++;
        continue;
      }
      const oldRaw = kw[idx]!;
      const oldKey = oldRaw.normalize("NFC").trimEnd();
      const flatKey = oldKey.replace(/\n/g, "");
      const g = [...flatKey];
      if (g.length < 2 || g.length > SYNAPSE_EDGE_TITLE_MAX_CHARS) {
        skipped++;
        continue;
      }
      if (g.length < SYNAPSE_EDGE_AI_BREAK_FROM_CHARS) {
        unchanged++;
        continue;
      }

      const next = await breakKeyword(flatKey);
      if (next === oldKey) {
        unchanged++;
        continue;
      }

      const newKeywords = [...kw];
      newKeywords[idx] = next;
      process.stdout.write(`${dryRun ? "[dry] " : ""}update ${row.id.slice(0, 8)}… ${JSON.stringify(oldKey)} → ${JSON.stringify(next)}\n`);

      if (!dryRun) {
        const { error: upErr } = await supabase.from("synapses").update({ keywords: newKeywords }).eq("id", row.id);
        if (upErr) {
          console.error("  update error:", upErr.message);
          skipped++;
          continue;
        }
      }
      updated++;
    }

    if (chunk.length < PAGE) break;
    from += PAGE;
  }

  console.log(
    `\n件数: 走査 ${totalRows} / 更新 ${updated}${dryRun ? "（dry）" : ""} / 変更なし ${unchanged} / スキップ ${skipped} / ユニーク文言API ${resolved.size}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
