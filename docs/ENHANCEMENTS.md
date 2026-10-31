# Spatial furniture enhancement manifest

Implemented additively on feature/ai-backend. MemoryCast and frontend changes remain in their separate integration workspace. No paid requests or World Labs generation were made.

## Endpoint and response

POST /api/generate-enhancements accepts multipart FormData with context (JSON string, max 40000 characters) and optional photo (JPEG/PNG/WebP, verified signature/decoding, max 5 MiB). Do not set multipart Content-Type manually.

Context: worldId, coordinateFrame:"render-y-up", story (max2000), proposals (max20 approved Enhancement objects), evidence (max20, unique IDs), optional calibration. Existing /api/generate-scene and its original JSON schema are unchanged.

The response contains worldId, enhancements, source (ai/user/demo), fallback, requiresReview:true and scaleStatus (uncalibrated/calibrated). unitsPerMeter is omitted unless calibrated. Each enhancement has id, type, assetId, position[3], rotation[3] in radians, scale[3], anchor (floor/ceiling/none), confidence (low/medium/requires-calibration) and memory. No arbitrary URLs or extra object fields are accepted. The teammate parser accepts additive top-level metadata but currently discards it; integration UI should retain scaleStatus/source/requiresReview separately if displaying them.

Catalog snapshot is pinned to the exact origin/feature/frontend commit recorded in backend/contracts/enhancement-catalog.json. Approved IDs: bed-modern-01, desk-modern-01, chair-modern-01, lamp-warm-01, bookshelf-oak-01, armchair-ochre-01, pendant-warm-01, basket-woven-01, rug-feather-01. Type must match its catalog entry. Updating assets requires reviewing and updating this pin/snapshot; no runtime URLs are accepted.

## Coordinates and honest confidence

Current integration renders SPZ with Rx(pi) and the collider glTF scene with existing node transforms, without an added rotation. The teammate enhancement branch has a conflicting collider comment but also no explicit added collider rotation. Thus the endpoint accepts final rendered Y-up coordinates only. It does NOT guess that a collider is raw capture data. raw_capture_to_render implements (x,-y,-z) for explicitly raw OpenCV data and is independently tested, but is never automatically applied to GLB coordinates. The renderer must first apply actual node/parent matrices and send world-space positions. No browser geometry-alignment claim is made in this backend task.

Photographs provide relative relationships, not correspondence to splat coordinates. AI placements are approximate drafts labeled low and requiresReview:true. There is no claim that an AI proposal is spatially verified. Supplying evidence for submitted proposals overrides transforms without another paid call. Evidence fields: id, position, surface (floor/ceiling/none), kind (collider-hit/user-adjusted), optional rotation and scale. Collider evidence supplies the actual rendered hit Y; its confidence stays low because object identity/XZ correspondence is not established. User-adjusted entries are medium confidence and anchor:none to prevent the frontend from re-snapping corrections. Pendants without evidence default ceiling, others floor; frontend raycasting remains responsible for optional snapping. Surface semantics rely on genuine viewer evidence, not automatic backend collider segmentation.

Calibration fields: pointA[3], pointB[3] in rendered world coordinates, distanceMeters (positive), evidence:"measured-scene-distance". unitsPerMeter = distance(pointA,pointB)/distanceMeters. Distinct finite points are required. This is caller-supplied measured evidence, not a claim that the server measured the room. Never submit AI-estimated dimensions as measurements. The existing frontend parser ignores unitsPerMeter; it does not automatically resize GLBs. Scale remains an explicit per-object render transform requiring calibration.

Each AI object carries a short factual description of its visible appearance (max 200 characters, prompt-constrained to exclude people, names, events and personal details). If the model returns none, the user's own story is used as the fallback. User-edited per-object memories are preserved.

## AI and workflow

With no proposals and a photograph, the existing configured OpenAI client produces validated PhotoAnalysis. The existing DeepSeek/Lablup client selects only approved assets and proposes bounded transforms, validated as a Plan then manifest. Total model work is bounded by a 35-second timeout; provider errors return an empty explicitly labeled demo fallback. Demo/missing-client mode returns no invented furniture. Invalid inputs return 422/413. Private responses use existing no-store middleware; raw provider data, stories and keys are not logged.

World Labs generation is still pinned to the existing saved world: this checkout has no generation client, so the splat/collider URLs stay hardcoded until API credentials exist. The client now sends the uploaded memory photograph when one exists (proposals empty, so the AI path runs) and falls back to proposals-only otherwise. AI placements are first clamped to the collider's X/Z bounds and then pulled toward the room centre until a downward ray meets real floor, so an approximate guess can never render outside the room; Y remains grounded by the viewer's own raycast.

## Example user adjustment

```json
{"worldId":"4fad570a-957c-43a7-b7c9-150945606413","coordinateFrame":"render-y-up","proposals":[{"id":"bed-1","type":"bed","assetId":"bed-modern-01","position":[0,0,-1],"rotation":[0,0,0],"scale":[1,1,1],"anchor":"floor","confidence":"low","memory":"My own written memory."}],"evidence":[{"id":"bed-1","position":[0.2,-0.3,-1.2],"rotation":[0,1.57,0],"surface":"floor","kind":"user-adjusted"}]}
```

These numbers are illustrative, not calibrated coordinates for the saved world.

## Tests and changed files

28 backend tests passed (18 previous +10 new); 19 existing frontend integration tests passed; 12 teammate parser/cross-language checks passed against pinned source in a temporary directory. Includes every asset/type, coordinate conversion, Y-up identity, floor/ceiling/no anchoring, calibration, user rotations/positions, invalid/oversized uploads, invalid transforms, duplicates, demo and mocked AI failures. git diff --check passed.

Changed for this task only:
- backend/enhancements.py (new schema/service/router)
- backend/contracts/enhancement-catalog.json (new safe catalog snapshot)
- backend/tests/test_enhancements.py (new)
- backend/tests/check_enhancement_contract.py (new offline JavaScript parity check)
- backend/main.py (register additive router and extend body-size guard)
- docs/ENHANCEMENTS.md (this documentation)

Run from ~/Desktop/MemoVerse:
```sh
/Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m unittest discover -s backend/tests -q
/Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python backend/tests/check_enhancement_contract.py
npm --prefix frontend test
DEMO_MODE=true /Users/sujam/Desktop/MemoVerse/backend/.venv/bin/python -m uvicorn backend.main:app --port 8000
```
