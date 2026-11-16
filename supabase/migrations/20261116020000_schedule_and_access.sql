-- Pin each day's official puzzle once, independent of content deployments.
create function public.blurt_daily_puzzle(p_day integer) returns text
language plpgsql security invoker set search_path='' as $$
declare chosen text; total integer;
begin
 select puzzle_id into chosen from blurt_private.daily_puzzles where day=p_day;
 if chosen is not null then return chosen;end if;
 select count(*) into total from blurt_private.puzzles where status='active';
 if total=0 then raise exception 'No active puzzles';end if;
 select id into chosen from blurt_private.puzzles where status='active' order by id offset mod(p_day,total) limit 1;
 insert into blurt_private.daily_puzzles values(p_day,chosen,to_timestamp(p_day::double precision*86400),to_timestamp((p_day::double precision+1)*86400)) on conflict(day) do nothing;
 select puzzle_id into chosen from blurt_private.daily_puzzles where day=p_day;
 return chosen;
end $$;
revoke all on function public.blurt_daily_puzzle(integer) from public,anon,authenticated;
grant execute on function public.blurt_daily_puzzle(integer) to service_role;
create index daily_runs_player_day on blurt_private.daily_runs(player_id,day desc);
create index daily_puzzles_puzzle on blurt_private.daily_puzzles(puzzle_id);
create index rooms_host on blurt_private.rooms(host_player_id);
create index rounds_puzzle on blurt_private.rounds(puzzle_id);
create index puzzles_pool on blurt_private.puzzles(category,status);
-- Explicit backend policies document the deny-by-default client access model.
do $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='blurt_private' loop
  execute format('create policy backend_only on blurt_private.%I for all to service_role using(true) with check(true)',t.tablename);
 end loop;
end $$;
revoke all on schema cron from anon,authenticated;
