#!/usr/bin/env npx tsx
/**
 * エッジ用改行（suggestEdgeKeywordLineBreak / sanitize）のローカル検証。
 * DB は見ない。任意で .env.local があれば Gemini を1発叩く（GEMINI_EDGE_KEYWORD_BREAK=1 かつ GEMINI_API_KEY）。
 *
 * 実行（リポジトリ直下で）:
 *   cd /Users/nkgws/synapse-galaxy
 *   npx tsx verify-edge-keyword-break.mts
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

/** Node+tsx が .mts エントリからの静的 import で空モジュールになるのを避ける */
const edgeMod = new URL("./src/lib/gemini/edgeKeywordBreak.ts", import.meta.url).href;
const displayMod = new URL("./src/lib/edgeKeywordDisplay.ts", import.meta.url).href;
const { suggestEdgeKeywordLineBreak } = await import(edgeMod);
const { sanitizeEdgeKeywordBreakOutput } = await import(displayMod);

/** smart-input / suggest と同じ上限（src/lib/synapseLimits.ts と同期） */
const TITLE_MAX = 30;

const SAMPLE = "人類のために頭脳をフルベットする主人公";

function section(title: string) {
  console.log("\n──", title, "──");
}

async function main() {
  console.log("verify-edge-keyword-break（ローカル検証）");

  section("1. 接続タイトル長さ（smart-input / suggest の前提）");
  const len = [...SAMPLE.normalize("NFC")].length;
  console.log("  文言:", SAMPLE);
  console.log("  Unicode コードポイント数（展開後）:", len);
  console.log("  SYNAPSE_EDGE_TITLE_MAX_CHARS:", TITLE_MAX);
  console.log("  suggest スキップ（上限超）:", len > TITLE_MAX ? "はい" : "いいえ");
  console.log("  suggest スキップ（1字以下・API 呼ばない）:", len < 2 ? "はい" : "いいえ");

  section("2. sanitize（モデル応答の模擬）");
  const same = sanitizeEdgeKeywordBreakOutput(SAMPLE, SAMPLE);
  console.log("  formatted=入力同一 → 戻り値に \\n があるか:", same.includes("\n") ? "あり" : "なし（期待どおり）");

  const withBreak = sanitizeEdgeKeywordBreakOutput(SAMPLE, "人類のために\n頭脳をフルベットする主人公");
  console.log('  「人類のために\\n頭脳を…」→ 採用:', withBreak.includes("\n") ? `はい → ${JSON.stringify(withBreak)}` : "いいえ");

  const badReorder = sanitizeEdgeKeywordBreakOutput(SAMPLE, "頭脳をフルベットする主人公人類のために");
  console.log("  並べ替えだけ → 却下で原文:", badReorder === SAMPLE ? "はい" : "いいえ");

  section("3. 環境変数（現在のシェル / .env.local 読込後）");
  const key = !!process.env.GEMINI_API_KEY?.trim();
  const flag = process.env.GEMINI_EDGE_KEYWORD_BREAK === "1";
  console.log("  GEMINI_API_KEY 設定済み:", key);
  console.log('  GEMINI_EDGE_KEYWORD_BREAK === "1":', flag);
  console.log("  → suggest が Gemini を呼ぶ条件:", key && flag ? "満たす" : "満たさない（原文のまま返る）");

  section("4. suggestEdgeKeywordLineBreak（実呼び出し・任意）");
  if (!key || !flag) {
    console.log("  スキップ（API またはフラグなし）。実機検証は .env.local に GEMINI_API_KEY と GEMINI_EDGE_KEYWORD_BREAK=1 を設定して再実行。");
  } else {
    console.log("  Gemini を呼びます…");
    const out = await suggestEdgeKeywordLineBreak(SAMPLE);
    console.log("  戻り値 JSON 断片:", JSON.stringify(out));
    console.log("  U+000A を含むか:", out.includes("\n"));
    if (out.includes("\n")) {
      const pos = out.indexOf("\n");
      console.log("  改行位置（0-based index）:", pos);
      console.log("  1行目:", JSON.stringify(out.slice(0, pos)));
      console.log("  2行目:", JSON.stringify(out.slice(pos + 1)));
    }
  }

  section("5. シード経路の注意（コード根拠）");
  console.log(
    "  scripts/seed-sample-data.mts は extractKeywordsBatch のみ。suggestEdgeKeywordLineBreak は呼ばない。",
  );
  console.log(
    "  → 既存行は scripts/backfill-edge-keyword-breaks.mts で DB の keywords に \\n を反映する（表示は DB のみ信頼）。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
