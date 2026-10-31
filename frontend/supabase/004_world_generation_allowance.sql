-- Additive migration in the EXISTING Supabase project. Does not alter memories,
-- auth users, Google OAuth, Storage buckets, or existing policies.
-- New RPCs are backend/service-role only. Never grant them to browser roles.
begin;
create table public.world_generation_demo (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  credit_budget integer not null default 0 check(credit_budget >= 0),
  reserved_credits integer not null default 0 check(reserved_credits >= 0 and reserved_credits <= credit_budget),
  model text not null default 'marble-1.1' check(model = 'marble-1.1'),
  credits_per_job integer not null default 1580 check(credits_per_job >= 1580),
  max_new_per_hour integer not null default 5 check(max_new_per_hour > 0),
  max_new_per_day integer not null default 10 check(max_new_per_day > 0),
  max_in_flight integer not null default 2 check(max_in_flight > 0),
  check((starts_at is null and expires_at is null) or
    (starts_at is not null and expires_at is not null and expires_at > starts_at and expires_at <= starts_at + interval '30 days'))
);
insert into public.world_generation_demo(singleton) values(true);

create table public.world_generation_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_hash text not null check(submission_hash ~ '^[a-f0-9]{64}$'),
  status text not null check(status in ('submitting','pending','succeeded','failed','expired','unknown')),
  model text not null,
  reserved_credits integer not null check(reserved_credits >= 1580),
  operation_id text,
  world_id text,
  assets jsonb,
  message text not null,
  provider_expires_at timestamptz,
  poll_after timestamptz,
  poll_lease uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, submission_hash),
  check(status <> 'pending' or operation_id is not null),
  check(status <> 'succeeded' or (world_id is not null and assets is not null))
);
create index world_jobs_owner_created on public.world_generation_jobs(user_id,created_at);
create index world_jobs_created_status on public.world_generation_jobs(created_at,status);
create table public.world_generation_rate_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('submit','read')),
  window_start timestamptz not null,
  hits integer not null check(hits > 0),
  primary key(user_id,kind,window_start)
);
alter table public.world_generation_demo enable row level security;
alter table public.world_generation_jobs enable row level security;
alter table public.world_generation_rate_windows enable row level security;
revoke all on public.world_generation_demo,public.world_generation_jobs,public.world_generation_rate_windows from public,anon,authenticated;
-- All updates happen through service-role-only functions; no browser writes.

create function public.mv_world_public_job(j public.world_generation_jobs)
returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object('job_id',j.id,'status',j.status,'world',j.assets,'message',j.message,
 'expires_at',j.provider_expires_at,'created',j.created_at,'updated',j.updated_at);
$$;

create function public.mv_world_rate(p_user_id uuid,p_kind text,p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; bucket timestamptz := date_trunc('minute',clock_timestamp());
begin
 delete from public.world_generation_rate_windows where user_id=p_user_id and window_start < bucket - interval '1 day';
 insert into public.world_generation_rate_windows(user_id,kind,window_start,hits)
 values(p_user_id,p_kind,bucket,1)
 on conflict(user_id,kind,window_start) do update set hits=world_generation_rate_windows.hits+1
 returning hits into n;
 return n <= p_limit;
end;
$$;

create function public.mv_world_config()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('enabled',enabled and starts_at is not null and now()>=starts_at and now()<expires_at,
   'expires_at',expires_at,'limit',3) from public.world_generation_demo where singleton;
$$;

create function public.mv_world_account(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare used integer; jobs jsonb;
begin
 if not public.mv_world_rate(p_user_id,'read',120) then return jsonb_build_object('error','rate_limit','message','Please wait a moment before refreshing again.'); end if;
 select count(*),coalesce(jsonb_agg(public.mv_world_public_job(j) order by created_at desc),'[]'::jsonb)
 into used,jobs from public.world_generation_jobs j where user_id=p_user_id;
 return jsonb_build_object('limit',3,'used',used,'remaining',greatest(0,3-used),'jobs',jobs);
end;
$$;

create function public.mv_world_reserve(p_user_id uuid,p_submission text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.world_generation_demo; j public.world_generation_jobs; n integer; v_now timestamptz := clock_timestamp();
begin
 -- One transaction serializes all decisions affecting paid credits and account slots.
 select * into d from public.world_generation_demo where singleton for update;
 if not found then return jsonb_build_object('error','unconfigured','message','Generation is not configured.'); end if;
 if not public.mv_world_rate(p_user_id,'submit',10) then return jsonb_build_object('error','rate_limit','message','Please wait a moment before submitting again.'); end if;
 select * into j from public.world_generation_jobs where user_id=p_user_id and submission_hash=p_submission;
 if found then return jsonb_build_object('fresh',false,'job',public.mv_world_public_job(j),'model',j.model); end if;
 if not d.enabled or d.starts_at is null or v_now < d.starts_at then
   return jsonb_build_object('error','disabled','message','New world generation is currently unavailable. Explore a saved world instead.');
 end if;
 if v_now >= d.expires_at then return jsonb_build_object('error','ended','message','The judging period has ended. Your existing worlds are still available.'); end if;
 select count(*) into n from public.world_generation_jobs where user_id=p_user_id;
 if n >= 3 then return jsonb_build_object('error','allowance_used','message','You have used your 3 free worlds. You can revisit them any time.'); end if;
 if d.reserved_credits + d.credits_per_job > d.credit_budget then
   return jsonb_build_object('error','budget','message','The demo generation budget has been reached. Your existing worlds are still available.');
 end if;
 select count(*) into n from public.world_generation_jobs where created_at >= date_trunc('hour',v_now);
 if n >= d.max_new_per_hour then return jsonb_build_object('error','busy','message','The demo is busy. Please try again later.'); end if;
 select count(*) into n from public.world_generation_jobs where created_at >= date_trunc('day',v_now);
 if n >= d.max_new_per_day then return jsonb_build_object('error','busy','message','Today’s demo generation limit has been reached. Please return later.'); end if;
 select count(*) into n from public.world_generation_jobs where status in ('submitting','pending','unknown');
 if n >= d.max_in_flight then return jsonb_build_object('error','busy','message','World generation is busy. Please return shortly.'); end if;
 insert into public.world_generation_jobs(id,user_id,submission_hash,status,model,reserved_credits,message)
 values(p_job_id,p_user_id,p_submission,'submitting',d.model,d.credits_per_job,'Submitting your photograph…') returning * into j;
 update public.world_generation_demo set reserved_credits=reserved_credits+d.credits_per_job where singleton;
 return jsonb_build_object('fresh',true,'job',public.mv_world_public_job(j),'model',j.model);
end;
$$;

create function public.mv_world_poll(p_user_id uuid,p_job_id uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.world_generation_jobs; v_now timestamptz := clock_timestamp();
begin
 if not public.mv_world_rate(p_user_id,'read',120) then return jsonb_build_object('error','rate_limit','message','Please wait a moment before refreshing again.'); end if;
 select * into j from public.world_generation_jobs where id=p_job_id and user_id=p_user_id for update;
 if not found then return jsonb_build_object('error','not_found','message','World not found for this account.'); end if;
 if j.status='submitting' and v_now-j.created_at > interval '60 seconds' then
   update public.world_generation_jobs set status='unknown',message='Submission needs owner review. No automatic paid retry.',updated_at=v_now where id=j.id returning * into j;
 end if;
 if j.status <> 'pending' or j.poll_after > v_now then return jsonb_build_object('poll',false,'job',public.mv_world_public_job(j)); end if;
 update public.world_generation_jobs set poll_lease=p_lease,poll_after=v_now+interval '55 seconds' where id=j.id returning * into j;
 return jsonb_build_object('poll',true,'job',public.mv_world_public_job(j),'operation_id',j.operation_id);
end;
$$;

create function public.mv_world_finish(p_user_id uuid,p_job_id uuid,p_lease uuid,p_update jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.world_generation_jobs; next_status text := p_update->>'status';
begin
 select * into j from public.world_generation_jobs where id=p_job_id and user_id=p_user_id for update;
 if not found then return jsonb_build_object('error','not_found','message','World not found for this account.'); end if;
 if (p_lease is null and j.status <> 'submitting') or
    (p_lease is not null and (j.status <> 'pending' or j.poll_lease is distinct from p_lease)) then
   return public.mv_world_public_job(j);
 end if;
 if (p_lease is null and next_status not in ('pending','unknown')) or
    (p_lease is not null and next_status not in ('pending','succeeded','failed','expired')) then
   raise exception 'Invalid world job transition';
 end if;
 update public.world_generation_jobs set status=next_status,
   operation_id=coalesce(p_update->>'operation_id',operation_id),
   world_id=coalesce(p_update->>'world_id',world_id),
   assets=coalesce(p_update->'world',assets),
   message=coalesce(p_update->>'message',message),
   provider_expires_at=coalesce((p_update->>'expires_at')::timestamptz,provider_expires_at),
   poll_after=clock_timestamp()+interval '5 seconds',updated_at=clock_timestamp()
 where id=j.id returning * into j;
 -- No allowance or credit refund, including failure/expiry/ambiguous billing.
 return public.mv_world_public_job(j);
end;
$$;

revoke all on function public.mv_world_public_job(public.world_generation_jobs),public.mv_world_rate(uuid,text,integer),public.mv_world_config(),public.mv_world_account(uuid),public.mv_world_reserve(uuid,text,uuid),public.mv_world_poll(uuid,uuid,uuid),public.mv_world_finish(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mv_world_config(),public.mv_world_account(uuid),public.mv_world_reserve(uuid,text,uuid),public.mv_world_poll(uuid,uuid,uuid),public.mv_world_finish(uuid,uuid,uuid,jsonb) to service_role;
commit;
