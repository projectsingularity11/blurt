-- Licensed immutable content, a pre-booked daily year and cross-mode no-repeat deals.
alter table blurt_private.puzzles add column source jsonb not null default '{}'::jsonb;
alter table blurt_private.puzzles add column source_sha1 text;
alter table blurt_private.puzzles add column daily_reserved boolean not null default false;
alter table blurt_private.puzzles add column content_release text not null default 'photographs-v1';
create index puzzles_unseen_pool on blurt_private.puzzles(category,id) where status='active' and content_release='photographs-v2' and not daily_reserved;
create unique index puzzles_source_unique on blurt_private.puzzles(source_sha1) where source_sha1 is not null;
create unique index new_puzzle_answer_unique on blurt_private.puzzles(lower(canonical_answer)) where content_release='photographs-v2';
create unique index daily_new_picture_unique on blurt_private.daily_puzzles(puzzle_id) where puzzle_id like 'p%';
create table blurt_private.seen_puzzles (
 player_id uuid not null references auth.users(id) on delete cascade,
 puzzle_id text not null references blurt_private.puzzles(id),
 first_deal text not null, dealt_at timestamptz not null default now(),
 primary key(player_id,puzzle_id)
);
create index seen_puzzles_picture on blurt_private.seen_puzzles(puzzle_id);
create table blurt_private.puzzle_deals (
 id text primary key, players text[] not null, category text not null,
 pictures text[] not null, created_at timestamptz not null default now()
);
alter table blurt_private.seen_puzzles enable row level security;
alter table blurt_private.puzzle_deals enable row level security;
revoke all on blurt_private.seen_puzzles,blurt_private.puzzle_deals from public,anon,authenticated;
grant all on blurt_private.seen_puzzles,blurt_private.puzzle_deals to service_role;
create policy backend_only on blurt_private.seen_puzzles for all to service_role using(true) with check(true);
create policy backend_only on blurt_private.puzzle_deals for all to service_role using(true) with check(true);

create function public.blurt_draw_puzzles(p_players text[],p_category text,p_count integer,p_deal text) returns text[]
language plpgsql security invoker set search_path='' as $$
declare prior blurt_private.puzzle_deals%rowtype; chosen text[]; actors text[];
begin
 if p_count<1 or p_count>7 or cardinality(p_players)<1 or cardinality(p_players)>8 or length(p_deal)>200 then raise exception 'Invalid content deal';end if;
 select array_agg(distinct x order by x) into actors from unnest(p_players) x;
 perform pg_advisory_xact_lock(281975443);
 select * into prior from blurt_private.puzzle_deals where id=p_deal;
 if found then
  if prior.players<>actors or prior.category<>p_category or cardinality(prior.pictures)<>p_count then raise exception 'Deal does not match';end if;
  return prior.pictures;
 end if;
 select array_agg(id order by position) into chosen from (
  select p.id,row_number() over(order by md5(p_deal||p.id)) position
  from blurt_private.puzzles p
  where p.status='active' and p.content_release='photographs-v2' and not p.daily_reserved
   and (p_category='All pictures' or p.category=p_category)
   and not exists(select 1 from blurt_private.seen_puzzles s where s.puzzle_id=p.id and s.player_id::text=any(actors))
  order by md5(p_deal||p.id) limit p_count
 ) available;
 if coalesce(cardinality(chosen),0)<p_count then raise exception 'No unseen pictures left in this category';end if;
 insert into blurt_private.puzzle_deals values(p_deal,actors,p_category,chosen,now());
 insert into blurt_private.seen_puzzles(player_id,puzzle_id,first_deal)
 select actor::uuid,picture,p_deal from unnest(actors) actor cross join unnest(chosen) picture;
 return chosen;
end $$;
revoke all on function public.blurt_draw_puzzles(text[],text,integer,text) from public,anon,authenticated;
grant execute on function public.blurt_draw_puzzles(text[],text,integer,text) to service_role;

create or replace function public.blurt_seed_catalog(p_version text,p_puzzles jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare p jsonb; a text; stage integer; d integer; today integer; chosen text; prefix text;
begin
 if exists(select 1 from blurt_private.content_releases where version=p_version) then return;end if;
 perform pg_advisory_xact_lock(281975442);
 if exists(select 1 from blurt_private.content_releases where version=p_version) then return;end if;
 for p in select value from jsonb_array_elements(p_puzzles) loop
  prefix=case when p->>'release'='photographs-v2' then 'v2/' else 'v1/' end;
  if prefix='v2/' and (select count(*) from storage.objects where bucket_id='blurt-puzzles' and name=any(array(select prefix||(p->>'id')||'-'||n||'.webp' from generate_series(1,6) n)))<>6 then
   raise exception 'Content assets not ready';
  end if;
  insert into blurt_private.puzzles(id,canonical_answer,category,source,source_sha1,daily_reserved,content_release)
  values(p->>'id',p->>'answer',p->>'category',coalesce(p->'credit','{}'::jsonb),p->>'sourceSha1',coalesce((p->>'daily')::boolean,false),coalesce(p->>'release','photographs-v1'))
  on conflict(id) do update set source=excluded.source,source_sha1=excluded.source_sha1,daily_reserved=excluded.daily_reserved,content_release=excluded.content_release;
  for a in select jsonb_array_elements_text((p->'aliases')||jsonb_build_array(p->>'answer')) loop
   insert into blurt_private.puzzle_answers values(p->>'id',a) on conflict do nothing;
  end loop;
  for stage in 1..6 loop
   insert into blurt_private.puzzle_assets values(p->>'id',stage,prefix||(p->>'id')||'-'||stage||'.webp') on conflict do nothing;
  end loop;
 end loop;
 if p_version='photographs-v2' then
  today=floor(extract(epoch from clock_timestamp())/86400);
  for d in today..today+365 loop
   if exists(select 1 from blurt_private.daily_puzzles where day=d) then continue;end if;
   select id into chosen from blurt_private.puzzles p where p.status='active' and p.daily_reserved and not exists(select 1 from blurt_private.daily_puzzles x where x.puzzle_id=p.id) order by random() limit 1;
   if chosen is null then raise exception 'Not enough unique daily pictures';end if;
   insert into blurt_private.daily_puzzles values(d,chosen,to_timestamp(d::double precision*86400),to_timestamp((d::double precision+1)*86400));
  end loop;
 end if;
 insert into blurt_private.content_releases values(p_version,now()) on conflict do nothing;
end $$;

create or replace function public.blurt_daily_puzzle(p_day integer) returns text
language plpgsql security invoker set search_path='' as $$
declare chosen text;
begin
 select puzzle_id into chosen from blurt_private.daily_puzzles where day=p_day;
 if chosen is not null then return chosen;end if;
 select id into chosen from blurt_private.puzzles p where p.status='active' and p.daily_reserved and not exists(select 1 from blurt_private.daily_puzzles x where x.puzzle_id=p.id) order by random() limit 1;
 if chosen is null then raise exception 'No daily pictures scheduled';end if;
 insert into blurt_private.daily_puzzles values(p_day,chosen,to_timestamp(p_day::double precision*86400),to_timestamp((p_day::double precision+1)*86400)) on conflict(day) do nothing;
 select puzzle_id into chosen from blurt_private.daily_puzzles where day=p_day;
 return chosen;
end $$;

-- The scheduler consumes the same pre-dealt match deck as the Edge domain.
create or replace function blurt_private.advance_due_rooms() returns integer
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
   picked=r->'deck'->>((r->>'round')::int);
   if picked is null then
    unused=public.blurt_draw_puzzles(array(select m->>'id' from jsonb_array_elements(r->'members') m where not (m->>'spectator')::boolean),r->>'category',1,'scheduled:'||code||':'||(r->>'matchId')||':'||(r->>'round'));
    picked=unused[1];
   end if;
   starts=reveal+9000;
   r=jsonb_set(r,'{used}',(r->'used')||to_jsonb(picked));
   r=jsonb_set(r,'{round}',to_jsonb((r->>'round')::int+1));
   r=jsonb_set(r,'{roundData}',jsonb_build_object('puzzle',picked,'starts',starts,'ends',starts+(r->>'duration')::bigint*1000,'guesses','[]'::jsonb,'solved','{}'::jsonb));
  end loop;
  update blurt_private.game_documents set payload=jsonb_set(doc.payload,array['rooms',code],r),revision=revision+1,next_at=blurt_private.next_deadline(r) where scope=doc.scope;
  processed=processed+1;
 end loop;return processed;
end $$;
