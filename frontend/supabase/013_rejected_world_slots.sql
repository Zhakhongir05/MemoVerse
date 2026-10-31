-- Focused correction for confirmed pre-generation rejections. Apply after 012.
-- Preserve every job and every uncertain reservation; no account or credit reset.
begin;
alter table public.world_generation_jobs add column allowance_released boolean not null default false;
alter table public.world_generation_jobs add column provider_diagnostics jsonb;
alter table public.world_generation_jobs drop constraint world_generation_jobs_user_id_submission_hash_key;
create unique index world_active_submission on public.world_generation_jobs(user_id,submission_hash) where not allowance_released;
drop index public.world_job_journal_entry;
create unique index world_job_journal_entry on public.world_generation_jobs(journal_entry_id) where journal_entry_id is not null and not allowance_released;
create or replace function public.mv_world_public_job(j public.world_generation_jobs)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('job_id',j.id,'status',j.status,'world',j.assets,'message',j.message,
 'allowance_released',j.allowance_released,'expires_at',j.provider_expires_at,'created',j.created_at,'updated',j.updated_at);
$$;
create or replace function public.mv_world_reserve(p_user_id uuid,p_submission text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.world_generation_demo; j public.world_generation_jobs; n integer; v_now timestamptz := clock_timestamp();
begin
 -- One transaction serializes all decisions affecting paid credits and account slots.
 select * into d from public.world_generation_demo where singleton for update;
 if not found then return jsonb_build_object('error','unconfigured','message','Generation is not configured.'); end if;
 if not public.mv_world_rate(p_user_id,'submit',10) then return jsonb_build_object('error','rate_limit','message','Please wait a moment before submitting again.'); end if;
 select * into j from public.world_generation_jobs where user_id=p_user_id and submission_hash=p_submission and not allowance_released;
 if found then return jsonb_build_object('fresh',false,'job',public.mv_world_public_job(j),'model',j.model); end if;
 if not d.enabled or d.starts_at is null or v_now < d.starts_at then
   return jsonb_build_object('error','disabled','message','New world generation is currently unavailable. Explore a saved world instead.');
 end if;
 if v_now >= d.expires_at then return jsonb_build_object('error','ended','message','The judging period has ended. Your existing worlds are still available.'); end if;
 select count(*) into n from public.world_generation_jobs where user_id=p_user_id and not allowance_released;
 if n >= 3 then return jsonb_build_object('error','allowance_used','message','You have used your 3 free worlds. You can revisit them any time.'); end if;
 if d.reserved_credits + d.credits_per_job > d.credit_budget then
   return jsonb_build_object('error','budget','message','The demo generation budget has been reached. Your existing worlds are still available.');
 end if;
 select count(*) into n from public.world_generation_jobs where created_at >= date_trunc('hour',v_now);
 if n >= d.max_new_per_hour then return jsonb_build_object('error','busy','message','The demo is busy. Please try again later.'); end if;
 select count(*) into n from public.world_generation_jobs where created_at >= date_trunc('day',v_now);
 if n >= d.max_new_per_day then return jsonb_build_object('error','busy','message','Today’s demo generation limit has been reached. Please return later.'); end if;
 select count(*) into n from public.world_generation_jobs where status in ('submitting','pending','unknown');
 if n >= d.max_in_flight then
  if exists(select 1 from public.world_generation_jobs where status='unknown') then
   return jsonb_build_object('error','review_required','message','Generation is blocked by earlier submissions awaiting owner review. No new World Labs request was sent; your allowance is unchanged.');
  end if;
  return jsonb_build_object('error','in_flight_limit','message','All global generation slots are processing existing worlds. Resume a pending world or try after one finishes. Your allowance is unchanged.');
 end if;
 insert into public.world_generation_jobs(id,user_id,submission_hash,status,model,reserved_credits,message)
 values(p_job_id,p_user_id,p_submission,'submitting',d.model,d.credits_per_job,'Submitting your photograph…') returning * into j;
 update public.world_generation_demo set reserved_credits=reserved_credits+d.credits_per_job where singleton;
 return jsonb_build_object('fresh',true,'job',public.mv_world_public_job(j),'model',j.model);
end;
$$;

create or replace function public.mv_world_account(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare used integer; jobs jsonb;
begin
 if not public.mv_world_rate(p_user_id,'read',120) then return jsonb_build_object('error','rate_limit','message','Please wait a moment before refreshing again.'); end if;
 select count(*) filter(where not j.allowance_released),coalesce(jsonb_agg(public.mv_world_public_job(j) order by created_at desc),'[]'::jsonb)
 into used,jobs from public.world_generation_jobs j where user_id=p_user_id;
 return jsonb_build_object('limit',3,'used',used,'remaining',greatest(0,3-used),'jobs',jobs);
end;
$$;

create or replace function public.mv_world_memory(p_user_id uuid,p_memory_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.journal_entries; j public.world_generation_jobs;
begin
 if not public.mv_world_rate(p_user_id,'read',120) then return jsonb_build_object('error','rate_limit','message','Please wait before refreshing again.'); end if;
 select * into m from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null;
 if not found then return jsonb_build_object('error','not_found','message','Memory not found for this account. Sync it before generating.'); end if;
 select * into j from public.world_generation_jobs where journal_entry_id=m.id and user_id=p_user_id and not allowance_released;
 return jsonb_build_object('memory_id',m.id,'story',m.story,'photos',m.photos,'world',m.world,
   'job',case when j.id is null then null else public.mv_world_public_job(j) end);
end;
$$;

create or replace function public.mv_world_reserve_memory(p_user_id uuid,p_memory_id uuid,p_photo_path text,p_story text,p_submission text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.journal_entries; j public.world_generation_jobs; reservation jsonb;
begin
 -- Match the global reservation lock order; serialize concurrent Relive clicks.
 perform 1 from public.world_generation_demo where singleton for update;
 select * into m from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null for update;
 if not found then return jsonb_build_object('error','not_found','message','Memory not found for this account.'); end if;
 select * into j from public.world_generation_jobs where journal_entry_id=m.id and user_id=p_user_id and not allowance_released;
 if found then return jsonb_build_object('fresh',false,'model',j.model,'job',public.mv_world_public_job(j)); end if;
 if m.story is distinct from p_story or not exists(select 1 from jsonb_array_elements(m.photos) photo where photo->>'path'=p_photo_path)
   or p_photo_path not like p_user_id::text||'/'||m.id::text||'/%' then
   return jsonb_build_object('error','memory_changed','message','This memory changed. Refresh it before generating.');
 end if;
 reservation:=public.mv_world_reserve(p_user_id,p_submission,p_job_id);
 if reservation ? 'error' then return reservation; end if;
 if (reservation->>'fresh')::boolean then
   update public.world_generation_jobs set journal_entry_id=m.id where id=p_job_id and user_id=p_user_id;
 else
   -- Never attach an unrelated Studio/submission job to this journal entry.
   return jsonb_build_object('error','memory_changed','message','Submission identity conflict. Refresh this memory.');
 end if;
 return reservation;
end;
$$;


alter function public.mv_world_finish(uuid,uuid,uuid,jsonb) rename to mv_world_finish_before_rejection;
create function public.mv_world_finish(p_user_id uuid,p_job_id uuid,p_lease uuid,p_update jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.world_generation_jobs;
begin
 -- Same lock order as reservation: refund once, with no budget race.
 perform 1 from public.world_generation_demo where singleton for update;
 select * into j from public.world_generation_jobs where id=p_job_id and user_id=p_user_id for update;
 if not found then return jsonb_build_object('error','not_found'); end if;
 if p_lease is null and p_update->>'status'='failed' and (p_update->>'rejected')::boolean is true
   and j.status in ('submitting','unknown') and j.operation_id is null and j.world_id is null and not j.allowance_released then
  update public.world_generation_jobs set status='failed',allowance_released=true,
   provider_diagnostics=p_update->'diagnostics',
   message='World Labs rejected the submission before creating a job. Your allowance has been restored.',
   updated_at=clock_timestamp() where id=j.id returning * into j;
  update public.world_generation_demo set reserved_credits=reserved_credits-j.reserved_credits where singleton;
  return public.mv_world_public_job(j);
 end if;
 return public.mv_world_finish_before_rejection(p_user_id,p_job_id,p_lease,p_update);
end;
$$;
revoke all on function public.mv_world_finish_before_rejection(uuid,uuid,uuid,jsonb),public.mv_world_finish(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mv_world_finish(uuid,uuid,uuid,jsonb) to service_role;
commit;
