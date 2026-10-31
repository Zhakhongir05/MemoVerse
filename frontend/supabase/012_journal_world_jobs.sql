-- Apply after 008 and 009 in the existing Supabase project. Additive: no auth,
-- journal, allowance or credit resets. Generation remains disabled as configured.
begin;
alter table public.world_generation_demo drop constraint if exists world_generation_demo_model_check;
alter table public.world_generation_demo drop constraint if exists world_generation_demo_credits_per_job_check;
alter table public.world_generation_demo add constraint world_generation_demo_model_cost_check check (
  (model='marble-1.0-draft' and credits_per_job>=230) or
  (model in ('marble-1.0','marble-1.1') and credits_per_job>=1580)
);
alter table public.world_generation_jobs drop constraint if exists world_generation_jobs_reserved_credits_check;
alter table public.world_generation_jobs add constraint world_generation_jobs_model_cost_check check (
  (model='marble-1.0-draft' and reserved_credits>=230) or
  (model in ('marble-1.0','marble-1.1') and reserved_credits>=1580)
);
alter table public.world_generation_jobs add column journal_entry_id uuid references public.journal_entries(id) on delete set null;
create unique index world_job_journal_entry on public.world_generation_jobs(journal_entry_id) where journal_entry_id is not null;

create function public.mv_world_memory(p_user_id uuid,p_memory_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.journal_entries; j public.world_generation_jobs;
begin
 if not public.mv_world_rate(p_user_id,'read',120) then return jsonb_build_object('error','rate_limit','message','Please wait before refreshing again.'); end if;
 select * into m from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null;
 if not found then return jsonb_build_object('error','not_found','message','Memory not found for this account. Sync it before generating.'); end if;
 select * into j from public.world_generation_jobs where journal_entry_id=m.id and user_id=p_user_id;
 return jsonb_build_object('memory_id',m.id,'story',m.story,'photos',m.photos,'world',m.world,
   'job',case when j.id is null then null else public.mv_world_public_job(j) end);
end;
$$;

create function public.mv_world_reserve_memory(p_user_id uuid,p_memory_id uuid,p_photo_path text,p_story text,p_submission text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.journal_entries; j public.world_generation_jobs; reservation jsonb;
begin
 -- Match the global reservation lock order; serialize concurrent Relive clicks.
 perform 1 from public.world_generation_demo where singleton for update;
 select * into m from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null for update;
 if not found then return jsonb_build_object('error','not_found','message','Memory not found for this account.'); end if;
 select * into j from public.world_generation_jobs where journal_entry_id=m.id and user_id=p_user_id;
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

-- Keep the existing paid-job transition rules. Add the journal update to the
-- SAME transaction, so closing a browser cannot orphan a completed world.
alter function public.mv_world_finish(uuid,uuid,uuid,jsonb) rename to mv_world_finish_unlinked;
create function public.mv_world_finish(p_user_id uuid,p_job_id uuid,p_lease uuid,p_update jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; j public.world_generation_jobs;
begin
 result:=public.mv_world_finish_unlinked(p_user_id,p_job_id,p_lease,p_update);
 if result ? 'error' then return result; end if;
 select * into j from public.world_generation_jobs where id=p_job_id and user_id=p_user_id;
 if j.status='succeeded' and j.journal_entry_id is not null then
   update public.world_generation_jobs set assets=assets||jsonb_build_object('source','worldlabs','jobId',id,'journalEntryId',journal_entry_id)
     where id=j.id returning * into j;
   update public.journal_entries set world=j.assets,updated_at=clock_timestamp()
     where id=j.journal_entry_id and user_id=p_user_id and deleted_at is null;
   result:=public.mv_world_public_job(j);
 end if;
 return result;
end;
$$;

-- An old tab syncing an entry with world=null must not erase its paid result.
-- Same-world metadata edits (anchors/tours) and normal journal edits still work.
create function public.mv_preserve_journal_world()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is null and old.world->>'source'='worldlabs'
   and new.world->>'id' is distinct from old.world->>'id'
   and exists(select 1 from public.world_generation_jobs j where j.journal_entry_id=old.id and j.user_id=old.user_id and j.status='succeeded' and j.world_id=old.world->>'id') then
   new.world:=old.world;
 end if;
 return new;
end;
$$;
create trigger preserve_paid_journal_world before update on public.journal_entries for each row execute function public.mv_preserve_journal_world();
revoke all on function public.mv_world_memory(uuid,uuid),public.mv_world_reserve_memory(uuid,uuid,text,text,text,uuid),public.mv_world_finish(uuid,uuid,uuid,jsonb),public.mv_world_finish_unlinked(uuid,uuid,uuid,jsonb),public.mv_preserve_journal_world() from public,anon,authenticated,service_role;
grant execute on function public.mv_world_memory(uuid,uuid),public.mv_world_reserve_memory(uuid,uuid,text,text,text,uuid),public.mv_world_finish(uuid,uuid,uuid,jsonb) to service_role;
commit;
