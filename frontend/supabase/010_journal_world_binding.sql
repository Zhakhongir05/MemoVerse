-- REVIEW BEFORE APPLYING. Requires journal migrations and the existing account
-- allowance migration (008 only if its tables/RPCs are not already installed).
begin;
create table public.journal_worlds (
 memory_id uuid primary key references public.journal_entries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null unique references public.world_generation_jobs(id),
 source_photo jsonb not null,
 enhancements jsonb,
 anchors jsonb not null default '[]',
 guided_tour jsonb,
 revision integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.journal_worlds enable row level security;
revoke all on public.journal_worlds from public, anon, authenticated;
grant select on public.journal_worlds to authenticated;
create policy "Read owned memory world" on public.journal_worlds for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.journal_entries e where e.id=memory_id and e.user_id=(select auth.uid()) and e.deleted_at is null)
);
-- Browser writes are deliberately denied. Existing journal_entries.world remains
-- legacy display metadata; authoritative generation state is journal_worlds.
create function public.mv_journal_world(p_user_id uuid,p_memory_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding public.journal_worlds; job public.world_generation_jobs;
begin
 if not exists(select 1 from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null) then
 return jsonb_build_object('error','not_found','message','Memory not found for this account.'); end if;
 if not public.mv_world_rate(p_user_id,'read',120) then return jsonb_build_object('error','rate_limit','message','Please wait before refreshing.'); end if;
 select * into binding from public.journal_worlds where memory_id=p_memory_id and user_id=p_user_id;
 if not found then
 if exists(select 1 from public.journal_entries where id=p_memory_id and world->>'id' is not null and coalesce(world->>'source','') not in ('sample','mock')) then return jsonb_build_object('status','legacy_recovery','memory_id',p_memory_id,'message','An older saved world needs ownership/asset recovery. No replacement generation will be started.'); end if;
 return jsonb_build_object('status','none','memory_id',p_memory_id); end if;
 select * into job from public.world_generation_jobs where id=binding.job_id and user_id=p_user_id;
 return public.mv_world_public_job(job)||jsonb_build_object('memory_id',p_memory_id,'source_photo',binding.source_photo,'enhancements',binding.enhancements,'anchors',binding.anchors,'guided_tour',binding.guided_tour,'revision',binding.revision);
end; $$;
create function public.mv_journal_reserve(p_user_id uuid,p_memory_id uuid,p_photo_index integer,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry public.journal_entries; existing public.journal_worlds; claim jsonb; photo jsonb;
begin
 -- Same lock order as existing account reservation: global budget, then memory.
 perform 1 from public.world_generation_demo where singleton for update;
 select * into entry from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null for update;
 if not found then return jsonb_build_object('error','not_found','message','Memory not found for this account.'); end if;
 select * into existing from public.journal_worlds where memory_id=p_memory_id;
 if found then return jsonb_build_object('fresh',false,'job',public.mv_journal_world(p_user_id,p_memory_id)); end if;
 photo=entry.photos->p_photo_index;
 if p_photo_index<0 or photo is null or photo->>'path' is null or photo->>'path' not like p_user_id::text||'/'||p_memory_id::text||'/%' then
 return jsonb_build_object('error','not_found','message','Save a source photograph to this memory first.'); end if;
 if entry.world->>'id' is not null and coalesce(entry.world->>'source','') not in ('sample','mock') then return jsonb_build_object('error','conflict','message','Recover the existing saved world before requesting any generation.'); end if;
 -- Hash depends on entry identity, not mutable image text: one job per entry.
 claim=public.mv_world_reserve(p_user_id,encode(sha256(convert_to('journal:'||p_memory_id::text,'UTF8')),'hex'),p_job_id);
 if claim ? 'error' then return claim; end if;
 insert into public.journal_worlds(memory_id,user_id,job_id,source_photo) values(p_memory_id,p_user_id,(claim->'job'->>'job_id')::uuid,photo);
 return claim||jsonb_build_object('photo',photo,'story',entry.story);
end; $$;
-- Service-only worker queue. No provider calls happen merely from journal saves.
create function public.mv_journal_world_queue()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('jobs',coalesce(jsonb_agg(jsonb_build_object('job_id',q.id,'user_id',q.user_id)),'[]')) from (
 select j.id,j.user_id from public.world_generation_jobs j join public.journal_worlds w on w.job_id=j.id
 join public.journal_entries e on e.id=w.memory_id and e.user_id=w.user_id
 where j.status in ('pending','submitting') and e.deleted_at is null order by j.created_at limit 20
 ) q;
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('memory-worlds','memory-worlds',false,1073741824,array['application/octet-stream','model/gltf-binary'])
on conflict(id) do nothing;
create policy "Read owned world assets" on storage.objects for select to authenticated using (
 bucket_id='memory-worlds' and (storage.foldername(name))[1]=(select auth.uid()::text)
 and exists(select 1 from public.journal_worlds w join public.journal_entries e on e.id=w.memory_id
 where w.user_id=(select auth.uid()) and w.job_id::text=(storage.foldername(name))[2] and e.deleted_at is null and e.user_id=w.user_id)
);
revoke all on function public.mv_journal_world(uuid,uuid),public.mv_journal_reserve(uuid,uuid,integer,uuid),public.mv_journal_world_queue() from public,anon,authenticated;
grant execute on function public.mv_journal_world(uuid,uuid),public.mv_journal_reserve(uuid,uuid,integer,uuid),public.mv_journal_world_queue() to service_role;
create function public.mv_journal_experience(p_user_id uuid,p_memory_id uuid,p_revision integer,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding public.journal_worlds;
begin
 if octet_length(p_data::text)>100000 then return jsonb_build_object('error','invalid','message','Experience is too large.'); end if;
 if not exists(select 1 from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null) then
 return jsonb_build_object('error','not_found','message','Memory not found for this account.'); end if;
 select * into binding from public.journal_worlds where memory_id=p_memory_id and user_id=p_user_id for update;
 if not found then return jsonb_build_object('error','not_found','message','Memory world not found.'); end if;
 if binding.revision<>p_revision then return jsonb_build_object('error','conflict','message','This memory changed on another device. Reopen before saving.'); end if;
 update public.journal_worlds set enhancements=p_data->'enhancements',anchors=p_data->'anchors',guided_tour=p_data->'guidedTour',revision=revision+1,updated_at=now()
 where memory_id=p_memory_id;
 return jsonb_build_object('revision',binding.revision+1);
end; $$;
revoke all on function public.mv_journal_experience(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.mv_journal_experience(uuid,uuid,integer,jsonb) to service_role;
-- Long-lived worker transfers can outlast the original 55s polling lease.
-- Serialize workers for 15 minutes. Lost leases only repeat reads/transfers,
-- never the paid worlds:generate submission.
create or replace function public.mv_world_poll(p_user_id uuid,p_job_id uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.world_generation_jobs; t timestamptz:=clock_timestamp();
begin
 select * into j from public.world_generation_jobs where id=p_job_id and user_id=p_user_id for update;
 if not found then return jsonb_build_object('error','not_found','message','World not found for this account.'); end if;
 if j.status='submitting' and t-j.created_at>interval '60 seconds' then
 update public.world_generation_jobs set status='unknown',message='Submission needs billing review; no automatic retry.',updated_at=t where id=j.id returning * into j;
 end if;
 if j.status<>'pending' or j.poll_after>t then return jsonb_build_object('poll',false,'job',public.mv_world_public_job(j)); end if;
 update public.world_generation_jobs set poll_lease=p_lease,poll_after=t+interval '15 minutes' where id=j.id returning * into j;
 return jsonb_build_object('poll',true,'job',public.mv_world_public_job(j),'operation_id',j.operation_id);
end; $$;
create function public.mv_world_binding(p_user_id uuid,p_job_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('memory_id',w.memory_id) from public.journal_worlds w where w.user_id=p_user_id and w.job_id=p_job_id),'{}'::jsonb);
$$;
revoke all on function public.mv_world_binding(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mv_world_binding(uuid,uuid) to service_role;
-- Adopt only worlds whose provider ID already matches the owner's server ledger.
-- Unmatched legacy entries remain recovery-only, never silently regenerated.
insert into public.journal_worlds(memory_id,user_id,job_id,source_photo)
select distinct on (j.id) e.id,e.user_id,j.id,e.photos->0
from public.journal_entries e join public.world_generation_jobs j on j.user_id=e.user_id and j.world_id=e.world->>'id'
where e.deleted_at is null and j.status='succeeded' and e.photos->0->>'path' like e.user_id::text||'/'||e.id::text||'/%'
 and coalesce(e.world->>'source','') not in ('sample','mock')
order by j.id,e.created_at on conflict do nothing;
-- Re-archive the same generated output; this consumes no new allowance/job.
update public.world_generation_jobs j set status='pending',poll_after=null,message='Archiving your existing world to private storage.'
where exists(select 1 from public.journal_worlds w where w.job_id=j.id) and j.assets->'storagePaths' is null and j.status='succeeded';
commit;
