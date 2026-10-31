# Existing World Labs integration verification

Worktree: /Users/sujam/Desktop/MemoVerse-world-integration
Branch: codex/integrate-latest-room (existing uncommitted work preserved; no branch switch, commit, push or merge).

## Changes in this task
- frontend/package.json and package-lock.json: Spark 2.4.0, compatible peer requirement Three >=0.180; installed Three 0.187.
- frontend/src/integration/existingWorld.js: existing world ID and its 500k SPZ / GLB resource URLs. No API keys.
- frontend/src/integration/WorldLabsViewer.jsx: separate R3F canvas, Spark SPZ rendering, GLTF collider, OrbitControls, asset loading/failure status, optional wireframe, collider-raycast memory placement, clickable markers and story display, resource cleanup/error boundary.
- frontend/src/integration/MemoryStudio.jsx: explicit primitive/world mode switch and lazy viewer import. Original upload, API envelope validation and source/fallback displays preserved.
- frontend/src/integration/studio.css: viewer controls and overlay sizing.
- docs/WORLD_LABS_VIEWER.md: this handoff.

Pre-existing changes to Scene.jsx, App.jsx, index.html, Vite proxy and other integration files were preserved. Backend untouched.

## Tests and actual browser verification
- Existing backend unittest suite: 18/18 passed. Initial pytest invocation unavailable because pytest is not installed; reran with repository-documented unittest runner successfully.
- Frontend node tests: 12/12 passed.
- Production Vite build passed. Large chunk advisory remains: main ~1.18 MB, lazy Spark viewer ~2.75 MB minified (0.97 MB gzip). Spark loads only when selected.
- Existing SPZ and GLB URLs: HTTP 200, CORS *, 5,896,479 and 5,144,760 bytes respectively. Saved fresh checks in integration-asset-check.json.
- Actual browser at http://127.0.0.1:5180: 497,664 splats decoded/rendered with no conversion, upright coherent bedroom, GLB loaded.
- Wireframe overlays visually matched bed, seat, shelving and floor from tested view. This is visual validation, not a metric calibration or comprehensive collision test.
- Drag changed view toward the right-hand chair/shelf; wheel zoom moved camera. Genuine 3D renderer, not a panorama background.
- Double-clicked seat surface to create an anchor; clicked golden marker; associated story appeared. Retested after final lifecycle changes.
- Switched back to primitive room; existing teammate environment rendered successfully.
- No browser console errors captured. Existing Three.Clock deprecation and PCFSoftShadowMap fallback warnings remain.
- No new OpenAI/DeepSeek requests were made; pipeline remains covered by existing mocked tests. No World Labs generation/export/purchase requests were made.

## Alignment and limitations
World Labs SPZ uses a 180-degree X rotation into Three.js. Collider GLB already uses glTF Y-up, so it stays unrotated. Returned metric semantics were null: raw units are retained, no fabricated metric scale/ground offset. Original JSON scene positions are not transferred into this world.

Navigation is orbit/pan/zoom, not collision-constrained walking. Collider is loaded for wireframe verification and surface picking. Anchors use local raycast positions and are session-only; switching modes clears them. They are manually authored, not automatically attached to AI object identities. Draft image quality is soft and unseen room regions are inferred. Comprehensive exploration, metric accuracy and mobile performance remain unverified. Asset URLs are accessible without credentials; do not publish this private test world manifest without considering that access. No API keys are included.

Spark SPZ support: https://sparkjs.dev/docs/splat-mesh/
World Labs coordinate guidance: https://docs.worldlabs.ai/api/rendering-spz

## Run
Terminal 1:
```sh
cd /Users/sujam/Desktop/MemoVerse-world-integration
DEMO_MODE=true /Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
Terminal 2:
```sh
cd /Users/sujam/Desktop/MemoVerse-world-integration/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5180
```
Open http://127.0.0.1:5180 and choose Existing World Labs world. The saved world needs no running backend or API keys. The primitive upload flow uses /api through the existing Vite proxy to port 8000. For live scene generation use the existing server-side credentials and DEMO_MODE=false configuration; do not place keys in VITE variables. No additional World Labs credits are used for this viewer.
