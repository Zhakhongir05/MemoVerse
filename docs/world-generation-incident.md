# World generation incident — 2026-11-01 (Asia/Seoul)

Production inspected: `dpl_3b47iyiknfnqDjqHkqWskD2Heahm`, source `66af11c2dda60ac395dc4aca3f754fdd6a54e814`.

## Evidence

Supabase `world_generation_jobs` contains:

| Job | Created (UTC) | Updated (UTC) | State | Operation/world | Reserved credits | Journal link |
| --- | --- | --- | --- | --- | --- | --- |
| `08d4a557-1ead-4608-98a0-0a991ef77394` | 2026-10-31 15:24:48.717558 | 15:24:49.574049 | unknown | both NULL | 500 | NULL |
| `17793d74-6ae3-4582-a013-93f9504394c8` | 2026-10-31 15:29:50.659784 | 15:29:51.43423 | unknown | both NULL | 500 | NULL |

Vercel runtime logs show World Labs `worlds:generate` returned HTTP 422 at **00:24:49.30 KST** and **00:29:51.17 KST**. Both were followed by successful `mv_world_finish` HTTP 200 writes. Neither function timed out. The old exception handler turns all provider errors into `unknown` and intentionally retains the reservation, so polling never starts.

The deployed request includes the raw job UUID as a tag (36 characters). World Labs documents a maximum of 32 characters per tag. The original response bodies were not logged, so the precise validation field cannot be retrieved retrospectively; the invalid tag is independently present in deployed source. New requests use the 32-character compact UUID, and safe validation field locations are retained on rejection.

Read-only provider history returned exactly two earlier successful worlds: `4fad570a-957c-43a7-b7c9-150945606413` (06:09:26 UTC) and `dbd27873-f16b-4f71-b40c-3a27b7fa6d6d` (15:01:54 UTC). Neither corresponds to either failed job. The provider credit balance was **6,540**. The failures were validation rejections, with no generation operation or world to recover. A transaction-by-transaction billing ledger has not yet been verified.

Live health checks: `/api/health` 200; `/api/world-config` 200, enabled, limit 3; unauthenticated `/api/world-account` 401.

## Implementation

- Preserve the existing journal, authentication, viewer, and teammate worktrees. This isolated branch includes the previously uncommitted journal-linking fix, without changing its source worktree.
- Atomically persist the reservation and immutable input before returning HTTP 202. A separate short dispatch request claims the job once and submits one provider request.
- A Supabase minute scheduler invokes the worker using an unguessable token scoped to one job. It never receives a service-role key. The actual generation runs in World Labs; each Vercel invocation performs bounded dispatch or polling work.
- Save operation IDs, retain uncertain submissions, and reconcile lost responses through exact provider tags without another paid submission.
- Distinguish confirmed HTTP rejections from ambiguous transport/5xx errors. Release allowance and global credit reservation exactly once only for confirmed pre-generation rejection.
- Atomically link generated SPZ/collider URLs and the authoritative world ID to the journal in Supabase. Protect paid results from stale browser sync. Reopening uses the saved world and does not reserve or submit again.
- Render the selected generated world, never silently substitute the hardcoded bedroom.

## Verification

- Backend HTTP/provider tests pass, including real mocked HTTP 422 parsing and ambiguous timeout/5xx handling.
- 22 PostgreSQL migration/accounting/dispatch/scheduler tests pass.
- 84 frontend unit tests pass; production Vite build passes (existing large-bundle warning).
- Three mocked browser tests pass: new world renders; refresh resumes with exactly one provider submission; journal Relive renders the generated world and subsequent revisits remain free.
- No new paid production generation has been submitted.

## Release order and remaining checks

1. Verify installed database functions/schema and apply journal-linking migration 012 only if absent. Apply 013 for durable dispatch and accounting.
2. Reconcile each historical rejected row with the observed 422 evidence. Preserve every record; use the guarded rejection transition to restore each confirmed unsubmitted reservation once. Do not reset account usage or release uncertain charges.
3. Deploy the tested branch to `memoverse05`, preserving current configuration and secrets. Apply 014 to enable the minute scheduler, then verify cron runs and worker responses.
4. Verify billing history. Confirm a single controlled image generation costs **230 World Labs credits** on `marble-1.0-draft` (current configured reservation is conservatively 500; reservation is not the billed cost).
5. Run one authorized photograph generation after reconciliation, verify exactly one provider operation and one 230-credit debit, verify the correct world renders, then reload and verify the same Supabase metadata/world without another charge.

Documentation: https://docs.worldlabs.ai/api/reference/worlds/generate, https://docs.worldlabs.ai/api/pricing, https://supabase.com/docs/guides/database/extensions/pg_net.
