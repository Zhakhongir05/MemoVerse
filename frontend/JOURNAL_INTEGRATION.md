# Digital memory journal

**Cloud sync update:** journal entries now sync to Supabase for signed-in users.
Apply `supabase/004_journal_sync.sql` first and follow `SUPABASE_JOURNAL_SYNC.md`.
IndexedDB remains the local cache/offline queue. The local-only notes below describe
the initial journal implementation and are superseded by that sync guide.

The current `feature/frontend` branch was fetched before implementation; local
changes were retained. The homepage now renders `Journal` inside the existing
Supabase session wrapper. No backend or 3D internals were changed.

## Demo path

1. Open My Journal → New Memory.
2. Add a title/date/mood and any combination of story, photos (up to 6), or audio.
3. Save journal entry. A 3D world is not required and generation does not run.
4. Reload. The entry remains in My Journal and appears under its memory month/year
   in Timeline. Dates refer to the memory date, not the save timestamp.
5. Open the entry to view the full story, photo gallery, and native audio player.
6. Explore Freely opens the existing renderer. Take a Guided Journey opens real
   paragraph/photo reading steps with Previous/Next and a return to memory action.
7. Edit a memory and save to update that same entry.

The original upload/generation studio remains accessible from the free Relive
view. Its Supabase saves are separate from the new IndexedDB journal.

## Persistence

`journalStore.js` uses native IndexedDB, database `memoverse-journal`, store `entries`.
Files/Blobs are stored directly, not as temporary object URLs. Save resolves only
after the IndexedDB transaction commits. Media URLs are created for rendering and
revoked when components unmount or files change.

The guest namespace is `local-device`; signed-in users use their Supabase user ID.
Accounts have separate local collections, but this is browser-local separation,
not a security boundary against another person with access to browser storage.
Guest entries are not automatically migrated on login. Existing Supabase memories
are not imported or removed. The journal has no cloud sync yet.

Entries survive reloads on the same browser/origin/device. Clearing site data,
private-browsing cleanup, storage eviction, or switching domains (including Vercel
preview URLs) can remove or hide local entries. Quota/storage failures are surfaced
without discarding the editor draft. Cross-tab updates appear after a reload.

## Viewer integration contract

`Journal` receives these optional components from `App.jsx`:

- `SceneRenderer`: the existing lazy `ScenePreview` wrapper, passed `scene`, `mood`,
  and `memory`. Its current R3F room is predefined; it is not reconstructed from
  journal photos. Missing renderer source still produces the deployment fallback.
- `WorldViewer`: the team's World Labs viewer. When `entry.world` is available,
  receives `world`, `memory`, `mode` (`free`/`guided`), and `activeStep`.
  No World Labs viewer source was present in this frontend branch. Pass the real
  component here after coordination; no replacement iframe or fake world is added.
- `JourneyController`: receives `memory`, `steps`, `activeStep`, `onStepChange`.
  This is where the team can connect generated narration, camera interpolation,
  and world anchors. `journeySteps` creates stable per-entry anchor IDs and photo
  references; `cameraPose` and `narrationUrl` remain null until supplied by a real
  integration. The current guided UI never claims synchronized camera or AI audio.

`entry.scene` and `entry.world` are retained on edits. Use the existing generation
service later to set these after an entry is saved, without coupling save to AI.

## Verification

```powershell
npm.cmd run build
npm.cmd run lint
node --test src/ui/journalStore.test.js src/ui/memoryStore.test.js
```

`fake-indexeddb` is test-only. Tests cover committed/reopened media, timeline order,
updates, ownership checks, invalid dates, and honest guided-step metadata. Browser
checks also verify the journal → timeline → detail → guided journey flow and reload.
