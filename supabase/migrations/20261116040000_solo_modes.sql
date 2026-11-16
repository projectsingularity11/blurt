-- Solo games use separate actor-bound documents and retain normalized run history.
create table blurt_private.solo_sessions (
 id uuid primary key, player_id text not null references blurt_private.players(id),
 mode text not null check(mode in ('FREE','FLASH')), started_at timestamptz not null,
 ends_at timestamptz, finished boolean not null, score integer not null check(score>=0),
 solved integer not null check(solved>=0), best integer not null check(best>=0)
);
create index solo_sessions_player on blurt_private.solo_sessions(player_id,started_at desc);
create table blurt_private.solo_rounds (
 session_id uuid references blurt_private.solo_sessions(id) on delete cascade,
 position integer not null, puzzle_id text not null, done boolean not null,
 solved boolean not null, points integer not null check(points between 0 and 1500),
 primary key(session_id,position)
);
create table blurt_private.solo_guesses (
 session_id uuid not null, position integer not null, stage integer not null check(stage between 1 and 5),
 text text not null, correct boolean not null,
 primary key(session_id,position,stage),
 foreign key(session_id,position) references blurt_private.solo_rounds(session_id,position) on delete cascade
);
alter table blurt_private.solo_sessions enable row level security;
alter table blurt_private.solo_rounds enable row level security;
alter table blurt_private.solo_guesses enable row level security;
revoke all on blurt_private.solo_sessions, blurt_private.solo_rounds, blurt_private.solo_guesses from public,anon,authenticated;
grant all on blurt_private.solo_sessions, blurt_private.solo_rounds, blurt_private.solo_guesses to service_role;
create function blurt_private.solo_deadline() returns trigger language plpgsql set search_path='' as $$
declare r jsonb;
begin
 if new.scope like 'solo:%' then
  r=new.payload->'solo'->(split_part(new.scope,':',2)||':'||split_part(new.scope,':',3));
  new.next_at=case when r->>'mode'='FLASH' and not (r->>'finished')::boolean then to_timestamp((r->>'ends')::double precision/1000) else null end;
 end if;
 return new;
end $$;
create trigger solo_deadline before insert or update on blurt_private.game_documents for each row execute function blurt_private.solo_deadline();
create function blurt_private.project_solo() returns trigger language plpgsql set search_path='' as $$
declare r jsonb; c jsonb; g jsonb; pid text;
begin
 if new.scope not like 'solo:%' then return null;end if;
 pid=split_part(new.scope,':',2);
 r=new.payload->'solo'->(pid||':'||split_part(new.scope,':',3));
 if r is null then return null;end if;
 c=r->'current';
 insert into blurt_private.solo_sessions values((r->>'id')::uuid,pid,r->>'mode',to_timestamp((r->>'started')::double precision/1000),to_timestamp((r->>'ends')::double precision/1000),(r->>'finished')::boolean,(r->>'score')::int,(r->>'solved')::int,(r->>'best')::int)
 on conflict(id) do update set finished=excluded.finished,score=excluded.score,solved=excluded.solved,best=excluded.best;
 insert into blurt_private.solo_rounds values((r->>'id')::uuid,(r->>'position')::int,c->>'puzzle',(c->>'done')::boolean,(c->>'solved')::boolean,(c->>'points')::int)
 on conflict(session_id,position) do update set done=excluded.done,solved=excluded.solved,points=excluded.points;
 for g in select value from jsonb_array_elements(c->'guesses') loop
  insert into blurt_private.solo_guesses values((r->>'id')::uuid,(r->>'position')::int,(g->>'stage')::int,g->>'text',(g->>'correct')::boolean) on conflict do nothing;
 end loop;
 return null;
end $$;
create trigger solo_project after insert or update on blurt_private.game_documents for each row execute function blurt_private.project_solo();
create function blurt_private.advance_due_solos() returns void language plpgsql security definer set search_path='' as $$
declare doc record; k text; r jsonb;
begin
 for doc in select * from blurt_private.game_documents where scope like 'solo:%' and next_at<=clock_timestamp() order by next_at limit 100 for update skip locked loop
  k=split_part(doc.scope,':',2)||':'||split_part(doc.scope,':',3);r=doc.payload->'solo'->k;
  r=jsonb_set(r,'{finished}','true'::jsonb);
  update blurt_private.game_documents set payload=jsonb_set(doc.payload,array['solo',k],r),revision=revision+1,next_at=null where scope=doc.scope;
 end loop;
end $$;
revoke all on function blurt_private.solo_deadline(),blurt_private.project_solo(),blurt_private.advance_due_solos() from public,anon,authenticated;
grant execute on function blurt_private.solo_deadline(),blurt_private.project_solo(),blurt_private.advance_due_solos() to service_role;
select cron.schedule('blurt-solo-timeouts','1 second','select blurt_private.advance_due_solos()');
