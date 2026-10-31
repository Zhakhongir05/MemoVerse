-- Run once in Supabase SQL Editor. Independent of the older studio memories table.
begin;

create or replace function public.journal_media_owned(assets jsonb, owner_id uuid, entry_id uuid)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(assets) <> 'array' then false else
    jsonb_array_length(assets) <= 6 and not exists (
      select 1 from jsonb_array_elements(assets) asset
      where asset->>'path' is null
        or asset->>'path' not like owner_id::text || '/' || entry_id::text || '/%'
    ) end;
$$;

create table if not exists public.journal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  memory_date date not null,
  story text not null default '' check (char_length(story) <= 12000),
  mood text not null check (mood in ('Nostalgic','Joyful','Peaceful','Grateful','Loved','Excited','Hopeful','Bittersweet','Melancholic')),
  photos jsonb not null default '[]',
  audio jsonb,
  scene jsonb,
  world jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint journal_photo_ownership check (public.journal_media_owned(photos, user_id, id)),
  constraint journal_audio_ownership check (audio is null or (
    audio->>'path' is not null and audio->>'path' like user_id::text || '/' || id::text || '/%'
  ))
);
create index if not exists journal_owner_date on public.journal_entries(user_id, memory_date desc);
alter table public.journal_entries enable row level security;
grant usage on schema public to authenticated;
revoke all on public.journal_entries from anon, authenticated;
grant select, insert, update on public.journal_entries to authenticated;
drop policy if exists "Read own journal" on public.journal_entries;
create policy "Read own journal" on public.journal_entries for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Insert own journal" on public.journal_entries;
create policy "Insert own journal" on public.journal_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own journal" on public.journal_entries;
create policy "Update own journal" on public.journal_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-assets','memory-assets',false,26214400,
  array['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','audio/mp4','audio/x-m4a','audio/ogg','audio/webm','video/webm','video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Journal asset upload" on storage.objects;
create policy "Journal asset upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'memory-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "Journal asset read" on storage.objects;
create policy "Journal asset read" on storage.objects for select to authenticated
  using (bucket_id = 'memory-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
commit;
