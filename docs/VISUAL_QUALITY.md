# MemoVerse visual-quality diagnosis and improvements

Branch: codex/immersive-memory-experience. Existing working integration preserved. No paid API calls, generation, exports, purchases, commits, pushes or merges.

## Diagnosis

Both supplied files (backend/test_images/memory.jpg and Downloads/img1.jpeg) are identical JPEGs: 399 × 501 pixels, 29,864 bytes, SHA-256 93acc97c9ce9a180acd40ca871c9b4219ac0ee8389f3308cc75296292cffc281. No higher-resolution original was available among these supplied files. Portrait crop covers only part of the room and provides little fine detail.

The previous 500k resource decoded 497,664 splats. The existing full-resolution resource decodes 2,276,736 splats, about 4.57 times as many. Payloads are 5.90 MB versus 26.95 MB. Browser rendering confirms a substantial improvement in shelves, window frames, upholstery and rug detail when switching to full resolution. Thus the clearest avoidable bottleneck was the reduced splat asset.

The canvas was already high DPI: browser measured 2351 × 1276 backing pixels for approximately 1176 × 638 CSS pixels on a DPR-2 display. There was no undersized drawing-buffer bug. CSS uses backdrop blur only on floating UI panels, not the room canvas. No depth-of-field or sharpening pass was present. Gaussian filtering is intentional and is not equivalent to incorrect conventional texture filtering.

Full-resolution splats still show soft textures and inferred geometry. The likely remaining ceiling is the low-resolution input plus draft generation; the relative contribution of those two cannot be proven without a controlled new generation. No paid comparison was performed.

## Changes this task

- frontend/src/integration/existingWorld.js: add saved full-resolution SPZ URL. Same existing world, no export/conversion/generation endpoint.
- frontend/src/integration/WorldLabsViewer.jsx: desktop fine-pointer devices default to full detail; touch devices default to smooth 500k mode. Explicit detail toggle preserves journal state and attachments. Colliders are tied to selected asset quality to avoid stale surface picking during a reload. Camera FOV widened from 65 to 70 degrees to show more of the room without pushing the camera into geometry. DPR explicitly bounded [1,2], preserving prior high-DPI behavior. Explicit Spark preBlur=0 and blur=.3 use its documented filtering rather than adding artificial sharpening. MSAA stays disabled as recommended for splats. LoD reduction disabled for this fixed-detail comparison.
- docs/VISUAL_QUALITY.md: this report.

No backend, mood/audio implementation, teammate renderer, or provider settings modified. Baseline copies of changed viewer/manifest saved in this task's work/quality-before directory.

Full detail trades approximately 4.6× asset size and splat count for better detail. Smooth mode remains available immediately; mobile hardware and sustained frame rate were not benchmarked. Browser interaction succeeded on this desktop, which is not a promise of identical frame rates on other GPUs.

## Before / after evidence

quality-before.png is the original viewer baseline. quality-balanced.png and quality-full-detail.png are the matched smooth/full-detail views with the same widened framing and mood. Full detail visibly restores definition but does not make the room a faithful measured reconstruction or clean cutaway miniature.

## Tests

- Frontend node tests: 12 passed.
- Production build passed; existing large-bundle warning remains.
- oxlint passed without warnings after lifecycle refinement.
- git diff --check passed.
- Actual browser decoded/rendered 2,276,736 splats and collider; smooth mode returned to 497,664.
- Browser verified camera drag in full detail, story anchor surviving detail switches and remaining clickable, local PNG decoding, WAV playback advancing, mood switching and ambience toggling. Attachments remained present across detail changes.
- No browser console errors captured in tested flow.
- No backend edits; backend suite was not rerun in this frontend-only quality pass (18 previously passed).

## Next source image

Recommendation, not an official API minimum: use a native sharp original with roughly 2048–4096 pixels on the long edge and at least 1024 pixels on the short edge, without merely enlarging this 399 × 501 copy. Prefer a broad room view with floor/wall/ceiling boundaries, steady exposure, clean window highlights, natural perspective and minimal motion blur. Avoid screenshots, collages, extreme ultrawide distortion, artificial sharpening or repeated JPEG compression. Where possible, supply overlapping views of the same room or a true 360° equirectangular panorama; do not label a normal crop as a panorama.

## Generation recommendation and costs (not executed)

The API exposes model selection; its documented generation schema has no arbitrary resolution or quality slider. Recommend explicitly pinning marble-1.1 with a better original, rather than another draft or an unspecified model default. It may improve geometry/detail, but this has not been tested on this photograph.

For one ordinary non-panorama image:

| Model | Credits | USD equivalent |
|---|---:|---:|
| marble-1.0-draft | 230 | $0.184 |
| marble-1.0 or marble-1.1 | 1580 | $1.264 |
| marble-1.1-plus | 1580–3080 | $1.264–$2.464 |

Plus has variable world sizing; it is not automatically the right choice for a single room. A genuine existing panorama with standard mode costs 1500 credits; multiple images cost 1600. No such request has been made. Reusing the generated panorama avoids its creation cost but does not recover detail missing from it. Higher-quality generation requires separate approval.

Official sources checked:
- https://docs.worldlabs.ai/api/models
- https://docs.worldlabs.ai/api/pricing
- https://docs.worldlabs.ai/api/reference/worlds/generate
- https://docs.worldlabs.ai/api/world-generation-examples
- https://sparkjs.dev/docs/performance/

## Review

Open the existing local app at http://127.0.0.1:5185 . Desktop reloads should select Full detail. Use the detail button to compare against Smooth. Both load only assets of world 4fad570a-957c-43a7-b7c9-150945606413. No generation credits are needed for this comparison.
