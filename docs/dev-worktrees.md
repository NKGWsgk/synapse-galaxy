# Git Worktree での開発

このリポジトリは複数ディレクトリで同じ Git を共有できる **worktree** を使える。

## 推奨

- **日常的な開発・編集:**  
  `.claude/worktrees/fervent-beaver-732958/`（または任意の機能ブランチ用 worktree）を Cursor のワークスペースルートとして開く。
- **`npm run dev`:** 上記と **同じディレクトリ** で実行する。別パスだとコードがずれる。

## `next.config.ts` の `turbopack.root`

親に別の `package-lock.json` があると Turbopack がワークスペースルートを誤推定することがあるため、`next.config.ts` で **`turbopack.root`** をこのプロジェクト直下に固定している。

## オリジナル検出（`/Users/nkgws/synapse-galaxy` の main）

機能が main にマージされたら、このディレクトリで `pull`／`checkout main` が最新になる。並行開発中は fervent-beaver 側を優先すること。
