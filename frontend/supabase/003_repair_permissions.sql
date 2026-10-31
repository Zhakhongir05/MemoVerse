-- Repair missing table privileges without disabling row ownership protection.
-- Run in your project's Supabase SQL Editor as the project owner.
begin;
grant usage on schema public to authenticated;
grant select, insert, update on public.memories to authenticated;
alter table public.memories enable row level security;

drop policy if exists "Read own memories" on public.memories;
create policy "Read own memories" on public.memories
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own memories" on public.memories;
create policy "Create own memories" on public.memories
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own memories" on public.memories;
create policy "Update own memories" on public.memories
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
commit;
