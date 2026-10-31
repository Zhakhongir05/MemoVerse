-- Run after 004_journal_sync.sql. Deletion markers prevent offline clients from
-- recreating memories that were deleted on another device.
begin;
alter table public.journal_entries add column if not exists deleted_at timestamptz;
create or replace function public.prevent_journal_resurrection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'This memory has been deleted. Create a new memory instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists journal_prevent_resurrection on public.journal_entries;
create trigger journal_prevent_resurrection before update on public.journal_entries
  for each row execute function public.prevent_journal_resurrection();
commit;
