-- Unknown submissions retain account quota AND reserved credits. They are not
-- confirmed running operations, so they must not permanently occupy all global
-- execution slots. Known pending/submitting jobs still obey max_in_flight.
begin;
do $fix$
declare source text;
begin
 source:=pg_get_functiondef('public.mv_world_reserve(uuid,text,uuid)'::regprocedure);
 if position('status in (''submitting'',''pending'',''unknown'')' in source)=0 then
  raise exception 'Unexpected reservation definition: review before changing it';
 end if;
 source:=replace(source,'status in (''submitting'',''pending'',''unknown'')','status in (''submitting'',''pending'')');
 source:=replace(source,'''review_required''','''in_flight_limit''');
 source:=replace(source,'Generation is blocked by earlier submissions awaiting owner review. No new World Labs request was sent; your allowance is unchanged.','All global generation slots are processing existing worlds. Resume a pending world or try after one finishes. Your allowance is unchanged.');
 execute source;
end;
$fix$;
commit;
