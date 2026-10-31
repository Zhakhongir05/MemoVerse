# Vercel deployment

Production: https://memoverse05.vercel.app
Project: memoverse05. Integration branch: codex/integrate-latest-studio.

Vite frontend is served from frontend/dist. api/index.py exports the FastAPI app, with same-origin rewrites for /api/* and /health. Root requirements.txt contains explicit runtime dependencies for Vercel's Python 3.12 builder; backend/requirements.txt remains the local development lockfile. Runtime maxDuration is 60 seconds. .vercelignore excludes environment files, virtual environments, local photos, node_modules, caches and documentation from uploads.

Deployment intentionally uses DEMO_MODE=true and ALLOW_MOCK_FALLBACK=true. No provider keys were copied into Vercel or the frontend by this task. Existing AI pipeline code remains available but no paid provider call was performed. Enabling live publicly accessible generation requires an explicit follow-up; do not assume this deployment is running live AI.

Production frontend limits photos to 4 MiB to leave room below Vercel's 4.5 MB function request limit. Local development retains the backend's 5 MiB photo limit. Optional audio is local playback only and is not included in multipart uploads.

Verified production GET /, GET /health and GET /api/health returned HTTP 200. A newly synthesized 16x16 solid-color PNG plus generic test text returned HTTP 200, source=mock, fallback=true, reason=demo_mode. No local photograph or personal story was sent in that check. Frontend 15 tests, backend 18 tests and production build passed before deployment. The first deployment failed on a nested requirements include; replacing it with explicit dependencies resolved the build failure.

Deploy from repository root after reviewing changes:
```sh
vercel link --project memoverse05
vercel deploy --prod --env DEMO_MODE=true --env ALLOW_MOCK_FALLBACK=true
```

The Vercel project association under .vercel/ is local and ignored by Git. No API keys, environment files, test photos or virtual environments belong in commits. No merge into main is required for this CLI deployment.
