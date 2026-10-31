-- Retire the independent legacy credit reservation path without resetting usage.
-- Apply after 007_generation_credits and 008_world_generation_allowance in the
-- EXISTING project. Historical completed worlds remain available in the journal.
begin;
do $$
declare a record; i integer; inserted integer; imported integer:=0; usage integer;
begin
 if to_regclass('public.generation_accounts') is not null then
  for a in select user_id,credits_used from public.generation_accounts loop
   usage:=a.credits_used;
   if to_regclass('public.generation_requests') is not null then
    select greatest(usage,count(*)::integer) into usage from public.generation_requests where user_id=a.user_id;
   end if;
   if usage>0 then
    for i in 1..usage loop
     insert into public.world_generation_jobs(id,user_id,submission_hash,status,model,reserved_credits,message)
     values(gen_random_uuid(),a.user_id,md5('legacy-credit:'||a.user_id::text||':'||i)||md5('legacy-reservation:'||a.user_id::text||':'||i),
       'unknown','marble-1.1',1580,'Historical generation reservation retained for owner review. Open completed worlds from your journal.')
     on conflict(user_id,submission_hash) do nothing;
     get diagnostics inserted=row_count;imported:=imported+inserted;
    end loop;
   end if;
  end loop;
 end if;
 if imported>0 then
  -- Account for held historical spend, without creating new budget headroom.
  -- Leave generation disabled until the owner reconciles legacy provider jobs.
  update public.world_generation_demo set enabled=false,
   credit_budget=greatest(credit_budget,reserved_credits+imported*1580),
   reserved_credits=reserved_credits+imported*1580 where singleton;
 end if;
 if to_regprocedure('public.reserve_world_generation(uuid,text,uuid,text)') is not null then
  execute 'revoke all on function public.reserve_world_generation(uuid,text,uuid,text) from public,anon,authenticated,service_role';
 end if;
 if to_regprocedure('public.grant_paid_generation_pack(uuid,text,integer,text)') is not null then
  execute 'revoke all on function public.grant_paid_generation_pack(uuid,text,integer,text) from public,anon,authenticated,service_role';
 end if;
end;
$$;
commit;
