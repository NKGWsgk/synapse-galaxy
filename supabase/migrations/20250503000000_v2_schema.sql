-- Synapse Galaxy v2: category_id削除 / synapse_likes / notifications 追加

-- ── 1. synapses から category_id を削除 ──────────────────────────────────────
alter table public.synapses drop column if exists category_id;

-- likes_count カラムを追加（非正規化カウンタ）
alter table public.synapses
  add column if not exists likes_count integer not null default 0;

-- ── 2. synapse_likes テーブル ────────────────────────────────────────────────
create table if not exists public.synapse_likes (
  id         uuid primary key default gen_random_uuid(),
  synapse_id uuid not null references public.synapses (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (synapse_id, user_id)
);

create index if not exists idx_synapse_likes_synapse on public.synapse_likes (synapse_id);
create index if not exists idx_synapse_likes_user   on public.synapse_likes (user_id);

alter table public.synapse_likes enable row level security;

drop policy if exists "synapse_likes_select_anon" on public.synapse_likes;
create policy "synapse_likes_select_anon"
  on public.synapse_likes for select using (true);

drop policy if exists "synapse_likes_insert_auth" on public.synapse_likes;
create policy "synapse_likes_insert_auth"
  on public.synapse_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "synapse_likes_delete_own" on public.synapse_likes;
create policy "synapse_likes_delete_own"
  on public.synapse_likes for delete
  using (auth.uid() = user_id);

-- likes_count を自動更新するトリガー
create or replace function public.update_synapse_likes_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.synapses set likes_count = likes_count + 1 where id = new.synapse_id;
  elsif tg_op = 'DELETE' then
    update public.synapses set likes_count = greatest(0, likes_count - 1) where id = old.synapse_id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_synapse_likes_count on public.synapse_likes;
create trigger trg_synapse_likes_count
  after insert or delete on public.synapse_likes
  for each row execute procedure public.update_synapse_likes_count();

-- ── 3. notifications テーブル ────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('liked', 'new_synapse')),
  synapse_id uuid references public.synapses (id) on delete cascade,
  actor_id   uuid references auth.users (id) on delete set null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id);

-- service_role からのみ insert 可（API Routeからトリガー）
drop policy if exists "notifications_insert_service" on public.notifications;
create policy "notifications_insert_service"
  on public.notifications for insert
  with check (true);
