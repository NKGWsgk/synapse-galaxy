-- likes_count を synapse_likes と同期するトリガーを（再）導入。
-- 20250503000000_v2_schema.sql で一度入れているが、本番に未適用 or 喪失したため
-- 冪等な CREATE OR REPLACE / DROP IF EXISTS で再構築し、ついでに既存データをバックフィルする。

create or replace function public.sync_synapse_likes_count()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    update public.synapses
       set likes_count = coalesce(likes_count, 0) + 1
     where id = new.synapse_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.synapses
       set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
     where id = old.synapse_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_synapse_likes_count on public.synapse_likes;
drop trigger if exists trg_sync_synapse_likes_count on public.synapse_likes;
create trigger trg_sync_synapse_likes_count
  after insert or delete on public.synapse_likes
  for each row execute function public.sync_synapse_likes_count();

-- 既存 synapse_likes 行に対応する likes_count をバックフィル
update public.synapses s
   set likes_count = coalesce(sub.cnt, 0)
  from (
    select synapse_id, count(*)::int as cnt
      from public.synapse_likes
     group by synapse_id
  ) sub
 where s.id = sub.synapse_id;

-- いいねが 1 件もない synapses は 0 に正規化（NULL があった場合のセーフティ）
update public.synapses
   set likes_count = 0
 where likes_count is null;
