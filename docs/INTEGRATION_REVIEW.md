# MemoVerse-1 main integration — 2026-10-31

Repository: https://github.com/sujamahat/MemoVerse-1 . Integration branch: integration/all-feature-branches, based on a02496b from this repository's main. Work in other local worktrees was left untouched.

## Branches included

| Branch | Reviewed tip | Functionality retained |
| --- | --- | --- |
| feature/frontend | de9fdce | Latest journal, timeline, Google authentication, guest navigation fix, plans, photo allowance information and mock paid checkout |
| feature/hybrid-ui | 7e03ed7 | Latest uploaded-photo furniture proposals, bounding-box fit and collider grounding |
| feature/ai-backend | 24b335a | Validated AI scene and furniture manifest endpoint |
| codex/production-image-worlds | 6c7b56d | Production provider/API fixes, asynchronous jobs, dynamic generated-world assets, server-enforced three-world quotas, budget and rate limits |
| feature/3d-world | 4ef1805 | Complete grounded diorama preserved in frontend/src/diorama |
| feature/sensory | 24b094c | Photo-depth renderer, speech tour and hotspots preserved in frontend/src/sensory |
| codex/immersive-memory-experience | 890a6e9 | Immersive World Labs viewer, symbolic scene integration and feasibility/verification documentation |

The frontend, hybrid and AI branches were already ancestors of a02496b. The remaining branch histories are incorporated through merge commits, with functionality reconciled rather than overwritten.

## Conflict decisions

Keep the existing Supabase authentication/database, latest guest-login fix, journal persistence and latest frontend layout. Connect placeholder scene generation to the strict production backend. Pass generated assets into the existing World Labs viewer instead of always opening the saved sample. Retain the latest hybrid photo-proposal and bounds fitting implementation, while sample furniture is never injected into a newly generated world by default. Preserve the production glTF collider coordinate correction; raw splats receive capture-frame rotation but glTF colliders are already Y-up.

Keep the sensory and grounded diorama renderers as clearly labelled alternatives; do not replace the World Labs viewer or weaken backend scene validation with an incompatible sensory schema. Preserve the seven strict symbolic object types and honest provenance/errors. Photo-depth previews are not labelled as true reconstruction.

The newest frontend introduced another allowance/Edge Function implementation. Plans, photo information and generation controls now read one backend account ledger. Preparation requires explicit generation consent and never invokes a paid provider merely by opening a journal entry. The old Edge Function is a no-charge 410 compatibility response, preventing independent allowances/providers. Historical legacy usage is retained by migration 009 rather than reset. The paid pack remains a local mock checkout: no real payment, allowance grant or provider job occurs after simulated success.

## Database and deployment prerequisites

No live migration or provider call is part of this integration. Reuse the existing Supabase project. Retain journal migrations 002–006 and existing 007_generation_credits.sql. Apply 008_world_generation_allowance.sql and 009_unify_generation_allowance.sql after inspecting existing migration state. If a separately numbered world-allowance migration was already applied, do not run its create statements blindly again; reconcile the existing objects first.

Migration 009 copies historical legacy usage into conservative held reservations and disables generation when such usage exists. Completed journal worlds remain accessible. Reconcile historical operation IDs/billing before enabling new submissions. If the old generate-memory Edge Function is deployed, deploy its retirement and remove legacy upstream configuration. Neither Edge Function deployment nor database application was performed here.

Required backend-only variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WLT_API_KEY, WORLD_GENERATION_ENABLED, plus existing OpenAI/Lablup settings. Retain existing frontend public Supabase URL/publishable key. Configure judging dates (maximum 30 days), budget and rates in world_generation_demo. Defaults remain disabled. No shared generation codes or provider keys enter browser code.

The existing Vercel project's earlier read-only audit linked it to sujamahat/memoverse05 rather than this repository. No Vercel connection or deployment was changed. A GitHub main update is not evidence that memoverse05.vercel.app has been deployed from it.

## Build warnings

The unsupported npm cache-dir value originates from build environment configuration; the source of its upstream injection was not proven. Vercel install/build commands remove only the two legacy npm cache-dir environment names before npm starts. The valid cache setting and secrets remain untouched. Spark and Three.js are lazy, separately cached chunks; journal and alternate renderers are also lazy. The default chunk-size warning threshold remains unchanged. Large third-party dependencies still emit nonfatal size warnings. Lint reports React lifecycle/ref advisories, with zero errors.

## Validation

52 backend tests; 74 frontend unit tests; 14 real PostgreSQL-engine migration/quota tests including full legacy migration and retirement; 12 cross-language furniture contract tests. Production build succeeds. Final production-browser results and main-ancestry verification are appended after completion. Browser tests use synthetic images/assets and local mocked Supabase/World Labs responses, never real Google OAuth, provider calls or payments. PGlite's simultaneous tests queue on a single connection; real multi-connection staging stress testing remains a future validation item.

Remaining operational limits: the database/configuration and a separately approved controlled provider test are required before claiming live generation. Mock checkout is not a real paid plan. Browser tests validate UI/contracts with synthetic assets, not production reconstruction quality.

Final production-build browser result: **9 passed**. Includes new generation/progress/assets, resume, exhausted free revisits, account switching, failed-job retention/sample loading, Google login, journal consent, mock paid checkout with unchanged real allowance, guest navigation and both alternative 3D renderers.
