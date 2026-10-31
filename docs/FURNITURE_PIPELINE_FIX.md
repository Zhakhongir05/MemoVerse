# Furniture pipeline integration fix

Branch: codex/fix-furniture-photo-flow. No commit, push, merge, deployment or paid API call was made.

## Photo and viewer flow

ImmersiveMemory now forwards imageUrl and the existing memory/owner through its renderer props, preserving camera/journey props. It handles both the requested photos[0].url shape and the actual Journal File/Blob storage shape. Generated object URLs are revoked only on replacement/unmount. Scene passes the photo, memory and owner into the existing WorldLabsViewer. Studio already forwards its uploaded-photo URL; its owner scope is now forwarded too.

The viewer fetches the photograph, validates media type/5 MB limit, and posts FormData photo+context to /api/generate-enhancements with an empty proposals array for real generation. It no longer sends demo furniture as user proposals when a photo is missing/unreadable. Missing/expired/invalid photos, provider failure, disabled/demo output, empty output and invalid manifests are visible errors. No demo furniture is silently substituted. A separate Show sample furniture action preserves explicit sample viewing. Provider raw response bodies are not shown. Timeout becomes a retryable error rather than a forever-loading cancellation.

The existing saved World Labs room stays pinned; a new photo guides furniture overlays, not a reconstructed new world. Positions remain approximate. Existing camera, GLB/collider handling, anchors, SenseShift and interactions are retained. Supplied external enhancement manifests remain supported and are labeled as supplied rather than newly generated.

## Production routing: verified, not assumed

The currently deployed memoverse05 project hosts FastAPI as the api/index serverless function. Vercel inspection showed lambda api/index. vercel.json already rewrites /api/:path* and /health into it. Read-only checks found /health and /api/health HTTP 200, and a supplied-placement multipart POST to /api/generate-enhancements returned HTTP 200/source=user without provider calls. Therefore the current production route is not development-proxy-only; an extra external backend rewrite is unnecessary.

The client defaults to same-origin /api and supports optional VITE_API_BASE_URL for a public HTTPS backend origin (or localhost HTTP in development). No credentials, URL query secrets or arbitrary paths are allowed in that setting. For a separate backend, configure its explicit preview/production CORS origins; the existing backend otherwise allows local frontend origins only. The dev proxy defaults to http://127.0.0.1:8000 and can be overridden with MEMOVERSE_BACKEND_URL. No provider keys belong in VITE_ variables. api/index.py, vercel.json and server-side provider settings were not changed in this task.

To deploy these frontend changes later, review/commit them and deploy the branch through the existing full-stack Vercel setup with repository root retained. Real AI requires server-side DEMO_MODE=false and valid OpenAI and DeepSeek/Lablup configuration. Provider compatibility, availability and pricing were not live-tested; no paid calls were authorized. Preview/live settings were not changed. Do not enable World Labs generation as a side effect.

## Persistence

Local IndexedDB now reuses validated manifests and adjusted transforms across reloads. It is scoped by owner/memory/world and photo/story fingerprints and does not regenerate a matching ready manifest on Relive. Signed URLs are not saved. Storage failures are shown; samples remain explicit. See ENHANCEMENT_PERSISTENCE_PROPOSAL.md for the additive Supabase table and required ownership/RLS design. Cloud persistence is NOT implemented because schema review was required first; no migration files or database changes were created.

## Verification

- 29 backend tests pass, including the existing suite and two distinct mocked-photo inputs reaching vision/planner.
- 62 frontend tests pass, including saved File and URL resolution, multipart/HTTPS routing, expired/missing/oversized photos, invalid/demo/empty output, timeout, owner/world/input cache isolation, adjusted transforms and cache reuse without generation.
- Production build passes. Lint exits successfully with existing warnings in unrelated components; no lint errors.
- Actual local browser harness mounts the real Dashboard, ImmersiveMemory, Scene and WorldLabsViewer. Synthetic red File in Relive reached both mocked provider stages and displayed a clickable bed. Synthetic blue Studio upload reached both stages and displayed a chair. A full reload restored saved Relive placements; provider counters remained at one for that memory. URL-form and missing/expired-photo states exercised separately. Provider counter reached two only after the second Studio photograph. No real AI or World Labs generation was performed.
- These are mocked-provider results, not evidence that a real model returns different proposals for any two arbitrary photos. That live test remains unrun.
- No cross-device cloud persistence or live two-account RLS isolation is claimed; these require reviewed schema work.

## Run locally

From the repository root, start backend with its existing Python environment:

    DEMO_MODE=true /Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m uvicorn backend.main:app --port 8000

Then in frontend:

    npm ci
    npm run dev

Demo mode intentionally reports AI furniture unavailable. Show sample furniture is explicit. Use mocked providers for tests; do not enable paid providers without approval. Tests: python -m unittest discover -s backend/tests -q, then npm --prefix frontend test and npm --prefix frontend run build.

## Follow-up: actual localhost app verification

Ran the normal application at http://127.0.0.1:5197 against the fully mocked FastAPI server on port 8022, not the temporary harness. Created and saved a guest Journal memory with a synthetic red photograph, followed Journal -> Relive -> explicit fallback -> Explore, selected its generated furniture and verified its text. Reloaded the whole app, reopened the persisted memory, and confirmed saved placements restored without a second vision/planner request. Uploaded a synthetic blue image through the real Memory Studio and selected the chair returned by the mocked pipeline. Counters reached two total only after that second distinct image. Browser console errors were empty.

This full-app check found the existing ViewerChrome.css hiding the entire furniture panel, including errors and calibration. The narrow fix retains hidden duplicate legacy journal/toolbar panels but exposes furniture feedback and controls above the app toolbar. It also restores the existing onOpenStudio callback in the memory information panel, making the already-wired Studio handoff reachable. No viewer engine rewrite occurred.

The backend and frontend are left running for review. No paid calls, cloud authentication tests, commits, pushes, migrations or deployments were performed. Local guest sign-in is intentionally used because cloud environment values were not loaded. Real AI behavior and cloud persistence remain unverified/pending approval as documented.
