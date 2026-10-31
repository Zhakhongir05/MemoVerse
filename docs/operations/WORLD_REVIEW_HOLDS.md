# World generation review holds

Unknown submissions have uncertain provider submission or billing outcomes. Keep their account allowance and reserved credits held until evidence supports reconciliation. Do not submit another paid job to diagnose one.

`frontend/supabase/015_review_reservations_not_active.sql` changes only the global execution-slot rule. Known `submitting` and `pending` jobs count toward the configured concurrency limit; `unknown` jobs remain held for review without occupying execution slots. The account cap of three, credit budget, hourly/daily limits, same-submission reuse, function grants, and job records remain unchanged.

The migration recognizes the reviewed 013 function and both already-safe deployed variants. It compares normalized function-body fingerprints so ordinary indentation and full-line comments do not cause a false mismatch. An already-safe definition is left byte-identical; any unreviewed business-logic change aborts the transaction. Run migration tests before adding another accepted fingerprint. The migration is not executed by a Git push or Vercel build.

## Manual recovery of incorrectly released unknown jobs

`restore_uncertain_world_holds.sql` is an owner-reviewed operations template, not a numbered migration. It records the guarded restoration procedure used after uncertain holds were separately released. The template contains no production job IDs, user IDs, photos, stories, asset URLs, or credentials. Never add it to automatic deployment steps.

Before use, inspect the target rows, provider evidence, account usage, budget, duplicate-submission indexes, and the active slot rule. Obtain approval for the exact proposed operation and its target records. The template intentionally supports only the reviewed incident shape: two released failed records with no provider IDs, 500 credits each, and the recorded release source. It aborts if the targets or evidence differ.

In the same database session, explicitly supply `memoverse.review_job_a` and `memoverse.review_job_b` with `set_config`. Missing or duplicate IDs fail closed. A service-role API key is not a database SQL credential; do not publish a SQL endpoint or expose credentials to run recovery.

The transaction locks the global budget before locking the jobs, restores unknown status and held account usage, adds the credits back once, and retains release diagnostics. Previous status, release flag, message, and update timestamp are archived in `provider_diagnostics.hold_restoration`. Provider IDs, submission hashes, assets, creation timestamps, and journal links are not changed. Both restored jobs must continue returning existing reservations rather than fresh submissions. The template refuses account overbooking. Unique indexes and the budget constraint remain enforced; a conflict rolls back the transaction.

Run the template twice against synthetic data to verify idempotence. After an approved live operation, use a separate read-only check to verify job state, evidence, account counts, global reserved credits, and known active slots. Do not use a paid generation as a verification step. The source of any unrelated provider world remains a separate investigation; absence of a provider ID alone does not prove that a submission was unbilled.

## Validation

`npm --prefix frontend run test:database` includes migration, quota, journal-job, rejection, and recovery tests. Browser coverage in `frontend/e2e/world-hotfix.spec.js` uses mocked provider responses to check first-click generation, persistence/reopening, pending-job resume, refresh, and specific failures without a sample fallback. CI uses mocked providers and no production credentials.
