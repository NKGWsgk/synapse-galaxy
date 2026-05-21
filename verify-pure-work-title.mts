#!/usr/bin/env npx tsx
/**
 * 純粋作品名抽出（extractPureWorkTitle）のローカル検証。
 *
 *   npx tsx verify-pure-work-title.mts
 */

const mod = new URL("./src/lib/pureWorkTitle.ts", import.meta.url).href;
const { extractPureWorkTitle } = await import(mod);

type Case = { raw: string; url: string; want: string };

const CASES: Case[] = [
  {
    raw: "Amazon.co.jp: プロジェクト・ヘイル・メアリー 下: アンディ・ウィアー: 本",
    url: "https://www.amazon.co.jp/dp/4062938356",
    want: "プロジェクト・ヘイル・メアリー",
  },
  {
    raw: "砂の女（ハヤカワ文庫SF）",
    url: "https://www.amazon.co.jp/dp/4150012345",
    want: "砂の女",
  },
  {
    raw: "イカゲーム を観る | Netflix ( ネットフリックス ) 公式サイト",
    url: "https://www.netflix.com/title/123",
    want: "イカゲーム",
  },
  {
    raw: "「三体 を観る」",
    url: "https://www.netflix.com/title/81234567",
    want: "三体",
  },
  {
    raw: "三体 を観 る",
    url: "https://www.netflix.com/title/81024821",
    want: "三体",
  },
  {
    raw: "三体 上",
    url: "https://www.amazon.co.jp/dp/4062938305",
    want: "三体",
  },
  {
    raw: "【ハヤカワ文庫SF】宇宙への墓標",
    url: "https://www.amazon.co.jp/dp/4150100000",
    want: "宇宙への墓標",
  },
  {
    raw: "火星の人〔新版〕　上 (ハヤカワ文庫SF)",
    url: "https://www.amazon.co.jp/dp/B09V53MNNK",
    want: "火星の人",
  },
];

let failed = 0;
for (const c of CASES) {
  const got = extractPureWorkTitle(c.raw, c.url);
  const ok = got === c.want;
  console.log(ok ? "✓" : "✗", c.raw.slice(0, 48));
  if (!ok) {
    failed++;
    console.log("  want:", c.want);
    console.log("  got: ", got);
  }
}
if (failed > 0) process.exit(1);
console.log("\nAll", CASES.length, "cases passed.");
