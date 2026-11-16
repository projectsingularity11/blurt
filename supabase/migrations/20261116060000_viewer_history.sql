-- A late spectator must also have a fresh deck, and viewing reserves it for that guest.
create function public.blurt_register_viewer(p_player uuid,p_pictures text[],p_deal text,p_match_deal text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if cardinality(p_pictures)>7 or length(p_deal)>200 then raise exception 'Invalid viewer deal';end if;
 perform pg_advisory_xact_lock(281975443);
 if exists(select 1 from blurt_private.seen_puzzles where player_id=p_player and puzzle_id=any(p_pictures) and first_deal<>p_deal and first_deal<>p_match_deal) then
  raise exception 'You have already seen a picture in this match';
 end if;
 insert into blurt_private.seen_puzzles(player_id,puzzle_id,first_deal)
 select p_player,x,p_deal from unnest(p_pictures) x on conflict do nothing;
end $$;
revoke all on function public.blurt_register_viewer(uuid,text[],text,text) from public,anon,authenticated;
grant execute on function public.blurt_register_viewer(uuid,text[],text,text) to service_role;
