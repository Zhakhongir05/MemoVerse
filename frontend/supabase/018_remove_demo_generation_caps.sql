-- Production generation: remove demo-only budget, calendar and global queue caps.
-- Preserve every job, paid result, reservation, account allowance and provider key.
-- Authentication, per-account three-world allowance, duplicate protection,
-- submission throttling, model pricing and the enabled kill switch remain.
begin;
do $budget_constraint$
declare definition text;
begin
 select pg_get_constraintdef(oid) into definition from pg_constraint
 where conrelid='public.world_generation_demo'::regclass and conname='world_generation_demo_check';
 if definition is not null then
   if regexp_replace(definition,'[()[:space:]]','','g') <> 'CHECKreserved_credits>=0ANDreserved_credits<=credit_budget' then
     raise exception 'Unexpected budget constraint; nothing changed';
   end if;
   alter table public.world_generation_demo drop constraint world_generation_demo_check;
 end if;
end;
$budget_constraint$;
alter table public.world_generation_demo
  drop constraint if exists world_generation_demo_reserved_credits_check;
alter table public.world_generation_demo
  add constraint world_generation_demo_reserved_credits_check check (reserved_credits >= 0);

create or replace function public.mv_world_reserve(p_user_id uuid,p_submission text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.world_generation_demo; j public.world_generation_jobs; n integer;
begin
 -- One transaction serializes all decisions affecting paid credits and account slots.
 select * into d from public.world_generation_demo where singleton for update;
 if not found then return jsonb_build_object('error','unconfigured','message','Generation is not configured.'); end if;
 if not public.mv_world_rate(p_user_id,'submit',10) then return jsonb_build_object('error','rate_limit','message','Please wait a moment before submitting again.'); end if;
 select * into j from public.world_generation_jobs where user_id=p_user_id and submission_hash=p_submission and not allowance_released;
 if found then return jsonb_build_object('fresh',false,'job',public.mv_world_public_job(j),'model',j.model); end if;
 if not d.enabled then
   return jsonb_build_object('error','disabled','message','New world generation is currently unavailable. Explore a saved world instead.');
 end if;
 select count(*) into n from public.world_generation_jobs where user_id=p_user_id and not allowance_released;
 if n >= 3 then return jsonb_build_object('error','allowance_used','message','You have used your 3 free worlds. You can revisit them any time.'); end if;
 insert into public.world_generation_jobs(id,user_id,submission_hash,status,model,reserved_credits,message)
 values(p_job_id,p_user_id,p_submission,'submitting',d.model,d.credits_per_job,'Submitting your photograph…') returning * into j;
 update public.world_generation_demo set reserved_credits=reserved_credits+d.credits_per_job where singleton;
 return jsonb_build_object('fresh',true,'job',public.mv_world_public_job(j),'model',j.model);
end;
$$;

create or replace function public.mv_world_config()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'expires_at',null,'limit',3)
 from public.world_generation_demo where singleton;
$$;
comment on column public.world_generation_demo.credit_budget is 'Legacy demo ceiling; production reservations use provider credits and account allowance.';
comment on column public.world_generation_demo.max_new_per_day is 'Legacy demo setting; not enforced by production reservations.';
comment on column public.world_generation_demo.max_new_per_hour is 'Legacy demo setting; not enforced by production reservations.';
comment on column public.world_generation_demo.max_in_flight is 'Legacy demo setting; not enforced by production reservations.';
-- Keep execution server-only; do not expose reservation RPCs to browser roles.
revoke all on function public.mv_world_reserve(uuid,text,uuid), public.mv_world_config()
 from public,anon,authenticated;
grant execute on function public.mv_world_reserve(uuid,text,uuid), public.mv_world_config()
 to service_role;
commit;
