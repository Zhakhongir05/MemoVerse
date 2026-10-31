-- Additive only. Existing journal rows, worlds, audio and allowances are untouched.
begin;
create table if not exists public.memory_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 memory_id uuid not null references public.journal_entries(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (user_id, memory_id)
);
alter table public.memory_favorites enable row level security;
drop policy if exists "Own memory favorites" on public.memory_favorites;
create policy "Own memory favorites" on public.memory_favorites for all to authenticated
 using (user_id = (select auth.uid()) and exists (
  select 1 from public.journal_entries j where j.id=memory_id and j.user_id=(select auth.uid()) and j.deleted_at is null
 ))
 with check (user_id = (select auth.uid()) and exists (
  select 1 from public.journal_entries j where j.id=memory_id and j.user_id=(select auth.uid()) and j.deleted_at is null
 ));
revoke all on public.memory_favorites from anon;
grant select,insert,delete on public.memory_favorites to authenticated;
-- Upsert updates only this user's existing favorite; ownership remains RLS-checked.
grant update on public.memory_favorites to authenticated;
commit;
