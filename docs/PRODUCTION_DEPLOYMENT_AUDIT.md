# Production deployment audit — 2026-11-01 KST

The production domain `https://memoverse05.vercel.app/` belongs to Vercel project
`memoverse05` (`prj_HGaZDDWd8oAaHYLA6yc6Ug56LNJh`) in
`sujamahat83-9625s-projects`. Its GitHub integration is
`sujamahat/MemoVerse-1`, production branch `main`.

At audit time, production deployment `dpl_HZ67m4w9nKJX87uEkSWGoAXhDDfu`
was built from `4500a7ce1bfcdffade6f981d7672963c6009ae30`, exactly the current
GitHub main head. The build log records cloning main and rebuilding Vite;
production's `index-CCBLD5uT.js` and `Journal-Bh1BfXW6.js` match that build.
No second MemoVerse project exists in the accessible Vercel account.

The discrepancy was missing integration, rather than an incorrect production
branch: `feature/frontend` held the newer journal home and speech input, while
`codex/fix-memorycast-readiness` held readiness messages, retries and narration
anchor controls. Those branches had preview deployments in the same project.
`feature/memorycast-guided-tours` also had a later revert of its journal refinement.

## Correction

The integration is based on the audited main head. It carries the MemoryCast
fix from `7762bc3`, preserving main's newer furniture proposal behavior, and
selectively carries the journal home/speech components from frontend `f56daa0`
(including `eeb52db`). Existing Google and email login remain available. Home
world links resolve the authoritative journal/world binding before opening.
Podcast controls open saved entries without submitting generation requests.

Vercel configuration, domain, Git integration, production branch, environment
variables, database migrations, journal persistence and saved-world identifiers
are unchanged. No production database writes or provider generations are needed
for this release. Browser and provider checks use isolated synthetic fixtures.

## Verification and rollback

Run the existing CI workflow: Python backend tests and renderer contract;
frontend unit/database tests, lint and build; production-build world browser
regressions. The separate `frontend/speech.playwright.config.mjs` exercises
compiled HTTPS speech with mock recognition and verifies reload persistence.

After merge, confirm the production alias's recorded Git SHA equals GitHub main,
the build succeeds, served asset names match its build log, `/health` and
`/api/health` succeed, and private MemoryCast routes reject unauthenticated reads.
MemoryCast creation additionally requires database enablement, server enablement
and provider configuration; the UI now distinguishes these conditions.

The pre-release rollback deployment is `dpl_HZ67m4w9nKJX87uEkSWGoAXhDDfu`
(source `4500a7ce1bfcdffade6f981d7672963c6009ae30`). Rollback must retain the
same project and existing data; never reset Supabase or switch feature branches
into production to resolve a UI discrepancy.
