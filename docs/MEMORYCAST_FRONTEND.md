# MemoryCast frontend integration

Base: `feature/memorycast-guided-tours`, exact commit `902a75b` from
`sujamahat/MemoVerse-1`. Working branch: existing `feature/memorycast-guided-tours`.
Read `MEMORYCAST_BACKEND.md` first; its API, migration and provider pipeline are
reused without backend, schema or authentication changes.

## User experience

Open an owned, cloud-synced journal memory to find **MemoryCast** in its detail
page. The immersive guided panel also includes it. Unsigned/unsynced/other-owner
entries cannot request narration. The existing Studio, journal, World Labs and
symbolic renderers remain available. No speech-to-text was added.

Opening performs only GET. **Generate AI narration** explicitly approves paid
generation; changed content/language instead offers **Regenerate AI narration**.
Generation disabled by the backend prevents both actions without preventing
saved playback. An existing pending job offers **Continue narration generation**.
Only a user-approved workflow calls advance; it serializes requests, waits four
seconds between pending steps, and checks the saved status. Idle pending status
checks run every five seconds. Failed, uncertain and transport-error workflows
stop without a provider retry or replacement job. Check status is read-only.

The player offers Arrival, Rediscovery and Reflection, play/pause, chapter
selection, full chapter subtitles, backend-measured/decoded WAV durations, real
timeupdate progress and automatic chapter changes only on the real ended event.
Voice starts only after playback intent. It discloses **AI-generated voice**.
Signed links refresh by GET 30 seconds before expiry, or through **Refresh audio
links** after a load error. Refresh does not automatically restart playback.
Old saved tours can replay while content is stale or generation is disabled.
If a new job fails/is pending, the previous-ready-tour action remains available.

The API client obtains the existing Supabase access token on every request,
checks its owner before/after transport, and sends it only to same-origin
`/api/memorycast`. It contains no provider credentials. Auth changes cancel
requests, remove private player state and pause the captured audio element.
No account-independent tour cache or browser persistence of signed URLs is used.

## Viewer handoff

JournalWorld advertises optional camera-cue support. WorldLabsViewer receives the
returned chapter/anchor and a look-at adapter using the existing OrbitControls.
The camera position is preserved to avoid translating through unverified room
geometry. Only finite bounded targets are accepted. Reduced-motion mode skips
automatic movement. Narration waits for the cue to finish, with an eight-second
fallback if the viewer cannot become ready. Orbit/pan/zoom, pause, skip, reset,
panel exit and unmount cancel the previous cue/audio. Existing local anchors
are selected only when their ID actually exists; no anchors are invented.
The symbolic and alternative renderers retain their manual controls and receive
no unsupported camera movement. Chapter subtitles/audio still work there.

## Deployment prerequisites — still pending

1. Team owner reviews/applies existing `frontend/supabase/010_memorycast.sql` to
   the existing Supabase project. This change did not apply any live migration.
2. Backend owner configures the existing provider credentials, `DEMO_MODE=false`,
   `MEMORYCAST_LIVE_ENABLED=true`, and `memorycast_settings.enabled=true` only
   after explicit approval for paid generation. Keep disabled in ordinary tests.
3. Confirm the frontend deployment serves the matching MemoryCast backend through
   the existing Vercel `/api/:path*` rewrite. No preview URL was hardcoded. For
   local development the existing Vite proxy uses `MEMOVERSE_BACKEND_URL` or
   `http://127.0.0.1:8000`. An approved backend preview can be supplied via that
   server-side environment variable; do not put a service/provider key in Vite.
4. Controlled real narration quality/provider tests and a deployed user-flow
   check still need separate approval. No live/private memory or paid provider
   request was used during implementation. Follow the backend document's model
   availability warning before extending service beyond the judging period.

No migration, backend, dependency manifest, lockfile, Google OAuth configuration,
or `3d_world/` internals changed. No merge or deployment performed. Commit and
push were subsequently authorized by the user on the existing feature branch.

## Changed files

- `frontend/src/ui/Journal.jsx` — MemoryCast entry on owned saved-memory details.
- `frontend/src/ui/ImmersiveMemory.jsx` — guided panel and cancellable viewer cue.
- `frontend/src/ui/MemoryCast.jsx` — workflow, generation states and audio player.
- `frontend/src/ui/MemoryCast.css` — responsive warm styling.
- `frontend/src/integration/memorycastClient.js` — authenticated API and serial steps.
- `frontend/src/integration/memorycastClient.test.js` — mocked API/camera/expiry tests.
- `frontend/src/integration/memorycastCameraCue.js` — bounded reduced-motion guard.
- `frontend/src/integration/MemoryCastCamera.jsx` — optional R3F look-at controller.
- `frontend/src/integration/JournalWorld.jsx` — forwards optional chapter cue.
- `frontend/src/integration/WorldLabsViewer.jsx` — attaches the small adapter.
- `frontend/e2e/memorycast-harness.html` — test-only component entry.
- `frontend/e2e/memorycast-harness.jsx` — isolated test auth/session fixture.
- `frontend/e2e/memorycast.spec.js` — synthetic WAV and mocked API browser tests.
- `frontend/memorycast.playwright.config.mjs` — local-only browser test config.
- `docs/MEMORYCAST_FRONTEND.md` — this handoff.

## Verification

From `frontend/`:

```
npm test
npm run lint
npm run build
npm run test:database
node --test ../backend/tests/memorycast_database.test.mjs
npx playwright test --config memorycast.playwright.config.mjs
```

- 84 frontend unit tests pass, including 10 new MemoryCast cases.
- 7 MemoryCast browser tests pass in Chrome using mocked endpoints and synthetic
  one-second WAV files: approval/progress/sequential work, play/pause/ended chapter
  changes, replay with zero extra generation, failures/uncertainty, expired audio
  recovery, account isolation, disabled generation, explicit regeneration and
  read-only pending-job reopening.
- 14 existing World Labs SQL regressions and 9 MemoryCast SQL tests pass using
  local PGlite. These do not claim live multi-connection Supabase testing.
- Production build and lint pass; existing React advisories and large
  Spark/Three chunk warning remain.
- The existing Python-backed World Labs browser suite was not run: this machine
  has Python 3.14 without the backend Python dependencies. Backend code is
  unchanged; all existing frontend unit and local SQL tests were run.
