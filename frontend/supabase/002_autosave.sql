-- Run this if you ALREADY applied the earlier schema.sql.
-- Supports photo-only, audio-only, and partial text drafts without deleting data.
begin;
alter table public.memories alter column photo_path drop not null;
alter table public.memories alter column description set default '';
alter table public.memories drop constraint if exists memories_description_check;
alter table public.memories add constraint memories_description_check
  check (char_length(description) <= 2000);
grant usage on schema public to authenticated;
grant select, insert, update on public.memories to authenticated;
drop policy if exists "Update own memories" on public.memories;
create policy "Update own memories" on public.memories
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
commit;
