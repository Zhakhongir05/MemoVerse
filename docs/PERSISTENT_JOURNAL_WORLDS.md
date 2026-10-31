# Persistent on-demand journal worlds — local implementation, not deployed

## Workspace and base

Worktree: `/Users/sujam/Documents/Codex/2026-10-31/referenced-chatgpt-conversation-this-is-an/work/persistent-journal-worlds`
Branch: `codex/persistent-journal-worlds-latest`, based on latest fetched `origin/main` commit `66af11c`.

The team merged additional account generation/viewer functionality during implementation. The final worktree starts at that merge and preserves those features. The earlier prototype on `codex/persistent-journal-worlds` remains local and untouched for recovery. Neither branch was committed, pushed, merged or deployed by this task.

## Reused functionality

Existing Google/Supabase auth, `journal_entries`, private `memory-assets`, Journal creation/editing/date timeline, cloud sync, and local IndexedDB remain in use. Journal saves still never submit a World Labs job. Existing OpenAI/DeepSeek endpoints, furniture catalog, Studio, diorama/sensory renderers and World Labs sample are preserved.

The existing `world_generation_jobs`, `world_generation_demo`, account quota/rate/budget RPCs, provider client and operation parsing are extended rather than replaced. Account/Studio legacy endpoints remain available. The previous independent credit allowance remains retired under migration 009; this feature does not reset usage or create another allowance.

## Endpoints

- `GET /api/journal/{memory_id}/world`: verify the existing Google session and memory owner; return none, submitting, pending, succeeded, failed/expired/unknown or legacy_recovery. Reads never submit provider work. Completed records get fresh one-hour private asset references and asset-existence checks.
- `POST /api/journal/{memory_id}/world`: JSON `{ "photoIndex": 0, "approved": true }`. Reuse any existing binding first, even when new generation is disabled. Otherwise reserve a server-side allowance and bind a job atomically, read the selected photograph from private storage, then submit at most one provider POST. Client image URLs/user IDs/model/budget are not accepted.
- `POST /api/journal/{memory_id}/experience`: validated `{ revision, enhancements, anchors, guidedTour }`. Require a completed owned world, approved furniture catalog IDs, matching world ID, finite/bounded coordinates, unique anchor IDs and owned private narration paths. Revision conflicts return 409 rather than overwriting another device's edits.
- Existing `/api/world-jobs`, `/api/world-account` and `/api/world-config` remain. Reads through the legacy job endpoint redirect journal-bound jobs to saved-state reads, preventing the legacy polling path from marking a journal world completed before archival.

## Durable state and quota

Review-only migration `frontend/supabase/010_journal_world_binding.sql` adds `journal_worlds`, binding a journal entry to one existing account job, selected source-photo metadata, furniture manifest, anchors, guided tour, revision and timestamps. Existing jobs retain provider operation/world IDs, status and generation timestamps. World metadata stores private SPZ/GLB storage paths, never expiring signed URLs as canonical data.

The reservation function locks the existing global budget before the journal row and calls the existing account reservation in the same database transaction. A unique memory primary key and unique job binding prevent duplicate paid submissions. Repeated requests and pending/failed/unknown states reuse the reservation. Three-per-account, global budget, judging window and submission limits remain server-enforced.

Failed or ambiguous submissions keep their allowance/budget reservation until an owner reconciles actual provider billing. There is deliberately no automatic paid retry or refund. A process crash after provider submission but before recording the operation becomes unknown/review-required. Exactly-once provider execution across that failure boundary cannot be promised without provider-side idempotency/reconciliation. This implementation prioritizes never resubmitting ambiguously charged work.

Migration 010 adopts only older journal worlds whose world ID matches the owner's existing server ledger. It schedules archival of that SAME output, not generation. Unmatched older worlds return legacy_recovery and block replacement generation until reviewed. No arbitrary client-supplied legacy world metadata is trusted as ownership proof.

## Worker and storage

Run `python -m backend.world_worker` on a durable worker host. It polls already-submitted jobs and archives the balanced SPZ and collider GLB into private `memory-worlds/<user>/<job>/...`. It never calls worlds:generate. Streaming transfers use bounded temporary disk, deterministic storage paths and existence checks. A world is marked succeeded only after both private assets are accessible. Failed transfers retry the existing job/asset retrieval, not paid submission. An older known world can be recovered directly by world ID if operation polling has expired.

This work must not depend on an in-process Vercel background task surviving after an HTTP response. Provision a worker with suitable disk, transfer time and storage limits. Monitor stale pending/unknown jobs; no automatic billing reconciliation or cross-provider disaster recovery is implemented. Maintain database and Storage backups and an appropriate retention policy.

Private RLS denies anonymous access and other account reads, including soft-deleted parent memories. Browser writes to canonical job/binding state are denied; verified backend RPCs perform ownership checks. Service-role credentials stay server-side. Signed references expire in one hour and are refreshed on reopen and every 45 minutes during long visits. They remain bearer references until expiry; they are not permanent public assets.

The World Labs terms impose documentation/Order Form retention restrictions. `WORLD_ASSET_RETENTION_APPROVED=false` blocks new journal generations and archival until the owner verifies applicable export/retention rights. Setting the flag is an operational acknowledgement, not proof of permission. No legal acceptance, credit purchase or paid call occurred.
Reference: https://www.worldlabs.ai/terms-of-service (sections 2.10 and 3.3).

## Viewer and journey behavior

Journal preparation performs GET-only lookups/polling. A separate explicit consent button is required for generation; the first saved photograph is identified in the UI. Completed worlds show Explore Freely / Take a Guided Journey. Journal rendering receives its own saved asset references, not the sample world's URLs. The existing R3F/Spark viewer, collider rotation, orbit controls, anchors and atmosphere remain in use. Coordinate quality still depends on the generated geometry; no new metric calibration is invented.

Saved manifests and user-adjusted anchor stories/positions are restored. The explicit account-save button persists adjustments. Reopening a saved world does not call furniture AI. The separately labeled sample remains available; it is never presented as a newly reconstructed journal photograph.

Stored three-chapter narration text and owned private audio paths can be saved/replayed without a generation call. Audio requires a user playback click. Existing reading UI remains available when no saved tour exists. This change does not create missing narration, promise synchronized camera choreography, or import the unmerged MemoryCast feature branch. Newly attached anchor photos/audio still live only in the current tab; their durable upload workflow remains incomplete. Persisted narration paths must reference assets already in private `memory-assets` under the same user/memory.

## Verification

- 70 Python backend tests passed, including existing provider/legacy account tests and new authenticated journal route, single-submission, failure, owner, Google identity, private URL, worker completion and streaming-archive tests.
- 86 frontend tests passed, including authenticated requests, GET-only poll/reopen behavior and existing Journal/furniture/scene tests.
- 21 embedded PostgreSQL tests passed in total (14 existing allowance tests and 7 journal binding tests). The actual SQL migrations ran in a disposable PGlite PostgreSQL engine with synthetic Supabase roles. Tests cover one reservation for repeated requests, independent entries, three-slot limits, RLS/account and soft-deletion isolation, private paths, persistence after photo changes, revision conflicts, unknown billing and legacy recovery. PGlite requests are serialized; production multi-connection load/locking tests remain to be performed.
- Frontend production build and lint passed. Existing warnings include large Three/Spark bundles and unrelated lint warnings.
- A real browser tested the final latest-main components through a synthetic Supabase/provider fixture. Explicit submission, refresh, completed-state reopen, existing SPZ+collider rendering (497,664 splats), restored clickable anchor and save confirmation worked. Final counters: one mocked provider submission and one reservation; browser console errors were empty.
- This was a component integration fixture, NOT a live Supabase session or a newly generated world. Existing sample assets were clearly labeled and reused for the rendering test. Private signed asset routes/stream transfers were mocked in backend tests. No live cloud archival or months-long retention claim is made.

## Deployment prerequisites / remaining blockers

1. Review actual existing Supabase schema and migration history; only repository migrations were inspected here. Apply existing 008/009 if needed, then reviewed 010. No migrations were applied to Supabase in this task. Apply the new schema before deploying backend code that depends on its RPCs.
2. Validate the provider account's current Marble API compatibility, export/retention permissions and configured model/credit budget before enabling generation. Existing model/budget defaults are reused, not asserted as current pricing.
3. Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WLT_API_KEY`. Keep `WORLD_GENERATION_ENABLED=false` and `WORLD_ASSET_RETENTION_APPROVED=false` until approved/configured. Enable the existing SQL judging window/budget separately; do not infer permission from credentials.
4. Configure/deploy the durable worker and private Storage capacity, backups and monitoring. Leave generation disabled on previews. Configure explicit CORS origins if the API is hosted separately.
5. Perform an approved live generation/asset-copy test and real two-account Supabase RLS checks before production acceptance. Paid calls remain prohibited for this implementation task.
6. Reconcile legacy/unmatched worlds and unknown billing manually; controlled retry currently means resume/check existing status or owner-led recovery, never another paid submission.

The months-later definition of done is architecturally supported by canonical IDs/private object paths, but **not yet production-verified or complete** until these deployment and live-storage prerequisites are satisfied.

## Run locally

From the final worktree:

```bash
cd /Users/sujam/Documents/Codex/2026-10-31/referenced-chatgpt-conversation-this-is-an/work/persistent-journal-worlds
/Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m uvicorn backend.main:app --port 8000
# Separate terminal; after reviewed database setup and server-only configuration:
/Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m backend.world_worker
# Separate terminal:
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

Local app: http://127.0.0.1:5173/ ; health: http://127.0.0.1:8000/health . Without reviewed Supabase setup, journal generation correctly remains unavailable; it does not fabricate a world or reset allowances.

Tests:
```bash
PYTHONPYCACHEPREFIX=/private/tmp/memoverse-pycache /Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m unittest discover -s backend/tests -q
npm --prefix frontend test
npm --prefix frontend run test:database
npm --prefix frontend run build
npm --prefix frontend run lint
```
