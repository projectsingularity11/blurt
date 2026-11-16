-- A BEFORE INSERT trigger runs even for INSERT ... ON CONFLICT DO NOTHING.
-- Guard the missing-row case before firing projections, so a losing first-write
-- cannot change normalized results or membership. Locks are per document.
create or replace function public.blurt_commit_document(p_scope text,p_revision bigint,p_payload jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; r jsonb; deadline timestamptz;
begin
 if octet_length(p_payload::text)>262144 then raise exception 'Document too large';end if;
 perform pg_advisory_xact_lock(hashtextextended('blurt:'||p_scope,0));
 if p_revision=0 and exists(select 1 from blurt_private.game_documents where scope=p_scope) then return false;end if;
 r=p_payload->'rooms'->split_part(p_scope,':',2);
 if p_scope like 'room:%' and r is not null then deadline=blurt_private.next_deadline(r);end if;
 if p_revision=0 then
  insert into blurt_private.game_documents(scope,payload,next_at) values(p_scope,p_payload,deadline);
 else
  update blurt_private.game_documents set payload=p_payload,revision=revision+1,next_at=deadline where scope=p_scope and revision=p_revision;
 end if;
 get diagnostics n=row_count;return n=1;
end $$;
-- Keep high-frequency scheduler diagnostics bounded without deleting game data.
select cron.schedule('blurt-job-history-cleanup','23 * * * *','delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname like ''blurt-%'') and end_time<now()-interval ''2 days''');
