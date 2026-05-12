# Vercel デプロイ手順

## 0. 前提

- Supabase プロジェクト稼働中
- Gemini API key 取得済み
- GitHub アカウントあり
- Vercel アカウントあり（無ければ https://vercel.com/signup で GitHub 連携）

---

## 1. GitHub に repo を push

### A. GitHub Web で新規 repo 作成
1. https://github.com/new
2. Repository name: `synapse-galaxy` （任意）
3. Public/Private お好み（Public 推奨：Vercel 無料枠の制約緩い）
4. **Initialize this repository with: 何もチェックしない**（README, .gitignore など追加しない）
5. Create repository

### B. ローカルから push（terminal で実行）

```bash
cd /Users/nkgws/synapse-galaxy

# 既存変更をコミット（agent 側で済んでなければ）
git add -A
git commit -m "Initial Synapse Galaxy build"

# remote 追加 + push
git remote add origin git@github.com:<YOUR-USERNAME>/synapse-galaxy.git
git branch -M main
git push -u origin main
```

`git@github.com:...` で `Permission denied (publickey)` が出る場合は HTTPS を使う:
```bash
git remote set-url origin https://github.com/<YOUR-USERNAME>/synapse-galaxy.git
git push -u origin main
# → PAT (Personal Access Token) を聞かれる
```

---

## 2. Vercel にインポート

1. https://vercel.com/new
2. Import Git Repository → さっき作った `synapse-galaxy` を選択
3. **Framework Preset**: Next.js（自動検出されるはず）
4. **Root Directory**: `./` （デフォルトのまま）
5. **Environment Variables** で以下を追加：

| Key | Value（Supabase Dashboard → Settings → API から） |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `GEMINI_API_KEY` | Gemini API key |
| `NEXT_PUBLIC_AMAZON_AFFILIATE_TAG` | `nkgw07-22`（または任意） |
| `AMAZON_AFFILIATE_TAG` | 同上 |

`.env.local` の値をそのままコピペ。

6. **Deploy** ボタン押下 → 2-3 分待つ

---

## 3. デプロイ後 必須セットアップ

### 3a. Supabase Auth Callback URL を追加

Vercel から発行された URL を控える（例: `https://synapse-galaxy.vercel.app`）。

Supabase Dashboard → **Authentication** → **URL Configuration**:
- **Site URL**: `https://synapse-galaxy.vercel.app`
- **Redirect URLs** に追加:
  - `https://synapse-galaxy.vercel.app/**`
  - 既存のローカル開発用も残す: `http://localhost:3000/**`

### 3b. Google OAuth 設定（使ってる場合）

Google Cloud Console → OAuth 2.0 Client → 「承認済みのリダイレクト URI」に追加:
- `https://<YOUR-SUPABASE-REF>.supabase.co/auth/v1/callback`

（既に Supabase 側で OAuth プロバイダ設定済みなら不要）

### 3c. likes_count trigger（未実施なら）

Supabase Dashboard → SQL Editor:
- `supabase/migrations/20260512000000_likes_count_trigger.sql` の中身を実行

---

## 4. 動作確認

デプロイされた URL を開いて：

- [ ] ホーム画面（リングビュー）が表示される
- [ ] Google ログインできる
- [ ] シナプス追加→保存できる（user_id が紐付くか）
- [ ] いいねが付く・カウントが更新される
- [ ] ランキングに表示される
- [ ] OGP 画像が読み込まれる（Amazon, YouTube, etc.）

---

## 5. 既存ローカルデータの保持

Supabase は同じプロジェクトを共有するので、ローカルで作ったシナプス・ユーザーは本番でも見える。
分離したい場合は Vercel 用に別 Supabase project を作って env を分ける。

---

## トラブルシューティング

### Build エラー
ローカルで `npm run build` が通るのに Vercel で失敗 → Node version 不一致が多い。`package.json` に `"engines": { "node": ">=20" }` を追加。

### "Cannot connect to Supabase"
env vars が反映されてない可能性 → Vercel Dashboard → Settings → Environment Variables で確認。**変更後は Redeploy 必須**（Deployments → … → Redeploy）。

### Google ログイン失敗
Supabase Site URL / Redirect URLs が Vercel URL に対応していない可能性。3a を再確認。
