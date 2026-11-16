-- BLURT keeps its small-room state under one row lock. Private relational
-- projections provide uniqueness, foreign keys, indexes and an audit history.
-- No application data is exposed through PostgREST or Realtime.
create schema if not exists blurt_private;
revoke all on schema blurt_private from public;
create table blurt_private.game_state (
 id integer primary key check (id=1), payload jsonb not null,
 updated_at timestamptz not null default now()
);
insert into blurt_private.game_state(id,payload) values(1,'{"players":{},"daily":{},"rooms":{}}');
create table blurt_private.players(id text primary key, display_name text not null, created_at timestamptz not null);
create table blurt_private.puzzles(id text primary key, canonical_answer text not null, category text not null, version int not null default 1, status text not null default 'active');
create table blurt_private.puzzle_answers(puzzle_id text references blurt_private.puzzles on delete cascade, normalized_answer text not null, primary key(puzzle_id,normalized_answer));
create table blurt_private.puzzle_assets(puzzle_id text references blurt_private.puzzles on delete cascade, stage_number int check(stage_number between 1 and 6), private_storage_key text not null unique, primary key(puzzle_id,stage_number));
create table blurt_private.daily_puzzles(day int primary key, puzzle_id text not null references blurt_private.puzzles, starts_at timestamptz not null, ends_at timestamptz not null);
create table blurt_private.daily_runs(id text primary key, day int not null references blurt_private.daily_puzzles, player_id text not null references blurt_private.players, status text not null, solved_stage int, unique(day,player_id));
create table blurt_private.daily_guesses(run_id text references blurt_private.daily_runs, stage_number int check(stage_number between 1 and 5), submitted_text text not null, correct boolean not null, idempotency_key text, primary key(run_id,stage_number), unique(run_id,idempotency_key));
create table blurt_private.rooms(code text primary key, host_player_id text not null references blurt_private.players, status text not null, settings jsonb not null, created_at timestamptz not null, expires_at timestamptz not null);
create index rooms_expiry on blurt_private.rooms(expires_at);
create table blurt_private.room_members(room_code text references blurt_private.rooms, player_id text references blurt_private.players, ready boolean not null, spectator boolean not null, points int not null check(points>=0), joined_at timestamptz not null, last_seen_at timestamptz not null, primary key(room_code,player_id));
create index members_player on blurt_private.room_members(player_id);
create table blurt_private.rounds(id text primary key, room_code text not null references blurt_private.rooms, puzzle_id text not null references blurt_private.puzzles, position int not null, starts_at timestamptz not null, ends_at timestamptz not null, reveal_at timestamptz);
create index rounds_room on blurt_private.rounds(room_code,starts_at);
create table blurt_private.party_guesses(round_id text references blurt_private.rounds, player_id text references blurt_private.players, stage_number int check(stage_number between 1 and 5), submitted_text text not null, correct boolean not null, idempotency_key text, primary key(round_id,player_id,stage_number), unique(round_id,player_id,idempotency_key));
create index party_guesses_player on blurt_private.party_guesses(player_id);

-- Atomically materialize the authoritative snapshot. Constraints fail the entire
-- transaction rather than permitting duplicate accepted guesses or scores.
create function blurt_private.project_state() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb; r jsonb; g jsonb; m jsonb; d jsonb; k text; runkey text; rid text;
begin
 for p in select value from jsonb_each(new.payload->'players') loop
  insert into blurt_private.players values(p->>'id',p->>'name',to_timestamp((p->>'created')::double precision/1000)) on conflict(id) do update set display_name=excluded.display_name;
 end loop;
 for k,r in select key,value from jsonb_each(new.payload->'daily') loop
  insert into blurt_private.daily_puzzles values((r->>'day')::int,r->>'puzzle',to_timestamp((r->>'day')::double precision*86400),to_timestamp(((r->>'day')::double precision+1)*86400)) on conflict do nothing;
  runkey=k;
  insert into blurt_private.daily_runs values(runkey,(r->>'day')::int,split_part(k,':',1),case when (r->>'done')::boolean then 'finished' else 'active' end,case when (r->>'solved')::boolean then jsonb_array_length(r->'guesses') else null end) on conflict(id) do update set status=excluded.status,solved_stage=excluded.solved_stage;
  for g in select value from jsonb_array_elements(r->'guesses') loop
   insert into blurt_private.daily_guesses values(runkey,(g->>'stage')::int,g->>'text',(g->>'correct')::boolean,g->>'key') on conflict(run_id,stage_number) do nothing;
  end loop;
 end loop;
 for r in select value from jsonb_each(new.payload->'rooms') loop
  insert into blurt_private.rooms values(r->>'code',r->>'host',r->>'status',jsonb_build_object('rounds',r->'rounds','duration',r->'duration','category',r->'category'),to_timestamp((r->>'created')::double precision/1000),to_timestamp((r->>'expires')::double precision/1000)) on conflict(code) do update set host_player_id=excluded.host_player_id,status=excluded.status,settings=excluded.settings;
  delete from blurt_private.room_members where room_code=r->>'code';
  for m in select value from jsonb_array_elements(r->'members') loop
   insert into blurt_private.room_members values(r->>'code',m->>'id',(m->>'ready')::boolean,(m->>'spectator')::boolean,(m->>'points')::int,to_timestamp((m->>'joined')::double precision/1000),to_timestamp((m->>'seen')::double precision/1000));
  end loop;
  d=r->'roundData';
  if d is not null and d<>'null'::jsonb then
   rid=(r->>'code')||':'||(d->>'starts');
   insert into blurt_private.rounds values(rid,r->>'code',d->>'puzzle',(r->>'round')::int,to_timestamp((d->>'starts')::double precision/1000),to_timestamp((d->>'ends')::double precision/1000),to_timestamp((d->>'revealAt')::double precision/1000)) on conflict(id) do update set reveal_at=excluded.reveal_at;
   for g in select value from jsonb_array_elements(d->'guesses') loop
    insert into blurt_private.party_guesses values(rid,g->>'player',(g->>'stage')::int,g->>'text',(g->>'correct')::boolean,g->>'key') on conflict(round_id,player_id,stage_number) do nothing;
   end loop;
  end if;
 end loop;
 new.updated_at=now();return new;
end $$;
create trigger project_state before update on blurt_private.game_state for each row execute function blurt_private.project_state();
revoke all on function blurt_private.project_state() from public;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='blurt_private' loop
  execute format('alter table blurt_private.%I enable row level security',t.tablename);
 end loop;
end $$;
revoke all on all tables in schema blurt_private from public;
