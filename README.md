# Synapse Galaxy

8 属性でコンテンツを結ぶシナプス型ネットワーク（Next.js + Supabase + Gemini）。

仕様の全文は [docs/SYNAPSE_GALAXY_SPEC.md](./docs/SYNAPSE_GALAXY_SPEC.md) を参照してください。

## セットアップ

1. `.env.example` を `.env.local` にコピーし、Supabase / Gemini のキーを設定する。
2. Supabase プロジェクトで `supabase/migrations/20250428000000_init.sql` を実行する。
3. サンプル 100 件を入れる（Gemini で keywords 抽出）:

```bash
npm run seed
```

4. 開発サーバー:

```bash
npm run dev
```

## 主な構成

- `src/app/api/synapses` — シナプス一覧
- `src/app/api/synapse/smart-input` — OGP 取得、Amazon `tag` 付与、キーワード抽出、`synapses` / `contents_metadata` 更新
- `src/components/galaxy/*` — コンパス UI・ベクトルキャンバス・スマートインプット
- `scripts/seed-sample-data.mts` — シード投入
- `scripts/backfill-edge-keyword-breaks.mts` — 既存シナプスの接続短題に改行を DB 反映（`GEMINI_EDGE_KEYWORD_BREAK=1` 前提）

## Peppy との位置関係

リポジトリは Peppy（`/Users/nkgws/Peppy`）と同階層の `/Users/nkgws/synapse-galaxy` に配置されています。
