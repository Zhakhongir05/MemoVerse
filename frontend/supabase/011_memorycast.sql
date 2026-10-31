-- MemoryCast only: existing journal/auth/database remain unchanged.
begin;
create table public.memorycast_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 max_daily_jobs integer not null default 10 check(max_daily_jobs between 1 and 100),
 max_user_daily_jobs integer not null default 3 check(max_user_daily_jobs between 1 and 20),
 max_in_flight integer not null default 2 check(max_in_flight between 1 and 10)
);
insert into public.memorycast_settings(singleton) values(true);
create table public.memorycast_tours (
 id uuid primary key,
 memory_id uuid not null references public.journal_entries(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 language text not null check(language in ('en','ko')),
 mood text not null,
 context jsonb not null,
 script jsonb,
 audio_paths jsonb not null default '[]' check(jsonb_typeof(audio_paths)='array' and jsonb_array_length(audio_paths)<=3),
 audio_durations jsonb not null default '[]',
 status text not null default 'pending' check(status in ('pending','ready','failed','uncertain')),
 next_step integer not null default 0 check(next_step between 0 and 10),
 total_steps integer not null check(total_steps between 4 and 10),
 lease uuid,
 lease_until timestamptz,
 message text not null default 'Tour generation queued.',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,memory_id,input_hash),
 check(status <> 'ready' or (script is not null and jsonb_array_length(audio_paths)=3 and next_step=total_steps))
);
create index memorycast_owner_memory on public.memorycast_tours(user_id,memory_id,created_at desc);
alter table public.memorycast_settings enable row level security;
alter table public.memorycast_tours enable row level security;
revoke all on public.memorycast_settings,public.memorycast_tours from public,anon,authenticated;
grant select on public.memorycast_tours to authenticated;
create policy "Read own saved tours" on public.memorycast_tours for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.journal_entries j where j.id=memory_id and j.user_id=(select auth.uid()) and j.deleted_at is null)
);

create function public.mc_public(t public.memorycast_tours) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',t.id,'memory_id',t.memory_id,'input_hash',t.input_hash,'language',t.language,'mood',t.mood,
 'status',t.status,'next_step',t.next_step,'total_steps',t.total_steps,'message',t.message,'script',t.script,
 'audio_paths',t.audio_paths,'audio_durations',t.audio_durations,'created_at',t.created_at,'updated_at',t.updated_at);
$$;
create function public.mc_read(p_user uuid,p_memory uuid,p_tour uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.memorycast_tours;
begin
 if not exists(select 1 from public.journal_entries where id=p_memory and user_id=p_user and deleted_at is null) then return jsonb_build_object('error','not_found','message','Saved memory not found.');end if;
 update public.memorycast_tours set status='uncertain',message='A generation step needs owner review. It will not be charged again automatically.',updated_at=clock_timestamp()
 where user_id=p_user and memory_id=p_memory and status='pending' and lease is not null and lease_until<=clock_timestamp();
 select * into t from public.memorycast_tours where user_id=p_user and memory_id=p_memory and (p_tour is null or id=p_tour) order by created_at desc,id desc limit 1;
 if p_tour is not null and t.id is null then return jsonb_build_object('error','not_found','message','Saved tour not found for this memory.');end if;
 return jsonb_build_object('tour',case when t.id is null then null else public.mc_public(t) end,
 'enabled',(select enabled from public.memorycast_settings where singleton),
 'previous_ready_tour_id',(select id from public.memorycast_tours where user_id=p_user and memory_id=p_memory and status='ready' order by created_at desc,id desc limit 1));
end;
$$;
create function public.mc_reserve(p_user uuid,p_memory uuid,p_id uuid,p_hash text,p_context jsonb,p_regenerate boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.memorycast_tours;d public.memorycast_settings;
begin
 select * into d from public.memorycast_settings where singleton for update;
 if not exists(select 1 from public.journal_entries where id=p_memory and user_id=p_user and deleted_at is null) then return jsonb_build_object('error','not_found','message','Save this memory to your account first.');end if;
 select * into t from public.memorycast_tours where user_id=p_user and memory_id=p_memory and input_hash=p_hash;
 if found then return jsonb_build_object('fresh',false,'tour',public.mc_public(t));end if;
 if exists(select 1 from public.memorycast_tours where user_id=p_user and memory_id=p_memory) and not p_regenerate then return jsonb_build_object('error','stale','message','This memory has changed. Explicitly choose Regenerate Guided Tour to create a new version.');end if;
 if not coalesce(d.enabled,false) then return jsonb_build_object('error','disabled','message','New MemoryCast generation is disabled. Saved tours can still be replayed.');end if;
 if (select count(*) from public.memorycast_tours where created_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))>=d.max_daily_jobs or
    (select count(*) from public.memorycast_tours where user_id=p_user and created_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))>=d.max_user_daily_jobs then
  return jsonb_build_object('error','limit','message','The daily narration-generation limit has been reached. Saved tours remain available.');end if;
 insert into public.memorycast_tours(id,user_id,memory_id,input_hash,language,mood,context,total_steps)
 values(p_id,p_user,p_memory,p_hash,p_context->>'language',p_context->>'mood',p_context,jsonb_array_length(p_context->'photos')+4) returning * into t;
 return jsonb_build_object('fresh',true,'tour',public.mc_public(t));
end;
$$;
create function public.mc_claim(p_user uuid,p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.memorycast_tours;d public.memorycast_settings;
begin
 select * into d from public.memorycast_settings where singleton for update;
 select * into t from public.memorycast_tours where id=p_id and user_id=p_user for update;
 if t.id is null or not exists(select 1 from public.journal_entries where id=t.memory_id and user_id=p_user and deleted_at is null) then return jsonb_build_object('error','not_found','message','Tour not found for this account.');end if;
 if t.status<>'pending' then return jsonb_build_object('claimed',false,'tour',public.mc_public(t));end if;
 if t.lease is not null then
  if t.lease_until>clock_timestamp() then return jsonb_build_object('claimed',false,'tour',public.mc_public(t));end if;
  update public.memorycast_tours set status='uncertain',message='A generation step needs owner review. It will not be charged again automatically.',updated_at=clock_timestamp() where id=t.id returning * into t;
  return jsonb_build_object('claimed',false,'tour',public.mc_public(t));
 end if;
 if not coalesce(d.enabled,false) then return jsonb_build_object('error','disabled','message','New MemoryCast generation is disabled.');end if;
 if (select count(*) from public.memorycast_tours where lease is not null and lease_until>clock_timestamp())>=d.max_in_flight then return jsonb_build_object('error','limit','message','Narration is busy. Poll this existing tour, then resume later.');end if;
 update public.memorycast_tours set lease=p_lease,lease_until=clock_timestamp()+interval '70 seconds',message='Preparing the next tour chapter.',updated_at=clock_timestamp() where id=t.id returning * into t;
 return jsonb_build_object('claimed',true,'tour',to_jsonb(t));
end;
$$;
create function public.mc_finish(p_user uuid,p_id uuid,p_lease uuid,p_update jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.memorycast_tours;new_status text;
begin
 select * into t from public.memorycast_tours where id=p_id and user_id=p_user for update;
 if t.id is null then return jsonb_build_object('error','not_found','message','Tour not found.');end if;
 if t.status<>'pending' or t.lease is distinct from p_lease then return jsonb_build_object('tour',public.mc_public(t));end if;
 new_status=coalesce(p_update->>'status','pending');
 if new_status not in ('pending','failed','uncertain') then raise exception 'invalid finish status';end if;
 update public.memorycast_tours set context=coalesce(p_update->'context',context),script=coalesce(p_update->'script',script),
  audio_paths=case when p_update ? 'audio_path' then audio_paths||jsonb_build_array(p_update->>'audio_path') else audio_paths end,
  audio_durations=case when p_update ? 'duration' then audio_durations||jsonb_build_array((p_update->>'duration')::numeric) else audio_durations end,
  next_step=case when new_status='pending' then next_step+1 else next_step end,
  status=case when new_status='pending' and next_step+1=total_steps then 'ready' else new_status end,
  lease=null,lease_until=null,message=coalesce(p_update->>'message','Tour chapter saved.'),updated_at=clock_timestamp()
 where id=p_id returning * into t;
 return jsonb_build_object('tour',public.mc_public(t));
end;
$$;
revoke all on function public.mc_public(public.memorycast_tours) from public,anon,authenticated,service_role;
revoke all on function public.mc_read(uuid,uuid,uuid),public.mc_reserve(uuid,uuid,uuid,text,jsonb,boolean),public.mc_claim(uuid,uuid,uuid),public.mc_finish(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mc_read(uuid,uuid,uuid),public.mc_reserve(uuid,uuid,uuid,text,jsonb,boolean),public.mc_claim(uuid,uuid,uuid),public.mc_finish(uuid,uuid,uuid,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('memorycast-audio','memorycast-audio',false,8388608,array['audio/wav'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Read own MemoryCast narration" on storage.objects for select to authenticated using (
 bucket_id='memorycast-audio' and (storage.foldername(name))[1]=(select auth.uid()::text) and exists(
 select 1 from public.memorycast_tours t join public.journal_entries j on j.id=t.memory_id
 where t.user_id=(select auth.uid()) and t.status='ready' and j.user_id=(select auth.uid()) and j.deleted_at is null
 and t.memory_id::text=(storage.foldername(name))[2] and t.id::text=(storage.foldername(name))[3]
 )
);
commit;
