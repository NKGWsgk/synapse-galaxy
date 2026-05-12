-- Synapse Galaxy: initial schema

create extension if not exists "pgcrypto";

create table if not exists public.contents_metadata (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  -- 同一作品/概念を束ねる正規化ID（URLが違っても同一なら同じ値）
  canonical_id uuid not null default gen_random_uuid(),
  -- 購入リンク等の集約（canonical_id 単位で UI に複数ボタンを出す想定）
  -- 例: {"amazon":"https://...","rakuten":"https://..."}
  purchase_links jsonb not null default '{}'::jsonb,
  title text,
  description text,
  image_url text,
  site_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contents_metadata_updated on public.contents_metadata (updated_at desc);
create index if not exists idx_contents_metadata_canonical on public.contents_metadata (canonical_id);

create table if not exists public.synapses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  source_url text not null,
  target_url text not null,
  category_id smallint not null check (category_id between 1 and 8),
  description text not null default '',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_synapses_source on public.synapses (source_url);
create index if not exists idx_synapses_target on public.synapses (target_url);
create index if not exists idx_synapses_category on public.synapses (category_id);
create index if not exists idx_synapses_user on public.synapses (user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contents_metadata_updated on public.contents_metadata;
create trigger trg_contents_metadata_updated
  before update on public.contents_metadata
  for each row execute procedure public.set_updated_at();

drop trigger if exists trg_synapses_updated on public.synapses;
create trigger trg_synapses_updated
  before update on public.synapses
  for each row execute procedure public.set_updated_at();

alter table public.contents_metadata enable row level security;
alter table public.synapses enable row level security;

drop policy if exists "contents_metadata_select_anon" on public.contents_metadata;
create policy "contents_metadata_select_anon"
  on public.contents_metadata for select
  using (true);

drop policy if exists "contents_metadata_write_authenticated" on public.contents_metadata;
create policy "contents_metadata_write_authenticated"
  on public.contents_metadata for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "contents_metadata_update_authenticated" on public.contents_metadata;
create policy "contents_metadata_update_authenticated"
  on public.contents_metadata for update
  using (auth.role() = 'authenticated');

drop policy if exists "synapses_select_anon" on public.synapses;
create policy "synapses_select_anon"
  on public.synapses for select
  using (true);

drop policy if exists "synapses_insert_authenticated" on public.synapses;
create policy "synapses_insert_authenticated"
  on public.synapses for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "synapses_update_own" on public.synapses;
create policy "synapses_update_own"
  on public.synapses for update
  using (auth.uid() = user_id);

drop policy if exists "synapses_delete_own" on public.synapses;
create policy "synapses_delete_own"
  on public.synapses for delete
  using (auth.uid() = user_id);
