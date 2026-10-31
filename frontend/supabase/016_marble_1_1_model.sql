-- Use Marble 1.1 for NEW reservations only: ordinary photo cost is 1,580 credits.
-- Existing jobs/worlds, account usage, reserved credits, and budget are unchanged.
-- Idempotent; unexpected custom configuration aborts instead of being overwritten.
begin;
do $upgrade$
declare config public.world_generation_demo;
begin
  select * into config from public.world_generation_demo where singleton for update;
  if not found then raise exception 'Generation configuration missing; nothing changed'; end if;
  if config.model='marble-1.1' and config.credits_per_job=1580 then
    raise notice 'Marble 1.1 already configured; nothing changed';
    return;
  end if;
  if config.model<>'marble-1.0-draft' or config.credits_per_job<>500 then
    raise exception 'Unexpected model configuration; nothing changed';
  end if;
  update public.world_generation_demo
    set model='marble-1.1',credits_per_job=1580 where singleton;
end;
$upgrade$;
commit;
