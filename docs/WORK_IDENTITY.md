# 作品同一性（Work Identity）

Synapse Galaxy では **作品** を ID・名寄せ・グラフ・検索の共通単位とする。

## 同一作品（1つの `canonical_id`）

- 上下巻・各巻（1巻・2巻…）— 巻表記はフィンガープリントから除去
- 文庫 / 単行本 / Kindle / 別 ASIN
- 別店 URL（Amazon tag 違い・長い検索 URL など）— endpoint は ASIN 等に正規化
- 同一シーズン・同一版の別プラットフォーム（例: 同じ S1 の Netflix と Prime）

## 別作品（別 `canonical_id`）

- シーズン違い（S1 / S2 …）
- 原作と映画・ドラマ化
- 総集編・完全版
- リメイク・別国版

## 実装

| レイヤー | モジュール |
|----------|------------|
| フィンガープリント | `src/lib/workIdentity.ts` |
| DB upsert / マップ | `src/lib/workResolve.ts` |
| グラフ・UI キー | `src/lib/workEndpoint.ts` |
| 既存 DB 修復 | `npx tsx scripts/reconcile-works.mts --apply` |

`work_fingerprint` 列（migration `20260520000000_work_fingerprint.sql`）が一致すれば同一作品。曖昧時のみ Gemini が補助。
