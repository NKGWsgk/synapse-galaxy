-- Server-side pre-computed graph layout cache.
-- Single-row singleton (id = 1), updated on every new synapse.
create table if not exists layout_cache (
  id          int primary key default 1,
  positions   jsonb not null default '[]',
  synapse_count int not null default 0,
  computed_at timestamptz not null default now(),
  constraint layout_cache_singleton check (id = 1)
);

-- Allow service role (API routes) to read and write; anon can only read.
alter table layout_cache enable row level security;

create policy "anon read" on layout_cache
  for select using (true);

create policy "service write" on layout_cache
  for all using (auth.role() = 'service_role');
