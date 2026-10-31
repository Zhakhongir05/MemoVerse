-- Existing Supabase hosts the minute scheduler; generation runs in World Labs.
-- No service-role key or account token is put in cron commands or HTTP payloads.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.mv_world_dispatch_tick()
returns void language plpgsql security definer set search_path='' as $$
declare work record;
begin
 for work in
  select j.id,i.dispatch_token from public.world_generation_jobs j
  join public.world_generation_inputs i on i.job_id=j.id
  where j.status in ('submitting','pending','unknown') and not j.allowance_released
  order by j.updated_at limit 2
 loop
  perform net.http_post(
   url:='https://memoverse05.vercel.app/api/world-worker',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('job_id',work.id,'token',work.dispatch_token),
   timeout_milliseconds:=55000
  );
 end loop;
end;
$$;
revoke all on function public.mv_world_dispatch_tick() from public,anon,authenticated,service_role;
-- Idempotent scheduler setup does not create duplicate workers.
do $$
begin
 if not exists(select 1 from cron.job where jobname='memoverse-world-jobs') then
  perform cron.schedule('memoverse-world-jobs','* * * * *','select public.mv_world_dispatch_tick()');
 end if;
end;
$$;
