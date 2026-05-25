-- 作品共有 URL 用スラッグ（canonical_id 単位で同一値）
alter table public.contents_metadata
  add column if not exists share_slug text;

create index if not exists idx_contents_metadata_share_slug
  on public.contents_metadata (share_slug)
  where share_slug is not null;
