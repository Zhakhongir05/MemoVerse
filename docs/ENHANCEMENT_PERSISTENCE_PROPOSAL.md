# Enhancement persistence — proposal only, awaiting review

No migration has been created or applied. No Supabase schema, policies, accounts or production environment settings were changed.

## Existing ownership model

Journal uses `journal_entries(id,user_id,photos,scene,world,updated_at,deleted_at)` with owner-only SELECT/INSERT/UPDATE RLS. Photos are private Storage assets under owner/entry paths, downloaded as Files into IndexedDB. Memory Studio's separate library uses `memories`, also owned through `user_id`. A Studio memory ID must not be treated as a Journal entry ID.

## Proposed additive table

Recommend `memory_enhancements`, without changing the existing memory/scene JSON contract:

| Field | Proposed type / meaning |
|---|---|
| id | UUID primary key |
| user_id | UUID referencing auth.users; authenticated owner |
| journal_entry_id | Nullable UUID FK to journal_entries(id), ON DELETE CASCADE |
| studio_memory_id | Nullable UUID FK to memories(id), ON DELETE CASCADE |
| world_id | Bounded text; actual mounted World Labs world ID |
| manifest | JSONB; validated approved furniture manifest, no arbitrary URLs |
| status | pending / generating / ready / failed / superseded |
| adjusted_transforms | JSONB sparse per-object position/rotation/scale overrides |
| input_fingerprint | Hash of photo bytes, story, world, catalog/schema version |
| revision | Integer for optimistic concurrency |
| updated_at | Server-controlled timestamptz |

Exactly one parent ID must be non-null. Each is the memory ID for its respective source. Use partial unique indexes on (user_id,journal_entry_id,world_id,input_fingerprint) and (user_id,studio_memory_id,world_id,input_fingerprint). Do not allow parent/owner reassignment on update. Bound JSON size/object count and validate asset/type/finite transforms in application code as well as basic database JSON structure checks. Reject unknown override object IDs. Keep applied overrides in the canonical returned manifest to avoid double transforms.

If the team chooses to retire one of the two existing memory stores later, the two-parent layout can be simplified then; this change should not silently migrate or conflate them.

## Required RLS behavior

Enable RLS and revoke anonymous access. For authenticated SELECT, INSERT, UPDATE and DELETE require BOTH:

1. auth.uid() equals user_id.
2. The selected parent exists and is owned by auth.uid(). For journal parents also require deleted_at IS NULL.

Use USING and WITH CHECK on UPDATE; checking user_id alone is insufficient because a caller could reference another user's parent. Ensure soft-deleted Journal entries become unreadable through the child policy. Hard parent deletion should cascade. Enforce immutable parent/owner binding in the reviewed database design. Server-generated timestamps/revisions prevent browser-forged ordering.

Use the existing authenticated Supabase session for writes so RLS runs. Never expose a service-role key. If a backend persists on behalf of a user, verify their session and parent ownership and preserve user-scoped authorization; a service-role client would bypass RLS. Before enabling paid generation with persistent jobs, verify ownership before provider work, not only before saving the result.

## Proposed integration after review

On Relive, fetch an owned ready manifest matching memory/world/fingerprint. Apply validated saved overrides and reuse it without generation. Only request new work for a changed input or an explicit regenerate action. Persist a ready result and user calibrations with revision matching. Store failure codes, not raw provider errors or private image URLs. Debounce calibration writes and show unsaved/retry status; do not overwrite a newer revision from another device.

## Implemented interim behavior

This branch uses a separate local IndexedDB cache, scoped by account (or local-device guest), memory ID (or Studio input fingerprint), mounted world, photo-byte hash and story hash. Signed URLs and photo bytes are not cached there. Final rendered placements/rotations/scales are saved and restored with anchor=none to prevent automatic re-snapping. Photo changes, world changes and account changes invalidate reuse. Sample furniture is never cached as AI output.

This is device-local persistence, not cloud sync or an RLS security guarantee. Existing journal/cloud code and tables are untouched. Clearing browser storage removes it. Another device cannot restore these placements until the reviewed Supabase schema/integration is implemented. Currently a readable photograph is needed to establish the content hash before a cache lookup; an expired external link is shown as an error and must be refreshed, rather than reusing potentially mismatched furniture. Persisted Journal Files work offline for hashing, but the splat viewer still needs its assets.

## Review checklist before any migration

Confirm the two parent tables, uniqueness/version rules, deletion handling, world identity, manifest/override bounds, two-account isolation (including forged parent IDs and updates), expired sessions, anonymous denial and concurrency behavior. No live RLS test is claimed in this implementation.
