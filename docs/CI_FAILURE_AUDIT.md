# GitHub checks audit — 2026-11-01 KST

Repository: sujamahat/MemoVerse-1. Priority worktree: codex/persistent-journal-worlds-latest at 771a1ada845bf37202d74bd26b8871a2d6cc096e.

## Verified distinction: deployment statuses, not failing Actions jobs

GitHub API returned zero workflows and zero Actions runs. Repository Actions is enabled with allowed_actions=all. There are therefore no GitHub Actions workflow logs to inspect for these commits. The red checks are third-party Vercel commit statuses.

| Branch | Latest SHA | Vercel – frontend | Vercel – memoverse05 |
|---|---|---|---|
| main | 66af11c | Failed | Success |
| codex/persistent-journal-worlds-latest | 771a1ad | Failed | Success |
| feature/memorycast-guided-tours | 4361578 | Failed | Success |
| integration/all-feature-branches | 20b7ac9 | Failed | Success |

Each GitHub failure description says exactly `Deployment has failed — run this Vercel CLI command: npx vercel inspect <deployment-id> --logs`.

Failed deployment IDs and authoritative detail pages:

- main: dpl_7WMQJckrFowgntusRu95LoFReGVG — https://vercel.com/johan101010/frontend/7WMQJckrFowgntusRu95LoFReGVG
- persistent integration: dpl_8jjz8NdU1CK4hYSgbRJZzxSwXLCb — https://vercel.com/johan101010/frontend/8jjz8NdU1CK4hYSgbRJZzxSwXLCb
- MemoryCast: dpl_2cw1o7PF2SYHnmLrtWnyDQTQemyk — https://vercel.com/johan101010/frontend/2cw1o7PF2SYHnmLrtWnyDQTQemyk
- all-features integration: dpl_HzjBA87Ats4cuYRSm71NW4ih7H8F — https://vercel.com/johan101010/frontend/HzjBA87Ats4cuYRSm71NW4ih7H8F

The newest integration's memoverse05 deployment is READY at https://memoverse05-2c2uyrmu8-sujamahat83-9625s-projects.vercel.app, associated with exact commit 771a1ada845bf37202d74bd26b8871a2d6cc096e. GitHub and Vercel both confirm success.

## Actual log-access results and limits

Attempting each failed deployment's logs with the collaborator scope returned `Error: The specified scope does not exist` for this authenticated account. A direct attempt without that scope returned:

`Error: Can't find the deployment "dpl_8jjz8NdU1CK4hYSgbRJZzxSwXLCb" under the context "sujamahat83-9625s-projects"`

The direct build-events API returned `Error: Deployment not found. (404)`.

These are log-access errors, NOT the hidden build errors. They do not prove what failed inside Johan's build. No inaccessible build error is invented or represented as inspected.

The shared symptom is deployment failure in the separate johan101010/frontend project. Because the same commits deploy successfully to memoverse05 and local integration checks pass, project-specific configuration/access/environment is a reasonable investigation priority, but it is not a proven root cause without the owner's first actionable log error.

Supabase Preview is successful on main; skipped on persistent integration and MemoryCast with the exact summary: `This git branch is not associated with any Supabase Branch. You can open a PR to create a new branch.` A skipped preview is not a failed SQL migration test. Vercel Preview Comments reports no unresolved feedback where present.

No main branch protection or rulesets were reported by the API. Do not remove checks or weaken protections simply to make the repository appear green.

## Smallest next fixes

1. Johan (or an authorized project member) should open the failed persistent-integration deployment and provide its FIRST actionable build error, or grant read access. From the correct authenticated Vercel context: `vercel inspect dpl_8jjz8NdU1CK4hYSgbRJZzxSwXLCb --logs`. Do not paste secrets or all environment values.
2. Compare only the settings implicated by that error with the known working memoverse05 project. This repo's current root configuration expects repository-root Root Directory, Framework Other, install/build commands from root vercel.json, output frontend/dist, and the Python API at api/index.py. A project rooted at frontend must not also execute root commands that append --prefix frontend. Root mismatch is a candidate, not a diagnosed error here.
3. If logs instead report author authorization, Git installation access, plan limits, or invalid environment options, fix that exact setting in Johan's project. Do not globally uninstall Vercel or change the working memoverse05 integration.
4. If Johan's project is obsolete, disconnect only that project after owner confirmation; do not silently remove its GitHub status or bypass it. No configuration changes were made in this audit.
5. Missing actual Actions CI is addressed separately by a small local .github/workflows/ci.yml proposal. It adds backend/contract and frontend/database/lint/build jobs, uses pinned official Actions, full backend checkout history for the pinned renderer contract, read-only repository permission, and no production secrets. Paid generation is disabled. It will not repair the failed Vercel project; it will make future code failures independently visible.

## Local verification on the newest integration branch

- Python backend: 90 passed, including another run with the proposed CI's explicit disabled-provider environment.
- Frontend unit tests: 90 passed.
- Embedded PostgreSQL migrations/quota/ownership tests: 30 passed.
- Backend-to-renderer contract: 12 passed.
- Vite production build: passed, with nonfatal large Spark/Three chunk warnings.
- Lint: exit 0, with existing React hook/ref warnings.
- Workflow YAML: parsed; two jobs and read-only permissions checked. Official checkout/setup-python/setup-node action tags were resolved to the pinned commits through GitHub. The workflow has NOT run on hosted GitHub Actions because it remains uncommitted/unpushed.
- No browser suite was rerun in this audit. Existing browser evidence is not presented as a new CI run.

Commands executed from the integration checkout:

```bash
python -m unittest discover -s backend/tests -q
python backend/tests/check_enhancement_contract.py
npm --prefix frontend test
npm --prefix frontend run test:database
npm --prefix frontend run build
npm --prefix frontend run lint
```

Local Python used the existing backend virtual environment. The proposed hosted workflow uses Python 3.11 and Node 22; the hosted OS/runtime combination remains unverified until its first approved run.

## Production readiness is a separate blocker

The public production /api/world-config endpoint returned HTTP 503 with exact detail: `World generation is not configured. Please try again later.`

This is a runtime/configuration readiness failure, not evidence of a failed build. Prior verified prerequisites remain: backend Supabase configuration, reviewed/applied journal-world and MemoryCast migrations, durable asset worker/private storage, confirmed retention permissions and approved global provider budgets. No paid calls, migrations, deployment, merge, push or commit were performed for this audit.

## Files changed by this audit

- .github/workflows/ci.yml — proposed independent CI; no deployment job.
- docs/CI_FAILURE_AUDIT.md — this evidence and owner handoff.

No application features or teammate branches were changed. The exact shared Vercel build error and its fix remain blocked on authorized access to Johan's deployment logs.

## First hosted CI run and follow-up

Run 41216784794 passed backend/contract but failed two journalCloud media round-trip tests on Node 22: a cloned File lost its filename, producing `Check your memory details before syncing` and `undefined` instead of `voice.mp3`. The local passing runtime is Node 24.20.0. CI now uses Node 24 to match the verified runtime and its File structured-clone behavior; no browser persistence logic or assertions were weakened. Production build succeeded and its configuration endpoints returned enabled=true and limit=3.
