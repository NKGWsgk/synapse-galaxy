-- Synapse Galaxy: 接続次元スコア追加
-- 各シナプスが「どの知的様式で繋がっているか」をAIが評価して格納する

alter table public.synapses
  add column if not exists dim_rika   real, -- 理系度 0〜10（科学・論理・データ）
  add column if not exists dim_bunkei real, -- 文系度 0〜10（物語・思想・人文）
  add column if not exists dim_art    real, -- 芸術度 0〜10（美学・映像・デザイン）
  add column if not exists dim_time   real; -- 時間軸 -5（歴史）〜 +5（未来）
