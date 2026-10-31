# MemoryCast backend handoff

Implemented on `feature/memorycast-guided-tours`, based on the latest integrated `sujamahat/MemoVerse-1` application at `20b7ac9`. Main remains unchanged and its PR gate remains unresolved. Local verification was repeated before the user-authorized feature-branch commit/push. No live migrations, manual deployments or paid provider calls were made for MemoryCast.

## Existing functionality inspected

- Supabase Google authentication and `auth.users.id`; existing backend verifies the current Supabase access token through Auth. No new authentication system.
- `journal_entries`, private `memory-assets`, journalCloud sync and owned journal photos/world JSON in the existing Supabase project.
- ImmersiveMemory has a guided-reading panel and a JourneyController extension point, but no saved AI voice pipeline.
- WorldLabsViewer already owns camera controls, ambience and tab-local anchors. Sensory has browser speech synthesis; this is not persistent OpenAI narration.
- Existing backend uses OpenAI and DeepSeek through Lablup, with provider retries disabled. Those clients/settings are reused.

The user's follow-up narrowed implementation to the backend. **No frontend component, player, camera, speech-to-text, journal UI or authentication implementation was changed.** The SQL migration lives under frontend/supabase because that is the repository's existing database-migration directory.

## Implemented backend

Authenticated APIs load only an owned, non-deleted saved memory. They analyze saved private photographs through the existing OpenAI vision client, use the existing DeepSeek/Lablup model to select meaningful excerpts and existing anchors, create Arrival/Rediscovery/Reflection metadata, synthesize each chapter with OpenAI text-to-speech, and persist WAV audio in private Supabase Storage.

Personal narration is deliberately constrained: DeepSeek selects exact journal/anchor excerpts; the server checks those against saved sources and combines them with safe mood-directed arrival/reflection transitions. Arbitrary model prose, unknown anchors, invented coordinates and unsupported quotes are rejected. Photo observations guide attention but are not accepted as invented personal history in spoken narration. This is evidence-based composition rather than unrestricted fictional storytelling.

Each chapter returns `order`, `title`, `narration`, identical chapter-level `subtitles`, `anchor_id`, `camera`, `ambience` and evidence references. Camera targets come only from validated saved positions; missing anchors use central fallback poses matching the existing renderers. No new objects, World Labs worlds or furniture are generated.

The Speech API uses `gpt-4o-mini-tts`, `coral`, warm delivery instructions and WAV output. WAV structure, size and actual sample duration are checked before storage. Audio keys remain server-only; the browser receives short-lived playback URLs, not provider keys or service-role credentials. Include the returned `AI-generated narration` disclosure in the future player.

Official API references:
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create

The official reference currently announces January 6, 2027 shutdown for this Speech API model. It is still available for the 30-day judging period beginning in late October 2026; review the model/API before extending the service beyond that period. Cached narration remains playable independently of provider/model availability.

## API contract for the frontend teammate

All endpoints require `Authorization: Bearer <existing Supabase user access token>`. Never send a service-role key or provider key from the browser. API bodies do not accept client-selected owners, arbitrary TTS text or model-supplied coordinates.

1. `GET /api/memorycast/memories/{memory_id}`
   - No AI calls, including on cache misses.
   - Returns `{tour, stale, generation_enabled, previous_ready_tour_id}` when a tour exists; `tour:null` otherwise.
   - Saved tours include script, status, progress (`next_step`, `total_steps`), immutable audio paths and actual audio durations. Ready tours also include three `audio` records with `order`, `url`, `expires_in:900`, and `duration_seconds`.
   - Omitted language reuses the saved tour language. Optional `?language=en|ko` checks staleness against that selection. `?tour_id=<owned saved tour>` reopens an older version.
   - Refresh this endpoint for fresh private playback URLs after expiry. A stale tour can still be replayed without new AI calls.
2. `POST /api/memorycast/memories/{memory_id}`
   - Body: `{"approved":true,"language":"en","regenerate":false}`.
   - Call only after the user's Begin Guided Journey generation action/consent. The memory must already be synced into the existing database.
   - Returns HTTP 202 `{tour,fresh}`. Repeated unchanged requests return the same job, reserving no additional job or provider work.
   - Edited memory/language requires explicit `regenerate:true`; otherwise HTTP 409. The old tour and audio are retained.
3. `POST /api/memorycast/tours/{tour_id}/advance`
   - Performs at most one durably leased step: one saved-photo analysis, the three-chapter script, or one narration chapter.
   - Photos are analyzed one per step; there are `photo_count + 4` steps, maximum ten.
   - Returns `{tour,advanced}`. If another request owns the lease, `advanced:false` means wait/poll this job; do not submit another job.
   - Use serial requests, with a normal status check or a short delay between steps. Do not use browser timers to assume completion.
4. Poll the GET endpoint at reasonable intervals (e.g. 3–5 seconds while pending). When `status:ready`, obtain the ready response's signed URLs.
   - `failed` and `uncertain` are terminal for automatic processing. Show the message and retain the job ID for owner review. Never automatically create a replacement charged job.
   - Expired leases become `uncertain` even with status-only polling; a server interruption cannot cause an automatic paid retry.

An example completed chapter:

```json
{
  "order": 2,
  "title": "Rediscovery",
  "narration": "...verified journal excerpt...",
  "subtitles": "...same chapter narration...",
  "anchor_id": "desk-1",
  "camera": {
    "position": [0.25, 0.1, 0.45],
    "target": [1, 0, -2],
    "transition_seconds": 2.5,
    "mode": "look-at"
  },
  "ambience": {"cue": "quiet", "volume": 0},
  "evidence": [{"source_id": "journal:story", "quote": "...exact saved excerpt..."}]
}
```

The future frontend should transition/highlight the validated anchor, start voice only after the user's playback action and camera readiness, advance on the audio element's real `ended` event, and use real `timeupdate`/duration events for progress. Pause/skip/exit must cancel the prior audio and camera movement. Those player/controller changes were intentionally left to the teammate, per the user's instruction.

Anchors are read from saved `world.memoryAnchors`, `world.anchors`, or validated `scene.objects`. Tab-only anchors that were never saved are not invented or exposed as server targets. Save existing anchor metadata through the current journal integration before requesting a tour. Positions must be three finite numbers within [-20,20]; IDs must be bounded safe identifiers. With no anchors the API returns null anchor IDs and safe fallback targets. Renderer collision checking and smooth camera implementation remain frontend integration work.

Narration supports `en` and `ko`. Journal text and actual photo content affect the persistent fingerprint; timestamps and ordinary cloud sync alone do not invalidate it. Text-only and photo-only saved entries are supported; private photos are limited to 10 MB each and the existing image validator bounds dimensions and rejects corrupt/animated files. No uploaded audio is transcribed.

## Supabase persistence and deployment

Migration: `frontend/supabase/010_memorycast.sql`. Apply once to the **existing** Supabase project after inspecting its current migration state. It assumes the existing journal/auth/storage schemas and does not recreate or replace them.

Adds:
- `memorycast_tours`: owned memory ID, immutable input fingerprint and snapshot, script/chapters, language/mood, audio paths/durations, generation status/progress, durable provider-step lease and timestamps.
- `memorycast_settings`: disabled by default, daily new-tour caps and concurrent provider-step cap.
- Private `memorycast-audio` bucket, bounded to WAV objects up to 8 MB each.
- Service-only reservation/claim/finish RPCs and owner-readable tour rows; browser roles cannot create jobs, modify results, change caps or upload/overwrite narration.
- Storage reads require an owned ready tour and non-deleted owned journal memory. Signed links last 15 minutes and are refreshed without AI calls. Soft-deleted entries cannot obtain new playback links; an already issued signed link can remain usable until expiry.

This migration was tested with PostgreSQL/PGlite, not applied to the live database. PGlite queues concurrent statements on one connection, so the tests verify actual SQL locks/uniqueness and race outcomes but do not claim multi-connection production load testing.

Use existing backend-only credentials:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`, existing `OPENAI_MODEL`
- `DEEPSEEK_API_KEY`, existing `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL=https://api.console.lablup.ai/v1`
- New `MEMORYCAST_LIVE_ENABLED=false` by default

Real generation needs explicit approval, configured existing clients (`DEMO_MODE=false`), the MemoryCast environment flag enabled, and `memorycast_settings.enabled=true`. Saved ready tours still replay if generation is later disabled or provider keys are unavailable. Do not enable real providers in mocked tests or previews by accident.

Default limits are ten new tour jobs globally per UTC day, three per account per UTC day, and two in-flight provider steps. Same-input retries reuse their job. Each new job has at most six vision calls, one Lablup call and three TTS calls; a normal one-photo tour has five provider calls. Each generation step has a 30-second processing deadline (plus bounded authentication/claim/finish requests) for the existing 60-second serverless function limit; no in-process background task is relied upon. A lost/uncertain provider step requires review rather than a potentially duplicate charge. These caps do not deduct or replace the separate three-world World Labs allowance.

Audio paths are immutable and scoped as `<user>/<memory>/<tour>/<chapter>.wav`. Old versions and partially uploaded files are retained for recovery; automated orphan cleanup/deletion is not implemented. Do not clear leases or recreate failed jobs without first reviewing possible provider billing.

## Tests and local commands

Run from `/Users/sujam/Desktop/MemoVerse/memorycast` with the existing Python environment. Node dependencies are development/test tooling only; no production Python dependency was added.

```sh
npm ci --prefix frontend
/Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m unittest discover -s backend/tests -q
node --test backend/tests/memorycast_database.test.mjs
MEMOVERSE_TEST_PYTHON=/Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python frontend/node_modules/.bin/playwright test --config backend/tests/memorycast.playwright.config.mjs
npm test --prefix frontend
npm run test:database --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

For normal backend development, load approved local server configuration and run `python -m uvicorn backend.main:app --reload`. Keep MemoryCast disabled unless a paid test has been explicitly approved. Do not send real data to the test fixture servers. The browser fixture includes a small test-only audio element to validate the backend's response; it is not an application frontend/player implementation.

Verification:
- 72 Python backend tests passed, including 20 MemoryCast tests.
- 9 MemoryCast PostgreSQL migration/ownership/lease/Storage tests; 14 existing world-allowance SQL regressions.
- 74 existing frontend unit tests passed.
- 2 backend-only browser/API tests passed: private synthetic WAV decoding/playback, exact anchor/subtitle metadata, saved-tour replay across reload/new browser context without additional AI calls, account isolation, explicit regeneration and old-tour retention.
- Existing lint exits zero with existing React advisories; production build succeeds with the existing large Spark/Three chunk warning. No warning threshold was changed.
- Python module compilation and git diff checks pass. Frontend components, dependency manifests and lockfile are unchanged.

Actual natural-voice quality, live provider availability and live Supabase configuration have not been tested; all automated provider results and audio are synthetic. A controlled real one-photo test needs migration/configuration and separate approval for one vision, one Lablup and three TTS calls. End-to-end player/camera synchronization remains the frontend teammate's work, not a completed user-facing feature in this backend-only delivery.

## Exact files changed

- `backend/.env.example`
- `backend/main.py`
- `backend/memorycast.py`
- `backend/memorycast_provider.py`
- `backend/memorycast_schema.py`
- `backend/memorycast_store.py`
- `backend/tests/memorycast.browser.spec.mjs`
- `backend/tests/memorycast.playwright.config.mjs`
- `backend/tests/memorycast_database.test.mjs`
- `backend/tests/memorycast_database_fixture.mjs`
- `backend/tests/memorycast_fixture_server.mjs`
- `backend/tests/mock_memorycast_server.py`
- `backend/tests/test_memorycast.py`
- `docs/MEMORYCAST_BACKEND.md`
- `frontend/supabase/010_memorycast.sql`
