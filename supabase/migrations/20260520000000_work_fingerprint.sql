-- 作品同一判定: 全レイヤー（名寄せ・検索・グラフ）で共有するフィンガープリント
alter table public.contents_metadata
  add column if not exists work_fingerprint text;

create index if not exists idx_contents_metadata_work_fingerprint
  on public.contents_metadata (work_fingerprint)
  where work_fingerprint is not null;
