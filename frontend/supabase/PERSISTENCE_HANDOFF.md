# Durable memories: migration and teammate contract

Implementation stays on `feature/frontend`. Nothing here applies SQL, deploys a
function, starts a paid call, or merges a branch automatically.

## Deployment order

1. Review/apply existing migrations 004–007, then `008_durable_worlds.sql` in your
   Supabase SQL Editor as project owner. Back up production before migration.
2. Deploy the updated `generate-memory` Edge Function. Keep its existing JWT
   validation and secrets configuration. Service-role keys stay server-side.
3. Backend teammate must implement the worker contract below before enabling
   `WORLD_GENERATION_UPSTREAM_URL`. The current backend Python files are empty;
   there is no running provider worker in this repository to connect automatically.
4. Keep `generation_budget.max_requests=0` until verified with a stub provider.
   The budget is an additional global cost ceiling; an admin sets it deliberately.
5. Verify private bucket upload limits for your Supabase plan. The migration asks
   for a 1 GiB object limit; project limits may be lower. Use resumable uploads
   for large SPZ/GLB files, never buffer them inside a short-lived Edge Function.

## Backend worker contract (for team review)

The private upstream requires `WORLD_GENERATION_UPSTREAM_TOKEN`. Multipart inputs:
`photo`, `story`, `memoryId`, `userId`, `requestId`. The HTTP `Idempotency-Key`
equals `requestId`. Authenticate this server request; never expose the upstream
as an unauthenticated alternate route to World Labs. All provider entry points
must go through the database reservation, including scripts and other routes.

Durably record request ID → World Labs job ID BEFORE reporting acceptance. Reuse
that job on retries; never submit a second provider request for that request ID.
Return HTTP 202 `{ "jobId": "provider-job-id" }`, or HTTP 200 `{ "world": manifest }`
only after assets are archived. The Edge Function saves provider job ID/status.
For async jobs the worker later calls the service-only RPC:

```
finish_world_generation(p_request_id, p_world)
```

Stream provider assets into the private `memory-worlds` bucket BEFORE their URLs
expire. Use immutable paths `{userId}/{memoryId}/{requestId}/world.spz`,
`collider.glb`, `tour-0.mp3`, etc. Verify download success, size and checksum;
only fetch trusted provider HTTPS URLs, with redirect/host checks. Archive the
actual bytes, not the provider's expiring URL. Do not mark ready if archiving
fails. Retry the archival step from the SAME provider job. A storage retention
policy or lifecycle cleanup must not remove referenced assets.

`functions/_shared/archive-world.ts` supplies a server-only streaming uploader:
`archiveWorldAsset({url,format}, name, options)` returns the private reference.
Pass an administrator-maintained exact public provider hostname allowlist and
server credentials. Redirects, empty files and oversized assets are rejected.
It uses unique immutable filenames, so retry-created orphan objects can be
garbage-collected only after checking all committed manifests. Reuse recorded
references on retry. For assets exceeding Edge runtime limits, run this adapter
in a long-lived worker or use the team's resumable uploader instead.

Manifest shape, using the existing enhancement contract (radians, asset units):

```json
{
  "id": "world-labs-world-id",
  "providerJobId": "world-labs-job-id",
  "assets": {
    "splat": { "bucket": "memory-worlds", "path": "USER/MEMORY/REQUEST/world.spz", "format": "spz", "sha256": "..." },
    "collider": { "bucket": "memory-worlds", "path": "USER/MEMORY/REQUEST/collider.glb", "format": "glb" }
  },
  "enhancementResponse": { "worldId": "world-labs-world-id", "enhancements": [] },
  "guidedTour": {
    "script": "The full generated narration",
    "anchors": [{ "id": "lamp", "position": [0, 1, -2] }],
    "chapters": [{ "id": "arrival", "title": "Home again", "text": "Welcome back", "anchorId": "lamp", "audioAssetIndex": 0, "cameraPose": { "position": [0, 1, 0], "target": [0, 1, -2] } }],
    "audioAssets": [{ "bucket": "memory-worlds", "path": "USER/MEMORY/REQUEST/tour-0.mp3" }]
  }
}
```

`fullResolution` is an optional additional asset key. `splat` is required by the
current Spark viewer; a GLB-only visual world needs a separate viewer adapter.
`collider` is optional. Do not substitute collider geometry for a visual world.
The finalizer checks asset existence and ownership paths, writes journal.world
and request.result in ONE transaction, and adds schemaVersion/status/revision.
Retries return the saved result. Ordinary journal sync cannot replace it.
Legacy provider-URL worlds remain legacy: they need explicit archival while URLs
still work; the app cannot recover already expired files without provider access.

## Failure/recovery and credits

Three free lifetime credits are initialized per verified Google subject and
Supabase user ID. Account row locks serialize reservations across memories;
the memory lock prevents duplicate in-flight requests even with changed photos.
Paid packs still add 15 for a verified ₩10,000 payment; mock checkout grants none.
Deleting a memory does not refund a generation. Existing-world reads cost none.

Worker calls `fail_world_generation(requestId, true)` ONLY after verifying that
the provider did not charge/create a world. The refund is atomic and idempotent;
the same photo can then get a new reservation. Confirmed charged failures should
remain under support review. Timeouts are NOT proof of failure: use `false` to
mark recovery_required while retaining the reservation. A scheduled trusted
worker must reconcile submitted/processing/recovery_required jobs by persisted
job ID or request idempotency key, archive their existing assets, then finalize.
If the provider cannot resolve an ambiguous submission by idempotency key, stop
for support review instead of issuing another paid request. Browser polling
does not perform reconciliation and stops after 15 minutes; reopening is safe.

## Frontend and 3D handoff

`ArchivedWorldViewer` signs private assets on entry and refreshes after 45 minutes.
`WorldLabsViewer` now accepts an optional `world` input and emits exact transforms
via `onEnhancementsChange`; existing static demo remains the default. Rendering,
Spark and R3F engine logic are retained. Edit mode enables the existing transform
gizmos. Save object placements calls `save_world_customizations`, with optimistic
revision checking; saved anchors become `none` so reopening cannot reground them.
Tour chapters and recorded narration replay from saved data. Camera poses/anchors
are retained for the team's JourneyController; automatic synchronized movement
is not implemented or claimed by this change.

The service `saveWorldCustomizations` also accepts an updated tour manifest for
the future tour editor/worker. Audio assets must already exist in private storage.
No narration generation or paid API is called while reopening.

## Required staging checks before enabling paid generation

Use a stub upstream and test accounts, not real paid provider requests:

- Four parallel distinct-memory reservations for one Google user: exactly three
  created; fourth rejected; account.used=3. Repeat same memory concurrently with
  different fingerprints: one reservation only.
- A second user cannot read/update another journal, job, object or customization.
  Authenticated clients cannot run reserve/finalize/refund/payment RPCs.
- Timeout after submission: request stays reserved; retry returns the same ID.
  Reconcile and finalize twice: one world, unchanged usage. Missing archived file
  makes finalization roll back both world and job updates.
- Confirmed unbilled failure twice: one refund. Retry same source: new request.
- Save transformations, refresh, reopen on another device: identical positions,
  rotations/scales. Stale revision save returns WORLD_CONFLICT_RELOAD.
- Expire signed URLs and reopen: fresh URLs, zero provider calls. Guided script,
  chapters, anchors and recorded audio remain available.

Local Node tests cover URL resolution, exact transforms, conflict handling,
chapter preservation and read-only polling. Live SQL concurrency/RLS checks and
Edge runtime verification require a configured staging Supabase project; they
are not replaced by the frontend build.
