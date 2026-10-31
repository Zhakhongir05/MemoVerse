-- Manual owner-reviewed recovery template, never an automatic migration.
-- Set memoverse.review_job_a and memoverse.review_job_b in this SQL session.
-- No production identifiers or credentials are included. Review before use.
begin;
do $restore$
declare
  ids uuid[] := array[
    current_setting('memoverse.review_job_a',true)::uuid,
    current_setting('memoverse.review_job_b',true)::uuid
  ];
  n integer;
  credits integer;
  definition text;
begin
  if ids[1] is null or ids[2] is null or ids[1]=ids[2] then
    raise exception 'Two distinct reviewed job IDs are required; nothing changed';
  end if;
  perform 1 from public.world_generation_demo where singleton for update;
  if not found then raise exception 'Budget missing; nothing changed'; end if;
  perform 1 from public.world_generation_jobs where id=any(ids) order by id for update;
  select count(*) into n from public.world_generation_jobs where id=any(ids);
  if n<>2 then raise exception 'Expected two jobs; nothing changed'; end if;

  select count(*) into n from public.world_generation_jobs where id=any(ids)
    and provider_diagnostics->'hold_restoration'->>'source'='owner-approved-uncertain-hold-restoration';
  if n=2 then raise notice 'Already restored; nothing changed'; return; end if;
  if n<>0 then raise exception 'Mixed restoration state; nothing changed'; end if;

  definition:=pg_get_functiondef('public.mv_world_reserve(uuid,text,uuid)'::regprocedure);
  if strpos(definition,'status in (''submitting'',''pending'')')=0
     or strpos(definition,'status in (''submitting'',''pending'',''unknown'')')>0 then
    raise exception 'Slot rule differs; nothing changed';
  end if;
  select count(*),sum(reserved_credits) into n,credits
  from public.world_generation_jobs
  where id=any(ids) and status='failed' and allowance_released
    and operation_id is null and world_id is null
    and reserved_credits=500
    and provider_diagnostics->>'source'='owner-approved-held-slot-clear';
  if n<>2 or credits<>1000 then
    raise exception 'Job state differs from reviewed snapshot; nothing changed';
  end if;

  update public.world_generation_jobs j
  set status='unknown',allowance_released=false,
      provider_diagnostics=coalesce(j.provider_diagnostics,'{}'::jsonb)
        || jsonb_build_object('hold_restoration',jsonb_build_object(
          'source','owner-approved-uncertain-hold-restoration',
          'reason','Provider submission and billing remain unverified',
          'previous_status',j.status,'previous_allowance_released',j.allowance_released,
          'previous_message',j.message,'previous_updated_at',j.updated_at,
          'restored_at',clock_timestamp())),
      message='Submission needs owner review. Your allowance is reserved; this job will not be submitted again automatically.',
      updated_at=clock_timestamp()
  where j.id=any(ids);
  update public.world_generation_demo
  set reserved_credits=reserved_credits+credits where singleton;
end;
$restore$;
commit;
