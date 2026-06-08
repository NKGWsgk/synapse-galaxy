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
    raw: "クイーンズ・ギャンビット\uFEFFを観\uFEFFる | Netflix (\uFEFFネ\uFEFFッ\uFEFFト\uFEFFフ\uFEFFリ\uFEFFッ\uFEFFク\uFEFFス\uFEFF) 公\uFEFF式サ\uFEFFイ\uFEFFト",
    url: "https://www.netflix.com/watch/80243261",
    want: "クイーンズ・ギャンビット",
  },
  {
    raw: "Watch The Queen's Gambit | Netflix Official Site",
    url: "https://www.netflix.com/watch/80243261",
    want: "The Queen's Gambit",
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
  {
    raw: "映画『ミッキー17』大ヒット上映中",
    url: "https://www.amazon.co.jp/gp/video/detail/123",
    want: "ミッキー17",
  },
  {
    raw: "マイ・インターン(吹替版)を観る | Prime Video",
    url: "https://www.amazon.co.jp/gp/video/detail/456",
    want: "マイ・インターン(吹替版)",
  },
  {
    raw: "ミッキー17を観る | Prime Video",
    url: "https://www.amazon.co.jp/gp/video/detail/789",
    want: "ミッキー17",
  },
  {
    raw: "マイ・インターン(吹替版)を観る | Prime Video",
    url: "https://www.amazon.co.jp/dp/B0GWWR79BZ",
    want: "マイ・インターン(吹替版)",
  },
  {
    raw: "映画「エレクトリック・ステイト」配信中",
    url: "https://www.netflix.com/title/123",
    want: "エレクトリック・ステイト",
  },
  {
    raw: "リトル・フォレスト(1) (ワイドKCアフタヌーン)",
    url: "https://www.amazon.co.jp/dp/406337551X",
    want: "リトル・フォレスト",
  },
  {
    raw: "Amazon.co.jp: リトル・フォレスト(1) (ワイドKCアフタヌーン) : 五十嵐 大介: 本",
    url: "https://www.amazon.co.jp/dp/406337551X",
    want: "リトル・フォレスト",
  },
  {
    raw: "昨夜のカレー、明日のパン (河出文庫 き 7-7)",
    url: "https://www.amazon.co.jp/dp/4309414265",
    want: "昨夜のカレー、明日のパン",
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
