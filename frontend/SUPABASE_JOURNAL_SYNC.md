# Enable private journal sync

## Required database setup

**Deletion support:** also run `supabase/006_journal_deletion.sql`. Memory details
now has Delete memory with confirmation. The explicit Sync now button is removed;
automatic sync and error retry remain. Deletions create a private tombstone, clear
the story/media references, and propagate across devices. Offline deletions remain
queued. The database trigger prevents stale clients from restoring deleted rows.
This is journal removal, not permanent storage erasure: old uploaded asset revisions
remain private in Storage until a separate server cleanup is implemented.

Run `supabase/004_journal_sync.sql` in your Supabase project's SQL Editor.
It creates the new `journal_entries` table with owner-only SELECT/INSERT/UPDATE
policies and configures private `memory-assets` storage. It can be run again safely.
It does not remove or change your earlier `memories` table or its saved studio data.

Use the existing frontend environment variables:

```dotenv
VITE_SUPABASE_URL=https://xtmcncvjrawibipzlnqh.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

For Vercel, set both variables in Production and Preview and redeploy. Never use a
secret/service-role key in frontend code. Google sign-in still needs the Google
provider and deployed redirect URL configured as described in `SUPABASE_SETUP.md`.

## What syncs

- Entry ID, owner, title, memory date, full story, mood, creation/update timestamps.
- Every selected photograph (up to six) and optional audio recording, including
  original filenames and content types, in private storage.
- Scene JSON and World Labs world reference JSON when these exist.
- My Journal, Timeline, Detail, and Relive all read the same synced entry records.

Real AI narration/world assets do not exist yet; syncing their future metadata
does not connect an AI generator, World Labs renderer, or camera controller.

## Save and sync behavior

Save journal entry writes a pending copy to IndexedDB, then syncs to Supabase.
Loading the journal, clicking Sync now / Retry sync, or regaining connectivity also
syncs this account. Existing account-local entries upload automatically. While
signed in, the visible app checks for updates every 30 seconds and when focused.
Automatic checks pause during unsaved editing, saves, or another sync operation.
They resume when editing is finished. Saving remains an explicit user action.
The upload retains the same entry ID so edits update an entry rather than create
copies. Content hashes make media retries idempotent. Unchanged cached assets are
reused. Cloud entries download into the local cache for reopening offline.

A failed request leaves the entry and all its files in IndexedDB with pending
status. The UI never reports that entry as synced until its remote row commits.
No service worker or background-tab sync is claimed; retry needs the app open.
Refresh or Sync now on another device to fetch the latest saved changes. Concurrent
manual saves use last-write-wins; advanced conflict resolution is not implemented.
Older media revisions are retained rather than deleted automatically because
another device or an ambiguous network response may still reference them.

Local guest entries are not silently attached to an account. After signing in,
choose **Import this browser’s guest memories into my account**. Imports use stable
account-specific IDs to prevent duplicate copies; originals remain in the guest
namespace. Other signed-in accounts' local entries are never imported.

The original 3D studio still uses the earlier `memories` table. Those records already
live in Supabase and are not automatically transformed into journal entries.

## Verify with real accounts

1. Apply the SQL migration and sign in as account A.
2. Create/save an entry with a title/date, long story, mood, multiple photos, audio.
   Wait for the Synced badge. Verify its row in journal_entries and its files under
   memory-assets/<account A ID>/<entry ID>/.
3. On another browser/device, sign in as A, open the journal, and confirm the full
   entry and files download. Edit/save, then Sync now on the first browser.
4. Disconnect the network, save a change, and verify it stays marked pending. Restore
   the network or click Retry sync and confirm only one row/assets set is created.
5. Sign in as B and verify A's journal is absent. With B's authenticated API session,
   querying A's ID must return no rows and downloading A's known file path must fail.
6. Import a guest entry twice. Verify only one cloud entry is created for that
   account and the guest original remains available in that browser's guest journal.

Local account namespaces are a cache convenience, not encryption against someone
with access to the browser's data. Supabase RLS is the cloud authorization boundary.

## Automated checks

```powershell
npm.cmd run build
npm.cmd run lint
node --test src/ui/journalCloud.test.js src/ui/journalStore.test.js src/ui/memoryStore.test.js
```

Cloud tests use a mock Supabase client and real IndexedDB semantics through the
test-only emulator. Live database/RLS and cross-device tests still require the
migration and authenticated project access; those cannot be proven by mocks.
