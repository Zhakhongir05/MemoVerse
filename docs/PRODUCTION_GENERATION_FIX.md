# MemoVerse production generation repair — 2026-10-31

## Deployed status

Production: https://memoverse05.vercel.app
Deployment verified: https://memoverse05-4aozyulbb-sujamahat83-9625s-projects.vercel.app

`GET /api/generation-status` verified HTTP 200 with scene_mode=ai, mock_fallback_enabled=false, scene_providers_configured=true, world_generation_enabled=false. `/api/health` returned HTTP 200. An invalid generation POST returned 422 from FastAPI without invoking providers. An unauthenticated world POST returned 403 without invoking World Labs.

After explicit approval limited to img1.jpg, exactly one production scene request was made. It returned HTTP 504 provider_timeout after 27.27 seconds, with no mock substitution and no automatic retry. No second photograph and no World Labs generation were submitted. Two-photo comparison and successful live scene generation remain unverified. See LIVE_SCENE_VERIFICATION.json.

## Root causes

1. The previous vercel.json explicitly set DEMO_MODE=true and ALLOW_MOCK_FALLBACK=true. ScenePipeline returned mock_scene before examining image bytes or calling any provider. A synthetic production diagnostic returned source=mock, fallback=true, reason=demo_mode and the fixed title “A quiet room — demo”.
2. Vercel initially had no production environment variables. Local .env credentials are intentionally excluded from deployments.
3. The local DeepSeek key belongs to Lablup. api.deepseek.com rejected it with 401; after user clarification, api.console.lablup.ai/v1/models accepted it and listed DeepSeek-V4.1-Flash-B300. OpenAI's non-billable model lookup accepted its key. With explicit user approval, only the OpenAI and Lablup keys were uploaded as sensitive server-side Vercel variables. World Labs credentials remain local.
4. feature/frontend at 4cac081 has no frontend/src/3d_world/Scene.jsx. Its optional import.meta.glob intentionally renders “Your 3D world is waiting” when that folder is absent. The renderer IS committed on codex/immersive-memory-experience at 890a6e9. Earlier CLI deployments combined sources locally, so checking out feature/frontend alone could not reproduce them.

Production requests use same-origin /api/generate-scene. Vercel rewrites /api/* to api/index.py. Vite's localhost proxy is development-only; no public API origin is needed for this deployment.

## Source and review workflow

Worktree: /Users/sujam/Desktop/MemoVerse/production-fix
Local branch: codex/production-image-worlds
Base: origin/feature/frontend at 4cac081e4a47828be3b11450dce1e13f8119b2bb

The user subsequently approved one local integration commit and deployment, with no push or merge. The source is prepared on this local branch; the final response records the commit ID. Existing teammate worktrees were not modified. This worktree combines the latest frontend UI with the committed immersive renderer, existing FastAPI integration and this repair. Full source is present, not only a build directory. A reviewable patch against the frontend base is exported in the parent MemoVerse directory as memoverse-production-fix.patch. Apply it only to a clean checkout of that base, using `git apply --check` first, then `git apply`.

A fresh remote checkout cannot include unpushed changes. Pushing this integration still requires separate user approval. Vercel blocked deployment of the dirty frontend base because its commit author lacks project access. The user approved a local integration commit under the configured authorized Git identity to deploy the actual integration authorship without changing teammate commits. Do not deploy feature/frontend alone and expect the integrated viewer. The integrated ScenePreview uses a direct lazy import of ConnectedWorld; missing 3D source fails the production build. A negative build test verified this by temporarily removing Scene.jsx, checking build failure, restoring it and rebuilding successfully.

## Main changed and added files

- backend/agent.py: real mode and strict failures by default, high-detail photo input, remove the prepared bedroom from the planner's example.
- backend/main.py: safe provider error messages, production origin, world request body limits, world routes, nonsecret generation status.
- backend/schemas.py: enforce source/fallback/reason consistency.
- backend/worlds.py: official server-side Marble jobs, durable cache, atomic reservations, hard job cap, authorization, polling and expiry/failure handling.
- backend/.env.example, requirements.txt, vercel.json: production settings and deployment dependencies.
- api/index.py, .python-version, .vercelignore: preserved Vercel ASGI packaging.
- frontend/src/ui/ScenePreview.jsx: directly mount the integrated viewer; no optional missing-file fallback.
- frontend/src/ui/Dashboard.jsx: preserve latest UI/auth/saving/expanded layout, connect validated scene responses, separate generated-world action and mode.
- frontend/src/ui/AuthGate.jsx: distinguish guest account mode from mock generation.
- frontend/src/integration/{WorldGeneration.jsx,worldJobs.js}: explicit paid action, owner access code, progress, resumable polling and cached job IDs.
- frontend/src/integration/{ConnectedWorld.jsx,WorldLabsViewer.jsx}: pass newly generated asset URLs into existing viewer; keep saved sample, anchors, mood and atmosphere controls.
- frontend/src/integration/generateScene.js: safe, clear configuration/provider/timeout errors.
- frontend/src/3d_world/Scene.jsx and remaining integration modules: carry committed renderer and tested scene mapping into the frontend branch.
- frontend/package.json, package-lock.json, vite.config.js: combined dependencies, tests and development proxy.
- backend/tests/{test_backend.py,test_real_generation.py,test_worlds.py} and frontend/src/integration/worldJobs.test.js: explicit demo tests plus strict real-mode and asynchronous world-job coverage.

## Verification

- Backend: 31 tests pass. Existing tests explicitly select demo/fallback where that behavior is intended. New tests check default strict failure, inconsistent provenance rejection and two different synthetic image bytes producing different metadata through image-sensitive mocked vision/planning clients. This is not a claim of live-provider generation success.
- Frontend: 23 tests pass, including world API requests, progress polling, safe failures, malicious asset rejection and no automatic resubmission after failed/expired/unknown jobs.
- npm run build --prefix frontend passes locally and on Vercel. Large lazy Three/Spark chunk advisory remains.
- Lint exits 0 with React effect/ref advisories; unrelated teammate hooks were preserved.
- git diff --check passes.
- Saved sample's balanced SPZ, full SPZ and collider GLB each returned HTTP 206 for byte-range requests. They remain unchanged. Full interactive WebGL/anchor playback was not reverified end-to-end in this run.
- Built browser files contain none of the existing local API key values.

## Production configuration

Already configured as sensitive server-only values after explicit user approval:
OPENAI_API_KEY, DEEPSEEK_API_KEY.

Configured nonsecret settings:
OPENAI_MODEL=gpt-4.1-mini
DEEPSEEK_BASE_URL=https://api.console.lablup.ai/v1
DEEPSEEK_MODEL=DeepSeek-V4.1-Flash-B300

vercel.json sets DEMO_MODE=false and ALLOW_MOCK_FALLBACK=false. The application defaults are also false. The frontend uses the same origin; do not set VITE_API_BASE_URL to localhost. A separate backend deployment would additionally require a public API URL and explicit CORS configuration.

Supabase account setup is still absent from production; guest sessions work. This repair does not change the database or upload account secrets.

## World Labs approval and cost controls

Implementation follows the official World Labs Marble API:
https://docs.worldlabs.ai/api/reference/worlds/generate
https://docs.worldlabs.ai/api/reference/operations/get
https://github.com/worldlabsai/worldlabs-api-examples/blob/main/generate-world-from-image.py

The image is sent from FastAPI using the documented image data_base64 input. `POST /marble/v1/worlds:generate` starts a job, short `GET /operations/{id}` requests poll it, and completed results provide SPZ/collider assets. No external URL provided by the browser is fetched by the backend. Returned asset URLs must use HTTPS on worldlabs.ai hosts. Worlds are explicitly private.

Paid generation remains disabled until all of these are deliberately configured:
- WLT_API_KEY on the server, uploaded only with approval for that credential transfer.
- WORLD_GENERATION_ENABLED=true, after explicit paid-generation approval.
- WORLD_GENERATION_ACCESS_TOKEN: a project-owner-issued access code; not a World Labs key. It is entered at runtime and retained only in component memory, not compiled into the browser.
- WORLD_REDIS_REST_URL and WORLD_REDIS_REST_TOKEN: durable Redis REST storage, required on Vercel. The storage must retain job records and budget counters without eviction; deleting them removes deduplication guarantees. No in-memory or /tmp cache is used for production billing protection.
- WORLD_MAX_JOBS: an explicit global lifetime reservation cap (default 1). It counts failed and uncertain submissions too. Increase it only after owner review. It is a job cap, not a dollar budget; confirm current model pricing/credit cost before enabling.
- WORLD_LABS_MODEL: server-selected model, default marble-1.1. The browser cannot choose a more expensive model.

For a long-running non-Vercel server, WORLD_JOB_DB may point to a persistent SQLite file instead of Redis. This is rejected on Vercel.

The action requires a selected photograph, written story, access code, browser cost confirmation and approved=true in the API request. Image/story/model hashes reuse pending and completed jobs. Atomic reservation and cap checks run before the billable provider POST. Reservations and results have no automatic TTL. Submission timeouts/crashes become unknown/submitting records and are never automatically resubmitted. The owner must reconcile them with World Labs before manually authorizing anything new. No automatic retry of a billable POST occurs.

Browser polling waits five seconds between requests and pauses after 15 minutes; pausing stops progress checks, not the provider's generation. Reopening the same photo/story resumes via a locally remembered job ID; server-side hashing also deduplicates when local storage is unavailable. GET polling is throttled in the stored record. Failed/expired jobs remain cached. World IDs and final asset URLs remain in durable storage. Access-code authorization is intended for an owner-controlled pilot; public multi-user generation needs per-account authorization, quota accounting and account-scoped job ownership.

## Remaining limits

Real-provider two-image success/quality and new World Labs generation remain unverified. Only one img1.jpg scene request was approved and it timed out. The failed request revealed that the former provider time budgets were too short for this observed response latency; increasing them is a mitigation, not proof of success. Different images are not guaranteed to produce unique geometry: the symbolic renderer intentionally has a bedroom shell and seven supported object types. OpenAI/Lablup metadata can vary within that catalog. Realistic photo-conditioned worlds use the separate World Labs action and are generative reconstructions, not measured replicas. Newly generated scenes/worlds can still fail, expire or produce uncertain geometry. Existing interactive anchors remain local to the mounted viewer; durable anchor storage was not added. No paid job was run to certify alignment, asset CORS or visual quality of a new generated world. Cached asset URLs may later need owner-assisted refresh from the saved world ID; there is no automatic paid regeneration.

## Run the corrected local integration

Use this worktree, rather than the frontend-only checkout that produced the screenshot. Install Python requirements into a virtual environment and run these commands from production-fix in separate terminals (choose free ports):

```sh
DEEPSEEK_BASE_URL=https://api.console.lablup.ai/v1 DEEPSEEK_MODEL=DeepSeek-V4.1-Flash-B300 DEMO_MODE=false ALLOW_MOCK_FALLBACK=false python -m uvicorn backend.main:app --env-file ../.env --host 127.0.0.1 --port 8012
```

```sh
npm ci --prefix frontend
MEMOVERSE_BACKEND_URL=http://127.0.0.1:8012 npm run dev --prefix frontend -- --host 127.0.0.1 --port 5192
```

The parent .env is used only by the backend process; it is never copied into frontend files. Clicking scene generation with real mode configured can incur OpenAI/Lablup usage. World Labs remains disabled unless separately configured and approved.


## Timeout mitigation after the approved live test

The single approved live request returned the application's provider_timeout response (not a Vercel platform error). It did not identify the stage, so the original timeout cannot be attributed conclusively to OpenAI or Lablup. The updated pipeline has a 50-second overall limit, 20-second vision client limit and 35-second planner client limit; the overall limit bounds their combined runtime. Frontend timeout is 55 seconds and Vercel function limit remains 60 seconds. Client retries remain disabled. Future failures carry a safe vision/planner stage and server warnings contain only stage/timing, never credentials or submitted content. The mitigation and stage handling pass mocked tests; no paid retry has been performed.
