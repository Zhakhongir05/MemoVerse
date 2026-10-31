-- Review after migrations 004–007. Does not call a generation provider.
begin;
alter table public.generation_requests add column if not exists provider_job_id text;
alter table public.generation_requests add column if not exists world_id text;
alter table public.generation_requests add column if not exists status text not null default 'reserved'
  check (status in ('reserved','submitted','processing','archiving','ready','failed','recovery_required'));
alter table public.generation_requests add column if not exists refunded_at timestamptz;
alter table public.generation_requests add column if not exists updated_at timestamptz not null default now();
create index if not exists generation_memory_lookup on public.generation_requests(user_id,memory_id,created_at desc);
alter table public.generation_requests drop constraint if exists generation_requests_user_id_fingerprint_key;
create unique index if not exists generation_active_fingerprint on public.generation_requests(user_id,fingerprint) where state<>'failed';
grant select on public.generation_requests to authenticated;
drop policy if exists "Read own generation jobs" on public.generation_requests;
create policy "Read own generation jobs" on public.generation_requests for select to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit)
values ('memory-worlds','memory-worlds',false,1073741824)
on conflict(id) do update set public=false;
-- Only the trusted backend uploads/overwrites world assets. Clients can read
-- their own files, but cannot overwrite or delete an archived world.
drop policy if exists "Read own archived worlds" on storage.objects;
create policy "Read own archived worlds" on storage.objects for select to authenticated
  using (bucket_id='memory-worlds' and (storage.foldername(name))[1]=(select auth.uid()::text));

-- Managed worlds are server authoritative. Ordinary offline journal sync must
-- never replace a newer archive/customization with an old cached copy.
create or replace function public.protect_archived_world() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if TG_OP='INSERT' then
      if new.world->>'schemaVersion'='1' then raise exception 'WORLD_SERVER_ONLY'; end if;
    elsif old.world->>'schemaVersion'='1' or new.world->>'schemaVersion'='1' then
      new.world=old.world;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protect_archived_world on public.journal_entries;
create trigger protect_archived_world before insert or update on public.journal_entries
for each row execute function public.protect_archived_world();

create or replace function public.reserve_world_generation(p_user_id uuid,p_google_subject text,p_memory_id uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.generation_accounts; job public.generation_requests; entry public.journal_entries; budget public.generation_budget;
begin
  -- Identity comes from auth.users, not caller-provided claims or metadata.
  if not exists(select 1 from auth.identities where user_id=p_user_id and provider='google' and provider_id=p_google_subject)
    then raise exception 'GOOGLE_ACCOUNT_REQUIRED'; end if;
  insert into public.generation_accounts(user_id,google_subject) values(p_user_id,p_google_subject) on conflict(user_id) do nothing;
  select * into account from public.generation_accounts where user_id=p_user_id for update;
  if account.google_subject<>p_google_subject then raise exception 'GOOGLE_ACCOUNT_MISMATCH'; end if;
  select * into entry from public.journal_entries where id=p_memory_id and user_id=p_user_id and deleted_at is null for update;
  if not found then raise exception 'MEMORY_NOT_FOUND'; end if;
  if entry.world->>'schemaVersion'='1' and entry.world->>'status'='ready' then
    return jsonb_build_object('created',false,'state','succeeded','result',jsonb_build_object('world',entry.world));
  end if;
  select * into job from public.generation_requests where user_id=p_user_id and memory_id=p_memory_id and state='reserved' order by created_at limit 1;
  if not found then select * into job from public.generation_requests where user_id=p_user_id and fingerprint=p_fingerprint and (state<>'failed' or refunded_at is null) order by created_at desc limit 1; end if;
  if job.id is not null then return jsonb_build_object('id',job.id,'created',false,'state',job.state,'status',job.status,'result',job.result); end if;
  if account.credits_used>=account.credits_total then raise exception 'NO_GENERATION_CREDITS'; end if;
  select * into budget from public.generation_budget where id=true for update;
  if not found or budget.requests_used>=budget.max_requests then raise exception 'GENERATION_PAUSED'; end if;
  update public.generation_accounts set credits_used=credits_used+1 where user_id=p_user_id;
  update public.generation_budget set requests_used=requests_used+1 where id=true;
  insert into public.generation_requests(user_id,memory_id,fingerprint) values(p_user_id,p_memory_id,p_fingerprint) returning * into job;
  return jsonb_build_object('id',job.id,'created',true,'state',job.state);
end;
$$;

-- Trusted worker calls this after archiving all assets. URLs are deliberately
-- absent: the manifest contains private bucket/path references only.
create or replace function public.finish_world_generation(p_request_id uuid,p_world jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.generation_requests; asset jsonb; prefix text; saved jsonb;
begin
  select * into job from public.generation_requests where id=p_request_id for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if job.state='succeeded' then return job.result; end if;
  if job.state<>'reserved' then raise exception 'JOB_ALREADY_CLOSED'; end if;
  if p_world->>'id' is null or p_world->>'providerJobId' is null or jsonb_typeof(p_world->'assets') is distinct from 'object'
    or not ((p_world->'assets') ? 'splat') then raise exception 'INVALID_WORLD_MANIFEST'; end if;
  if job.provider_job_id is not null and job.provider_job_id is distinct from p_world->>'providerJobId' then raise exception 'PROVIDER_JOB_MISMATCH'; end if;
  prefix=job.user_id::text||'/'||job.memory_id::text||'/'||job.id::text||'/';
  for asset in select value from jsonb_each(p_world->'assets') union all
    select value from jsonb_array_elements(coalesce(p_world->'guidedTour'->'audioAssets','[]')) loop
    if asset->>'bucket' is distinct from 'memory-worlds' or asset->>'path' is null
      or left(asset->>'path',length(prefix))<>prefix or asset ? 'url' then raise exception 'INVALID_ASSET_REFERENCE'; end if;
    if not exists(select 1 from storage.objects where bucket_id='memory-worlds' and name=asset->>'path') then raise exception 'ASSET_NOT_ARCHIVED'; end if;
  end loop;
  saved=(p_world - 'splatUrl' - 'fullResUrl' - 'colliderUrl') || jsonb_build_object('schemaVersion',1,'status','ready','generationRequestId',job.id,'revision',1);
  update public.journal_entries set world=saved,updated_at=clock_timestamp()
    where id=job.memory_id and user_id=job.user_id and deleted_at is null;
  if not found then raise exception 'MEMORY_NOT_FOUND'; end if;
  update public.generation_requests set state='succeeded',status='ready',world_id=saved->>'id',provider_job_id=saved->>'providerJobId',result=jsonb_build_object('world',saved),updated_at=now() where id=job.id;
  return jsonb_build_object('world',saved);
end;
$$;

-- Refund ONLY when the trusted worker verified that no billable world was
-- created. Timeouts/unknown outcomes stay reserved for reconciliation.
create or replace function public.fail_world_generation(p_request_id uuid,p_confirmed_no_charge boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare job public.generation_requests; owner_id uuid;
begin
  select user_id into owner_id from public.generation_requests where id=p_request_id;
  perform 1 from public.generation_accounts where user_id=owner_id for update;
  select * into job from public.generation_requests where id=p_request_id for update;
  if not found or job.state<>'reserved' then return; end if;
  if p_confirmed_no_charge is true then
    update public.generation_accounts set credits_used=greatest(0,credits_used-1) where user_id=job.user_id;
    update public.generation_budget set requests_used=greatest(0,requests_used-1) where id=true;
    update public.generation_requests set state='failed',status='failed',refunded_at=now(),updated_at=now() where id=job.id;
  else
    update public.generation_requests set status='recovery_required',updated_at=now() where id=job.id;
  end if;
end;
$$;

create or replace function public.save_world_customizations(p_memory_id uuid,p_revision integer,p_enhancements jsonb,p_tour jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry public.journal_entries; asset jsonb;
begin
  select * into entry from public.journal_entries where id=p_memory_id and user_id=(select auth.uid()) and deleted_at is null for update;
  if not found then raise exception 'MEMORY_NOT_FOUND'; end if;
  if entry.world->>'schemaVersion' is distinct from '1' then raise exception 'ARCHIVED_WORLD_REQUIRED'; end if;
  if (entry.world->>'revision')::integer is distinct from p_revision then raise exception 'WORLD_CONFLICT_RELOAD'; end if;
  if jsonb_typeof(p_enhancements->'enhancements') is distinct from 'array' or p_enhancements->>'worldId' is distinct from entry.world->>'id'
    or jsonb_array_length(p_enhancements->'enhancements')>20 or pg_column_size(p_enhancements)>100000 or pg_column_size(p_tour)>1000000
    then raise exception 'INVALID_CUSTOMIZATIONS'; end if;
  if p_tour is not null then
    if jsonb_typeof(p_tour) is distinct from 'object' then raise exception 'INVALID_TOUR'; end if;
    for asset in select value from jsonb_array_elements(coalesce(p_tour->'audioAssets','[]')) loop
      if asset->>'bucket' is distinct from 'memory-worlds' or left(asset->>'path',length(entry.user_id::text||'/'||entry.id::text||'/')) is distinct from entry.user_id::text||'/'||entry.id::text||'/'
        or not exists(select 1 from storage.objects where bucket_id='memory-worlds' and name=asset->>'path') then raise exception 'INVALID_TOUR_ASSET'; end if;
    end loop;
  end if;
  update public.journal_entries set world=world||jsonb_build_object('enhancementResponse',p_enhancements,'guidedTour',p_tour,'revision',p_revision+1),updated_at=clock_timestamp() where id=entry.id returning world into entry.world;
  return entry.world;
end;
$$;
revoke all on function public.finish_world_generation(uuid,jsonb),public.fail_world_generation(uuid,boolean),public.save_world_customizations(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_world_generation(uuid,jsonb),public.fail_world_generation(uuid,boolean) to service_role;
grant execute on function public.save_world_customizations(uuid,integer,jsonb,jsonb) to authenticated;
commit;
