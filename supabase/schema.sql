-- Run once in your Supabase SQL editor. Does not touch dMoney tables.
create table if not exists public.dlife_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists public.dlife_backups (
 user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,revision)
);
alter table public.dlife_state enable row level security;
alter table public.dlife_backups enable row level security;
drop policy if exists dlife_read_own on public.dlife_state;
create policy dlife_read_own on public.dlife_state for select to authenticated using(auth.uid()=user_id);
drop policy if exists dlife_backup_read_own on public.dlife_backups;
create policy dlife_backup_read_own on public.dlife_backups for select to authenticated using(auth.uid()=user_id);
revoke all on public.dlife_state,public.dlife_backups from anon,authenticated;
grant select on public.dlife_state,public.dlife_backups to authenticated;
create or replace function public.dlife_save(p_payload jsonb,p_revision bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); current_revision bigint; next_revision bigint;
begin
 if uid is null then raise exception 'unauthorized'; end if;
 if octet_length(p_payload::text)>1000000 or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid payload'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select revision into current_revision from public.dlife_state where user_id=uid for update;
 if coalesce(current_revision,0)<>p_revision then raise exception 'revision conflict'; end if;
 next_revision:=coalesce(current_revision,0)+1;
 insert into public.dlife_state(user_id,payload,revision) values(uid,p_payload,next_revision)
 on conflict(user_id) do update set payload=excluded.payload,revision=excluded.revision,updated_at=now();
 insert into public.dlife_backups(user_id,revision,payload) values(uid,next_revision,p_payload);
 return next_revision;
end $$;
revoke all on function public.dlife_save(jsonb,bigint) from public,anon;
grant execute on function public.dlife_save(jsonb,bigint) to authenticated;
