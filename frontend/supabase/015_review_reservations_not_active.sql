-- Unknown jobs retain account quota, credit holds, and duplicate protection.
-- Change only the global slot check; never update job or budget rows.
-- Fingerprints accept reviewed definitions despite comments/indentation changes.
-- Existing deployed variants are no-ops; unexpected business logic aborts.
begin;
do $migration$
declare
  definition text;
  body text;
  fingerprint text;
begin
  select pg_get_functiondef(p.oid),p.prosrc into definition,body
  from pg_proc p
  where p.oid='public.mv_world_reserve(uuid,text,uuid)'::regprocedure;
  fingerprint:=md5(btrim(regexp_replace(
    regexp_replace(body,'(?n)^[ \t]*--[^\n]*(\n|$)','','g'),
    '[[:space:]]+',' ','g')));

  -- Reviewed deployed variants already count only submitting/pending jobs.
  if fingerprint in ('87aa0224e71f5c59356aa8a19fdbff3b','8fbd6a878da6291431aac109ce905bcf') then
    raise notice '015 already applied; nothing changed';
    return;
  end if;
  -- Reviewed 013 definition: retain every unrelated reservation safeguard.
  if fingerprint<>'113d07bf97c36eecb9c3ddfe96c5e0f7' then
    raise exception 'Unexpected reservation definition; nothing changed';
  end if;

  definition:=replace(definition,
    'status in (''submitting'',''pending'',''unknown'')',
    'status in (''submitting'',''pending'')');
  definition:=replace(definition,'''review_required''','''in_flight_limit''');
  definition:=replace(definition,
    'Generation is blocked by earlier submissions awaiting owner review. No new World Labs request was sent; your allowance is unchanged.',
    'All global generation slots are processing existing worlds. Resume a pending world or try after one finishes. Your allowance is unchanged.');
  execute definition;
end;
$migration$;
commit;
