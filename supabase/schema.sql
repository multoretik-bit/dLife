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

-- Shared code spaces. Enable Anonymous Sign-Ins in Authentication settings so
-- a new device can authenticate without an email account.
create extension if not exists pgcrypto;
create table if not exists public.dlife_code_spaces (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique,
 payload jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table if not exists public.dlife_code_members (
 space_id uuid not null references public.dlife_code_spaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(space_id,user_id),
 unique(user_id)
);
create table if not exists public.dlife_code_backups (
 space_id uuid not null references public.dlife_code_spaces(id) on delete cascade,
 revision bigint not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(space_id,revision)
);
alter table public.dlife_code_spaces enable row level security;
alter table public.dlife_code_members enable row level security;
alter table public.dlife_code_backups enable row level security;
revoke all on public.dlife_code_spaces,public.dlife_code_members,public.dlife_code_backups from anon,authenticated;

create or replace function public.dlife_join_code(p_code text,p_initial jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid(); normalized text; hash text; sid uuid; created boolean:=false; imported boolean:=false; result jsonb; current_payload jsonb; current_revision bigint;
begin
 if uid is null then raise exception 'unauthorized'; end if;
 normalized:=regexp_replace(upper(trim(p_code)),'[^A-Z0-9]','','g');
 if length(normalized)<10 or length(normalized)>32 then raise exception 'invalid code'; end if;
 if p_initial is null or jsonb_typeof(p_initial)<>'object' or octet_length(p_initial::text)>1000000 then raise exception 'invalid payload'; end if;
 hash:=encode(digest(normalized,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(hash,0));
 select id into sid from public.dlife_code_spaces where code_hash=hash;
 if sid is null then
   insert into public.dlife_code_spaces(code_hash,payload) values(hash,p_initial) returning id into sid;
   created:=true;
 end if;
 insert into public.dlife_code_members(space_id,user_id) values(sid,uid)
 on conflict(user_id) do update set space_id=excluded.space_id,joined_at=now();
 select payload,revision into current_payload,current_revision from public.dlife_code_spaces where id=sid for update;
 if not created
   and coalesce(current_payload->'blocks','[]'::jsonb)='[]'::jsonb
   and coalesce(current_payload->'items','[]'::jsonb)='[]'::jsonb
   and coalesce(current_payload->'logs','[]'::jsonb)='[]'::jsonb
   and coalesce(current_payload->'practices','[]'::jsonb)='[]'::jsonb
   and coalesce(current_payload->'done','{}'::jsonb)='{}'::jsonb
   and coalesce(current_payload->'steps','{}'::jsonb)='{}'::jsonb
   and coalesce(current_payload->'spherePlans','{}'::jsonb)='{}'::jsonb
   and (
     coalesce(p_initial->'blocks','[]'::jsonb)<>'[]'::jsonb or
     coalesce(p_initial->'items','[]'::jsonb)<>'[]'::jsonb or
     coalesce(p_initial->'logs','[]'::jsonb)<>'[]'::jsonb or
     coalesce(p_initial->'practices','[]'::jsonb)<>'[]'::jsonb or
     coalesce(p_initial->'done','{}'::jsonb)<>'{}'::jsonb or
     coalesce(p_initial->'steps','{}'::jsonb)<>'{}'::jsonb or
     coalesce(p_initial->'spherePlans','{}'::jsonb)<>'{}'::jsonb
   ) then
   insert into public.dlife_code_backups(space_id,revision,payload) values(sid,current_revision+1,p_initial);
   update public.dlife_code_spaces set payload=p_initial,revision=current_revision+1,updated_at=now() where id=sid;
   current_payload:=p_initial;
   current_revision:=current_revision+1;
   imported:=true;
 end if;
 result:=jsonb_build_object('payload',current_payload,'revision',current_revision,'created',created,'imported',imported);
 return result;
end $$;

create or replace function public.dlife_code_load()
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'unauthorized'; end if;
 select jsonb_build_object('payload',s.payload,'revision',s.revision) into result
 from public.dlife_code_spaces s join public.dlife_code_members m on m.space_id=s.id where m.user_id=uid;
 if result is null then raise exception 'code space not joined'; end if;
 return result;
end $$;

create or replace function public.dlife_code_save(p_payload jsonb,p_revision bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); sid uuid; current_revision bigint; next_revision bigint;
begin
 if uid is null then raise exception 'unauthorized'; end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1000000 then raise exception 'invalid payload'; end if;
 select space_id into sid from public.dlife_code_members where user_id=uid;
 if sid is null then raise exception 'code space not joined'; end if;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 select revision into current_revision from public.dlife_code_spaces where id=sid for update;
 if current_revision<>p_revision then raise exception 'revision conflict'; end if;
 next_revision:=current_revision+1;
 insert into public.dlife_code_backups(space_id,revision,payload) values(sid,next_revision,p_payload);
 update public.dlife_code_spaces set payload=p_payload,revision=next_revision,updated_at=now() where id=sid;
 return next_revision;
end $$;
revoke all on function public.dlife_join_code(text,jsonb),public.dlife_code_load(),public.dlife_code_save(jsonb,bigint) from public,anon;
grant execute on function public.dlife_join_code(text,jsonb),public.dlife_code_load(),public.dlife_code_save(jsonb,bigint) to authenticated;
