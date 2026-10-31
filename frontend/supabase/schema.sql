-- Run in your own project's Supabase SQL Editor, once. No service key needed in React.
begin;

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 70),
  description text not null default '' check (char_length(description) <= 2000),
  mood text not null default 'Nostalgic' check (mood in ('Nostalgic', 'Joyful', 'Melancholic')),
  scene jsonb,
  photo_path text,
  audio_path text,
  created_at timestamptz not null default now(),
  constraint owned_photo_path check (photo_path like user_id::text || '/' || id::text || '/%'),
  constraint owned_audio_path check (audio_path is null or audio_path like user_id::text || '/' || id::text || '/%')
);
create index memories_owner_created on public.memories(user_id, created_at desc);
alter table public.memories enable row level security;
revoke all on public.memories from anon, authenticated;
grant select, insert, update on public.memories to authenticated;

create policy "Read own memories" on public.memories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own memories" on public.memories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own memories" on public.memories
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-assets', 'memory-assets', false, 26214400,
  array['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','audio/mp4','audio/x-m4a','audio/ogg','audio/webm','video/webm','video/mp4'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Upload own memory assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'memory-assets' and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy "Read own memory assets" on storage.objects
  for select to authenticated using (
    bucket_id = 'memory-assets' and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
create policy "Clean up own memory assets" on storage.objects
  for delete to authenticated using (
    bucket_id = 'memory-assets' and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
commit;
