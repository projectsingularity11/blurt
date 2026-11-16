-- Isolated production state, durable scheduling and membership-authorized hints.
create table blurt_private.game_documents (
 scope text primary key check(length(scope)<120),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision bigint not null default 1,
 next_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table blurt_private.game_documents enable row level security;
create index documents_due on blurt_private.game_documents(next_at) where next_at is not null;
create table blurt_private.rate_limits (
 actor text not null, bucket text not null, window_start bigint not null,
 count integer not null check(count>0), primary key(actor,bucket,window_start)
);
alter table blurt_private.rate_limits enable row level security;
create index rate_limit_expiry on blurt_private.rate_limits(window_start);
alter table blurt_private.players add column auth_user_id uuid unique references auth.users(id) on delete set null;
create table blurt_private.matches (
 id uuid primary key, room_code text not null references blurt_private.rooms(code),
 rules_snapshot jsonb not null, started_at timestamptz not null, finished_at timestamptz
);
alter table blurt_private.matches enable row level security;
create index matches_room on blurt_private.matches(room_code,started_at);
alter table blurt_private.rounds add column match_id uuid references blurt_private.matches(id);
create unique index rounds_match_position on blurt_private.rounds(match_id,position) where match_id is not null;
create table blurt_private.round_players (
 round_id text references blurt_private.rounds(id), player_id text references blurt_private.players(id),
 status text not null, solved_stage integer, points integer not null check(points between 0 and 500),
 primary key(round_id,player_id)
);
alter table blurt_private.round_players enable row level security;
create index round_players_player on blurt_private.round_players(player_id);

create function blurt_private.next_deadline(r jsonb) returns timestamptz
language plpgsql stable set search_path='' as $$
declare d jsonb; ms double precision := extract(epoch from now())*1000; target double precision; step double precision;
begin
 if (r->>'expires')::double precision<=ms then return now(); end if;
 if r->>'status'='finished' then return to_timestamp((r->>'expires')::double precision/1000); end if;
 if r->>'status'='lobby' then
  select min((x->>'seen')::double precision+45000) into target from jsonb_array_elements(r->'members') x where (x->>'seen')::double precision+45000>ms;
  return to_timestamp(least(coalesce(target,(r->>'expires')::double precision),(r->>'expires')::double precision)/1000);
 end if;
 d=r->'roundData';
 if d->>'revealAt' is not null then target=(d->>'revealAt')::double precision+6000;
 elsif ms<(d->>'starts')::double precision then target=(d->>'starts')::double precision;
 else step=(r->>'duration')::double precision*200;
  target=least((d->>'ends')::double precision,(d->>'starts')::double precision+(floor((ms-(d->>'starts')::double precision)/step)+1)*step);
 end if;
 return to_timestamp(target/1000);
end $$;

-- Reuse the tested relational projection for each isolated document.
create trigger project_document before insert or update of payload on blurt_private.game_documents
 for each row execute function blurt_private.project_state();
create function blurt_private.document_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb; d jsonb; m jsonb; rid text;
begin
 if new.scope like 'room:%' then
  r=new.payload->'rooms'->split_part(new.scope,':',2); d=r->'roundData';
  if r->>'matchId' is not null and d is not null and d<>'null'::jsonb then
   insert into blurt_private.matches values((r->>'matchId')::uuid,r->>'code',jsonb_build_object('rounds',r->'rounds','duration',r->'duration','category',r->'category'),to_timestamp((r->>'matchStarted')::double precision/1000),case when r->>'status'='finished' then now() else null end)
   on conflict(id) do update set finished_at=coalesce(blurt_private.matches.finished_at,excluded.finished_at);
   rid=(r->>'code')||':'||(d->>'starts');
   update blurt_private.rounds set match_id=(r->>'matchId')::uuid where id=rid;
   for m in select value from jsonb_array_elements(r->'members') where not (value->>'spectator')::boolean loop
    insert into blurt_private.round_players values(rid,m->>'id',case when d->'solved' ? (m->>'id') then 'solved' when d->>'revealAt' is not null then 'unsolved' else 'active' end,case when d->'solved' ? (m->>'id') then 6-((d->'solved'->>(m->>'id'))::int/100) else null end,coalesce((d->'solved'->>(m->>'id'))::int,0))
    on conflict(round_id,player_id) do update set status=excluded.status,solved_stage=excluded.solved_stage,points=excluded.points;
   end loop;
  end if;
  perform realtime.send(jsonb_build_object('revision',new.revision),'changed',new.scope,true);
 end if;
 update blurt_private.players set auth_user_id=id::uuid where auth_user_id is null and id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
 return null;
end $$;
create trigger document_changed after insert or update on blurt_private.game_documents for each row execute function blurt_private.document_changed();

create function public.blurt_read_document(p_scope text) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('now',floor(extract(epoch from clock_timestamp())*1000),'revision',coalesce(d.revision,0),'payload',coalesce(d.payload,'{"players":{},"daily":{},"rooms":{}}'::jsonb))
 from (select 1) base left join blurt_private.game_documents d on d.scope=p_scope;
$$;
create function public.blurt_commit_document(p_scope text,p_revision bigint,p_payload jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; r jsonb; deadline timestamptz;
begin
 if octet_length(p_payload::text)>262144 then raise exception 'Document too large'; end if;
 r=p_payload->'rooms'->split_part(p_scope,':',2);
 if p_scope like 'room:%' and r is not null then deadline=blurt_private.next_deadline(r); end if;
 if p_revision=0 then
  insert into blurt_private.game_documents(scope,payload,next_at) values(p_scope,p_payload,deadline) on conflict do nothing;
 else
  update blurt_private.game_documents set payload=p_payload,revision=revision+1,next_at=deadline where scope=p_scope and revision=p_revision;
 end if;
 get diagnostics n=row_count;return n=1;
end $$;
create function public.blurt_rate_limit(p_actor text,p_bucket text,p_limit integer,p_window integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare stamp bigint := floor(extract(epoch from clock_timestamp())/p_window)*p_window; n integer;
begin
 insert into blurt_private.rate_limits values(p_actor,p_bucket,stamp,1)
 on conflict(actor,bucket,window_start) do update set count=blurt_private.rate_limits.count+1 where blurt_private.rate_limits.count<p_limit;
 get diagnostics n=row_count;return n=1;
end $$;

-- Authenticated clients only receive invalidation hints for rooms they belong to.
-- The definer helper is private, checks auth.uid(), and returns no game state.
create function blurt_private.can_receive_room(topic text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from blurt_private.room_members m join blurt_private.rooms r on r.code=m.room_code where topic='room:'||m.room_code and m.player_id=auth.uid()::text and r.expires_at>now());
$$;
revoke all on function blurt_private.can_receive_room(text) from public;
grant usage on schema blurt_private to authenticated,service_role;
grant execute on function blurt_private.can_receive_room(text) to authenticated;
create policy blurt_room_receive on realtime.messages for select to authenticated using(blurt_private.can_receive_room(realtime.topic()));

-- The database scheduler owns transitions even with no connected browsers.
create function blurt_private.advance_due_rooms() returns integer
language plpgsql security definer set search_path='' as $$
declare doc record; r jsonb; d jsonb; ms bigint; reveal bigint; starts bigint; code text; picked text; pool text[]; unused text[]; chosen_host text; iterations integer; processed integer:=0;
begin
 ms=floor(extract(epoch from clock_timestamp())*1000);
 for doc in select * from blurt_private.game_documents where scope like 'room:%' and next_at<=clock_timestamp() order by next_at limit 100 for update skip locked loop
  code=split_part(doc.scope,':',2);r=doc.payload->'rooms'->code;
  if (r->>'expires')::bigint<=ms then
   delete from blurt_private.room_members where room_code=code;
   delete from blurt_private.game_documents where scope=doc.scope;continue;
  end if;
  if not exists(select 1 from jsonb_array_elements(r->'members') m where m->>'id'=r->>'host' and (m->>'seen')::bigint>ms-45000) then
   select m->>'id' into chosen_host from jsonb_array_elements(r->'members') m where (m->>'seen')::bigint>ms-45000 order by (m->>'joined')::bigint limit 1;
   if chosen_host is not null then r=jsonb_set(r,'{host}',to_jsonb(chosen_host)); end if;
  end if;
  iterations=0;
  while r->>'status'='playing' and iterations<16 loop
   iterations=iterations+1;d=r->'roundData';
   if d->>'revealAt' is null then
    if (d->>'ends')::bigint>ms then exit; end if;
    d=jsonb_set(d,'{revealAt}',d->'ends');r=jsonb_set(r,'{roundData}',d);
   end if;
   reveal=(d->>'revealAt')::bigint;
   if reveal+6000>ms then exit; end if;
   if (r->>'round')::int>=(r->>'rounds')::int then r=jsonb_set(r,'{status}','"finished"');exit; end if;
   select array_agg(id) into pool from blurt_private.puzzles where status='active' and (r->>'category'='All pictures' or category=r->>'category');
   select array_agg(x) into unused from unnest(pool) x where not (r->'used' ? x);
   if cardinality(unused) is null or cardinality(unused)=0 then unused=pool;r=jsonb_set(r,'{repeat}','true');end if;
   if cardinality(unused) is null then r=jsonb_set(r,'{status}','"finished"');exit;end if;
   picked=unused[1+floor(random()*cardinality(unused))::int];starts=reveal+9000;
   r=jsonb_set(r,'{used}',(r->'used')||to_jsonb(picked));
   r=jsonb_set(r,'{round}',to_jsonb((r->>'round')::int+1));
   r=jsonb_set(r,'{roundData}',jsonb_build_object('puzzle',picked,'starts',starts,'ends',starts+(r->>'duration')::bigint*1000,'guesses','[]'::jsonb,'solved','{}'::jsonb));
  end loop;
  update blurt_private.game_documents set payload=jsonb_set(doc.payload,array['rooms',code],r),revision=revision+1,next_at=blurt_private.next_deadline(r) where scope=doc.scope;
  processed=processed+1;
 end loop;return processed;
end $$;
revoke all on function blurt_private.advance_due_rooms() from public,anon,authenticated;
revoke all on all tables in schema blurt_private from anon,authenticated;
grant all on all tables in schema blurt_private to service_role;
grant execute on all functions in schema blurt_private to service_role;
revoke all on function public.blurt_read_document(text),public.blurt_commit_document(text,bigint,jsonb),public.blurt_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.blurt_read_document(text),public.blurt_commit_document(text,bigint,jsonb),public.blurt_rate_limit(text,text,integer,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('blurt-puzzles','blurt-puzzles',false,1048576,array['image/webp']) on conflict(id) do nothing;
-- No client Storage policies: only the authorized Edge function reads objects.
create extension if not exists pg_cron;
select cron.schedule('blurt-round-transitions','1 second','select blurt_private.advance_due_rooms()');
select cron.schedule('blurt-rate-limit-cleanup','17 * * * *','delete from blurt_private.rate_limits where window_start<extract(epoch from now())-86400');
create table blurt_private.content_releases(version text primary key, installed_at timestamptz not null default now());
alter table blurt_private.content_releases enable row level security;
grant all on blurt_private.content_releases to service_role;
create function public.blurt_seed_catalog(p_version text,p_puzzles jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare p jsonb; a text; stage integer;
begin
 if exists(select 1 from blurt_private.content_releases where version=p_version) then return;end if;
 perform pg_advisory_xact_lock(281975442);
 for p in select value from jsonb_array_elements(p_puzzles) loop
  insert into blurt_private.puzzles(id,canonical_answer,category) values(p->>'id',p->>'answer',p->>'category') on conflict(id) do nothing;
  for a in select jsonb_array_elements_text((p->'aliases')||jsonb_build_array(p->>'answer')) loop
   insert into blurt_private.puzzle_answers values(p->>'id',a) on conflict do nothing;
  end loop;
  for stage in 1..6 loop
   insert into blurt_private.puzzle_assets values(p->>'id',stage,'v1/'||(p->>'id')||'-'||stage||'.webp') on conflict do nothing;
  end loop;
 end loop;
 insert into blurt_private.content_releases values(p_version,now()) on conflict do nothing;
end $$;
revoke all on function public.blurt_seed_catalog(text,jsonb) from public,anon,authenticated;
grant execute on function public.blurt_seed_catalog(text,jsonb) to service_role;
create function public.blurt_player_stats(p_player text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('played',count(*) filter(where status='finished'),'won',count(*) filter(where solved_stage is not null),'best',min(solved_stage)) from blurt_private.daily_runs where player_id=p_player;
$$;
revoke all on function public.blurt_player_stats(text) from public,anon,authenticated;
grant execute on function public.blurt_player_stats(text) to service_role;
