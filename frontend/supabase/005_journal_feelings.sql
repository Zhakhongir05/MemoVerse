-- Run after 004_journal_sync.sql if your journal table already exists.
-- Expands the allowed feelings without changing existing entries.
begin;
alter table public.journal_entries drop constraint if exists journal_entries_mood_check;
alter table public.journal_entries add constraint journal_entries_mood_check check (
  mood in ('Nostalgic','Joyful','Peaceful','Grateful','Loved','Excited','Hopeful','Bittersweet','Melancholic')
);
commit;
