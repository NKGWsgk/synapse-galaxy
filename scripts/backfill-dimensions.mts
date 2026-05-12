#!/usr/bin/env npx tsx
/**
 * 既存シナプスの次元スコアをGeminiでバックフィルする。
 *
 * 前提: supabase に dim_rika/dim_bunkei/dim_art/dim_time カラムが存在すること。
 *   → Supabase ダッシュボードで以下を先に実行:
 *      alter table public.synapses
 *        add column if not exists dim_rika   real,
 *        add column if not exists dim_bunkei real,
 *        add column if not exists dim_art    real,
 *        add column if not exists dim_time   real;
 *
 * 実行:
 *   npx tsx scripts/backfill-dimensions.mts
 *
 * 環境変数: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type SynapseRow = {
  id: string;
  source_url: string;
  target_url: string;
  description: string;
  keywords: string[];
  dim_rika: number | null;
  dim_bunkei: number | null;
  dim_art: number | null;
  dim_time: number | null;
};

async function evaluateDimensions(synapse: SynapseRow): Promise<{
  dim_rika: number; dim_bunkei: number; dim_art: number; dim_time: number;
} | null> {
  const systemInstruction = `You evaluate the intellectual dimensions of a content connection.
Output ONLY a JSON object. No explanation, no preamble, no markdown.

Score these 4 axes:
- dim_rika (0-10): science/logic/math/engineering/data as the core of the connection
- dim_bunkei (0-10): narrative/philosophy/emotion/history/society as the core
- dim_art (0-10): visual aesthetics/design/worldview/beauty as the core
- dim_time (-5 to +5): -5=historical/past, +5=future/innovation

Output format (JSON only, nothing else):
{"dim_rika": 7, "dim_bunkei": 4, "dim_art": 2, "dim_time": 3}`;

  const userContent = JSON.stringify({
    source_url: synapse.source_url,
    target_url: synapse.target_url,
    connection_title: synapse.keywords?.[0] ?? "",
    connection_description: synapse.description,
  });

  try {
    const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash";
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: userContent,
          config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
            // 思考トークンを無効化 → 出力トークンを節約
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const isRetryable = msg.includes("503") || msg.includes("429");
        if (isRetryable && attempt < 3) {
          const wait = (attempt + 1) * 3000;
          process.stdout.write(`retry(${attempt + 1}) `);
          await new Promise((r) => setTimeout(r, wait));
        } else {
          throw e;
        }
      }
    }
    if (!response) return null;

    const raw = response.text;
    if (typeof raw !== "string" || !raw.trim()) return null;

    // Gemini がテキストを前置きすることがある → JSON部分だけ抽出
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { console.error("  JSON not found in:", raw.slice(0, 80)); return null; }
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const clamp = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      if (isNaN(n)) throw new Error(`invalid: ${String(v)}`);
      return Math.max(min, Math.min(max, n));
    };
    return {
      dim_rika:   clamp(parsed.dim_rika,   0, 10),
      dim_bunkei: clamp(parsed.dim_bunkei, 0, 10),
      dim_art:    clamp(parsed.dim_art,    0, 10),
      dim_time:   clamp(parsed.dim_time,  -5,  5),
    };
  } catch (e) {
    console.error("  ⚠ Gemini error:", e);
    return null;
  }
}

async function main() {
  // 次元データが未設定のシナプスを全取得
  const { data, error } = await supabase
    .from("synapses")
    .select("id,source_url,target_url,description,keywords,dim_rika,dim_bunkei,dim_art,dim_time")
    .is("dim_rika", null);

  if (error) { console.error("fetch error:", error); process.exit(1); }
  if (!data || data.length === 0) { console.log("バックフィル対象なし（全件スコア済み）"); return; }

  console.log(`対象: ${data.length} 件\n`);

  let ok = 0, skip = 0;
  for (const row of data as SynapseRow[]) {
    process.stdout.write(`  [${row.id.slice(0, 8)}] ${row.source_url.slice(0, 40)} → ${row.target_url.slice(0, 40)} ... `);
    const dims = await evaluateDimensions(row);
    if (!dims) { console.log("skip"); skip++; continue; }

    const { error: upErr } = await supabase
      .from("synapses")
      .update(dims)
      .eq("id", row.id);

    if (upErr) { console.log(`error: ${upErr.message}`); skip++; }
    else {
      console.log(`✓ rika=${dims.dim_rika} bunkei=${dims.dim_bunkei} art=${dims.dim_art} time=${dims.dim_time}`);
      ok++;
    }

    // レート制限対策
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n完了: ${ok} 件更新, ${skip} 件スキップ`);
}

main().catch((e) => { console.error(e); process.exit(1); });
