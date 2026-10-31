# MemoVerse: three free worlds per existing account

## Status and inspected technology

Implemented locally on `codex/production-image-worlds`, based on commit `20081fa`. Changes are uncommitted and unpushed. No paid World Labs calls, credit purchases, migration application to the existing project, merges, or deployments occurred.

Repository inspection confirms Supabase Auth with Google OAuth and Supabase-managed PostgreSQL. This is evidenced by `frontend/src/ui/AuthGate.jsx` (`signInWithOAuth({ provider: 'google' })`), `supabaseClient.js` (`@supabase/supabase-js`), `memoryStore.js` (existing `memories` and private `memory-assets` bucket), and `frontend/supabase/schema.sql` (`memories.user_id` references `auth.users.id`). The newer `origin/feature/frontend` commit `65a5e80` was inspected; its authentication/schema files are unchanged. No teammate furniture or renderer changes were merged or overwritten.

The quota identity is the existing Supabase `auth.users.id` returned by the Auth server for the user's existing access token. It is the same `user.id` already used for saved memories, including Google-linked accounts. No new login, anonymous session, visitor-cookie identity, account table, Redis database, or replacement database is introduced. The earlier anonymous-session/storage draft was removed before it was committed or deployed.

## Account and billing behavior

Every registered account starts with 3 available new jobs without a backfill: remaining allowance is `3 - count(owned world jobs)`. Existing saved samples do not consume an allowance. No allowance is stored in localStorage, browser cookies, JWT custom claims, or an in-memory counter.

1. The browser obtains its current access token through the existing Supabase client's `auth.getSession()`.
2. FastAPI verifies that token against the existing project's `/auth/v1/user`; it does not trust a caller-provided user ID or decode an unverified JWT for authorization.
3. A backend-only database function locks the global budget row, checks duplicate submissions, dates, account count, rates, global spending and concurrency, and inserts a job plus its credit reservation in one PostgreSQL transaction.
4. Only a confirmed `fresh: true` result allows one World Labs POST. No paid POST is automatically retried or redirected.
5. Jobs store the account ID, idempotency hash, operation ID, status, world ID, asset metadata, reservation cost, timestamps, expiry and poll lease.
6. Failed, expired, uncertain and interrupted submissions retain their allowance and credit reservation. No automated refund is assumed. Any manual correction requires owner verification of provider billing; no refund API is exposed.
7. A duplicate photo/story submission for the same account returns its existing job, including when allowances are exhausted or the judging period has closed. It does not reserve another slot or charge again.
8. Completed-world reads and revisits do not invoke reservation or consume an allowance. Normal read rate limits still apply. Assets remain subject to the provider's availability; their metadata and world IDs persist in the existing database.

Deleting an Auth user cascades that user's job/rate records, consistent with the existing ownership model; the global reserved-credit total does not decrease. Recreating an account creates a different Auth user ID. The global cap continues to protect credits. No per-human identification beyond the existing registered user ID is claimed.

## Required additive migration

Apply `frontend/supabase/008_world_generation_allowance.sql` **once, to the existing Supabase project**, after review and deployment approval. It is transactional and intentionally does not recreate or replace the project. Do not rerun it as a reset. Review live-schema drift before applying; only the repository schema and isolated test schema were inspected.

It adds only:

- `public.world_generation_jobs`: owned persistent job/reservation history. This doubles as the per-account allowance ledger, avoiding a redundant user counter table. A unique `(user_id, submission_hash)` prevents duplicate reservations.
- `public.world_generation_demo`: one global settings and reserved-credit row. Initial state is disabled, with no dates and zero credit budget.
- `public.world_generation_rate_windows`: persistent per-account fixed-minute request counters.

The new tables enable RLS and revoke access from browser roles. New functions use a fixed search path and fully qualified objects. Only `service_role` can execute the account/config/reserve/poll/finish entry points. The browser cannot call them to choose a different account, edit a job, increase its allowance or change the budget. Existing `memories`, Storage policies, Google OAuth settings and `auth.users` definitions are unchanged.

The reservation transaction serializes on `world_generation_demo ... FOR UPDATE`; an additional unique constraint protects account/submission idempotency. Polling locks each owned job and uses a 55-second lease so concurrent/stale pollers cannot overwrite a newer result. A submission that loses its response remains reserved and becomes `unknown` after 60 seconds, instead of being billed a second time.

## Deployment configuration — not applied

Continue using the existing frontend settings for the same project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (the existing publishable key, never a service key)

Backend-only:

- `SUPABASE_URL`: that same existing project's URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only credential for the backend RPCs. Never prefix it with `VITE_` or put it in browser code. It is also sent as the Supabase API key when verifying the user's own Bearer token.
- `WLT_API_KEY`: existing server-side World Labs key.
- `WORLD_GENERATION_ENABLED=false` until configuration, migration, deployment and a live test are approved.

No Redis settings, SQLite path, shared generation access code, or new session-signing secret is needed. No new backend production package is required; the adapter uses the existing HTTPX dependency.

Configure the existing database row as project owner. Choose the actual judging start/end timestamps, at most 30 days apart. For **one controlled test only**, the following illustrates a one-job budget. The date is an example, not applied configuration:

```sql
update public.world_generation_demo
set starts_at = '2026-11-01T00:00:00+09:00',
    expires_at = '2026-12-01T00:00:00+09:00',
    credit_budget = 1580,
    max_new_per_hour = 1,
    max_new_per_day = 1,
    max_in_flight = 1,
    enabled = false
where singleton;
```

After explicit approval, enable the database flag and backend flag for the test. Check actual API credit availability separately; a configured budget is not a purchase or evidence of account balance. Increase the global budget for the wider judging demo only to an owner-approved amount. The per-account limit remains exactly 3 and is not a browser or environment knob. Do not reset job history or the reserved-credit counter across deployments.

Current standard image reservation is 1,580 credits: 1,500 for the world plus up to 80 for image-to-pano preprocessing. The model is constrained to `marble-1.1`, and no paid mesh export is called. Confirm current provider pricing before enabling: https://docs.worldlabs.ai/api/pricing . The budget protects this application's World Labs requests, not unrelated account usage or the separate OpenAI/Lablup symbolic endpoint.

Default server-side limits in the migration:

- 3 lifetime new-job reservations per account for this judging deployment.
- 10 submission attempts per account per fixed minute (including retries).
- 120 account/status reads per account per fixed minute.
- 5 new jobs per calendar hour globally, 10 per calendar day globally.
- 2 submitting/pending/uncertain jobs in flight globally.
- Global reserved credits cannot exceed `credit_budget`; all status transitions retain the reservation.
- New reservations stop outside the configured judging window, whose length is constrained to 30 days. Account reads, pending-job recovery, existing-world opens and samples remain accessible.

There is no public quota-reset endpoint. Failed/uncertain submissions and lost operations require owner review using the World Labs operation or tagged job ID. An uncertain job may keep an in-flight slot occupied until reviewed, deliberately prioritizing spend safety over automatic resubmission.

## Frontend behavior

Memory Studio receives the existing `user` prop and uses the existing Supabase session. It displays “3 of 3 worlds remaining”, updates to “2 of 3 worlds remaining” after a reservation, and shows a friendly exhausted message at zero. New generation is disabled at zero, while owned “Open world” actions remain available. Previously submitted jobs can be resumed across sessions/devices because they are fetched by verified account ID.

Account changes abort old requests, clear old quota/results in the panel, and re-read the new account. The request helper refuses to send a token if its session user differs from the panel's expected user. The existing Dashboard is also already keyed by account ID. There are no payment, card, provider-key or generation-access-code fields.

The generated SPZ/collider/thumbnail still flow to the existing viewer. Saved sample and symbolic modes remain separately labeled. Existing Google login, AuthGate, Supabase client, saved-memory database code, journal and 3D source files are unchanged.

## Tests and local test setup

No live provider or existing-project migration is used by the test suite.

```sh
python -m pip install -r backend/requirements-dev.txt
npm ci --prefix frontend
python -m unittest discover -s backend/tests -q
npm run test:database --prefix frontend
npm test --prefix frontend
MEMOVERSE_TEST_PYTHON=/absolute/path/to/your/python npm run test:browser --prefix frontend
npm run build --prefix frontend
npm run lint --prefix frontend
```

Browser tests use installed Chrome by default (`MEMOVERSE_BROWSER_CHANNEL` can select a Playwright-installed browser). They start three local-only test processes: a synthetic Supabase HTTP service backed by the actual migration in a PGlite PostgreSQL engine, FastAPI with a mocked World Labs provider, and Vite configured with test-only public Supabase settings. All SPZ/GLB/image assets are synthetic. Fake session tokens are only understood by that local test Auth service; no Google OAuth request or real credential is used.

The SQL tests exercise the actual migration/functions, not a reimplementation of the SQL counters. They cover three-slot limits, concurrent caller queues, idempotency, global budgets across accounts, failures/uncertain reservations, repeat reads, ownership, cutoff, request rates, role privileges and stale job handling. PGlite is a single-connection PostgreSQL engine: this validates SQL behavior under queued concurrent calls, not multi-connection load behavior of the live Supabase project. The production row-lock/unique-constraint design should also receive a staging multi-connection smoke test before a wide public rollout.

The browser cases cover existing Google-authenticated account state, progress and generated assets, reload recovery without another allowance, all-three-used controls with revisits, account switching, failure handling with held allowance, saved sample, and the unchanged signed-out Google login button. No real Google login, paid World Labs generation, external asset quality certification, or production deployment is claimed.

## Readiness

Local code and mock/SQL/browser verification are ready for review. The live site is unchanged. Before a controlled live test, review/apply migration 004 in the existing project, configure the server-only Supabase credentials, choose judging dates and an approved credit cap, and obtain explicit approval to deploy and make that one paid request. Neither credits nor database infrastructure were purchased or replaced.


## Verification results for this implementation

- Python backend tests: **40 passed** (existing scene tests plus account authentication, allowance routing, retries, failures and account switching).
- Actual migration/PostgreSQL function tests: **13 passed** (using PGlite; see the multi-connection limitation above).
- Frontend tests: **26 passed**, including session refresh/account mismatch and signed-out request prevention.
- Headless Chrome browser tests: **6 passed**, using the existing Supabase client/session flow against the local PostgreSQL-backed fixture and mocked World Labs.
- Production build: passed. Lint exits 0 with React hook advisories; large lazy Three/Spark chunk and existing Three deprecation advisories remain.
- `git diff --check`: passed.

Browser report: `frontend/test-results/browser-results.json` (ignored test artifact). The generated-world screenshot uses a synthetic red thumbnail and four synthetic splats, not a paid or realistic reconstruction.

## Exact files changed or added

- `.gitignore`
- `.vercelignore`
- `backend/.env.example`
- `backend/requirements-dev.txt`
- `backend/tests/mock_world_server.py`
- `backend/tests/supabase_fixture.mjs`
- `backend/tests/test_worlds.py`
- `backend/tests/world_allowance.test.mjs`
- `backend/tests/world_database_fixture.mjs`
- `backend/world_accounts.py`
- `backend/worlds.py`
- `docs/ACCOUNT_WORLD_ALLOWANCE.md`
- `frontend/e2e/fixtures.js`
- `frontend/e2e/world-generation.spec.js`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/playwright.config.js`
- `frontend/src/integration/WorldGeneration.jsx`
- `frontend/src/integration/accountWorldClient.js`
- `frontend/src/integration/accountWorldClient.test.js`
- `frontend/src/integration/worldJobs.js`
- `frontend/src/integration/worldJobs.test.js`
- `frontend/src/ui/Dashboard.css`
- `frontend/src/ui/Dashboard.jsx`
- `frontend/supabase/008_world_generation_allowance.sql`
