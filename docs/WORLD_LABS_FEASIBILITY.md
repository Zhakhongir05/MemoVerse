# MemoVerse · World Labs feasibility and approval-ready experiment

Reviewed 2026-10-31. **Phase 1 completed. Phase 2 is blocked on a locally configured World Labs credential and explicit paid-generation approval. No generated world is claimed.**

## Actual repository and access findings

Original checkout: `/Users/sujam/Desktop/MemoVerse`, clean `feature/ai-backend` at 327c91c. Working integration: `/Users/sujam/Desktop/MemoVerse-world-integration`, `codex/integrate-latest-room` at 3f0ec4b plus preserved uncommitted integration work. A fresh fetch left origin/main at 3f0ec4b. Existing furnished-room integration uses teammate Scene.jsx cb1e9db with a child slot. No existing application source was changed for this feasibility review.

No populated `WLT_API_KEY`, `WORLDLABS_API_KEY`, `WORLD_LABS_API_KEY` or `MARBLE_API_KEY` was found in the inspected root/backend environment files or current process. Only presence booleans were printed. This establishes **no configured credential here**, not that nobody on the team owns a World Labs account. Account API enablement, credit balance, and export entitlements remain unverified. OpenAI and Lablup keys do not establish World Labs access.

The official read-only access check, once a key is privately configured, is `GET https://api.worldlabs.ai/marble/v1/credits` with a server-side `WLT-Api-Key` header. It can distinguish authentication/API-account problems and inspect balance without submitting a generation. The reference documents 404 for a caller that is not API-enabled. No authenticated request was attempted without a credential. [Credits reference](https://docs.worldlabs.ai/api/reference/credits/get)

I found no SenseShift, AudioContext or ambient-audio module in the inspected frontend/backend source. No audio code was removed; audio preservation cannot be verified until its branch/files are provided.

## Feasibility and authentication

The World API supports asynchronous image-to-world generation. Use `https://api.worldlabs.ai/marble/v1`, with `WLT-Api-Key` on backend requests. Submit `POST /worlds:generate`, retain its operation ID, poll `GET /operations/{operation_id}`, then resolve the completed world and its asset URLs. The quickstart estimates about five minutes for standard world generation; this is a documented estimate, not our measurement. [Official quickstart](https://docs.worldlabs.ai/api)

Pin the model explicitly. Current documented IDs are `marble-1.0-draft`, `marble-1.0`, `marble-1.1`, and `marble-1.1-plus`. Do not rely on the changing default or old aliases. [Model mapping](https://docs.worldlabs.ai/api/models)

The official Python image example was read in full. It uses standard-library HTTP, base64 image input, WLT_API_KEY and five-second polling. It still selects legacy model aliases and assumes a particular world-ID field. Production code should use the current documented model ID and validate actual response structures; it should also add bounded polling, timeouts, error handling and redacted logs rather than copy the example's unlimited loop and raw-error printing. [Official Python example](https://github.com/worldlabsai/worldlabs-api-examples/blob/main/generate-world-from-image.py)

A candidate first submission would specify private visibility, one input image, and the explicit draft model. Photo bytes can be uploaded as a media asset or encoded as image input; the API generation reference includes permission and prompt fields. Do not make the uploaded personal photo public merely to obtain an input URL. [Generation reference](https://docs.worldlabs.ai/api/reference/worlds/generate)

This produces inferred, generated spatial content. It does not guarantee accurate recovery of unseen surfaces, real dimensions or the original room. A usable splat/mesh returned by the model would satisfy a generated-world demonstration; panorama-only output would not.

## Cost proposal — not spending authorization

API credits are separate from Marble-app subscriptions. Public API pricing: $1 per 1,250 credits; minimum purchase $5. Estimates below assume one ordinary non-panorama photo:

| Action | Credits | USD estimate |
| --- | ---: | ---: |
| Draft generation | 230 | $0.184 |
| Standard generation | 1,580 | $1.264 |
| Plus generation | 1,580–3,080 | $1.264–$2.464 |
| Additional HQ mesh export | 3,500 | $2.80 |
| PLY splat conversion | 0 | $0 |

These are documented estimates, not charges incurred. Auto-refill off does not prevent usage overage. Account-specific/current pricing must be checked before approval. [API pricing](https://docs.worldlabs.ai/api/pricing)

**Proposed first approval:** exactly one draft image-to-world submission, expected $0.184 at that rate, no automatic resubmission, no paid mesh export, no credit purchase, no auto-refill changes. A $0.25 trial budget is the proposed team ceiling; the API does not expose a documented hard per-request dollar ceiling, so do not promise that an application variable enforces provider billing. If no usable prepaid balance exists, stop and request separate purchase approval. No generation call is permitted merely because a key becomes available.

## Gaussian splats versus meshes

| Path | Recommendation for MemoVerse | Tradeoff |
| --- | --- | --- |
| SPZ Gaussian splat | First POC choice for visual world | New renderer integration and GPU/memory testing; no inherent triangle surfaces or semantic object IDs |
| PLY splat export | Compatibility/conversion option | Still splats, not an ordinary triangle mesh |
| Collider GLB | Navigation/raycast support alongside splats | Simplified physics geometry, not the visual world |
| HQ textured/vertex-colored GLB | Later optional Three.js mesh path | Additional export workflow, charge and waiting; geometric artifacts remain possible |

World Labs recommends SparkJS for browser viewing, including coexistence with normal Three.js meshes. Spark supports SPZ and PLY among its formats. That makes a dedicated generated-world React Three Fiber component feasible in principle, without replacing the JSON renderer. [Official tools guidance](https://docs.worldlabs.ai/api/examples) [Spark export guidance](https://docs.worldlabs.ai/marble/export/gaussian-splat/spark)

Spark's own current quickstart uses `SparkRenderer` with the existing Three.js WebGL renderer and loads `SplatMesh`. An R3F implementation would create those objects using the existing Canvas renderer, mount them as primitives and dispose GPU resources on unmount. It must not start a second competing animation loop. Current app dependencies use Three 0.187; Spark's example pins 0.180. Compatibility must be tested on an experimental branch rather than assumed. [Spark documentation](https://sparkjs.dev/docs/)

Collider meshes are not intended as visual substitutes. The mesh export guide says high-quality mesh generation can take up to an hour. No draft-generation latency guarantee was established from the inspected current API docs. [Mesh guide](https://docs.worldlabs.ai/marble/export/mesh)

The export API returns cached PLY conversion downloads and asynchronous HQ GLB export operations, with textured or vertex-colored variants. Export is a distinct API action and must not be triggered automatically just because generation completed. [Export reference](https://docs.worldlabs.ai/api/reference/worlds/export)

## Navigation, transforms and memory alignment

Do not apply the present room-fitting adapter to a Marble world. It is designed for placing primitives inside the teammate's fixed room, not for reconstructing the coordinate frame of a new generated asset.

Use returned splat `semantics_metadata`: metric_scale_factor scales Gaussian centers and sizes; ground_plane_offset shifts centers after scaling. Renderer-axis conversion is separate; the World Labs guide identifies the raw OpenCV convention and describes a 180-degree X rotation for Three-style display. Use the actual returned values and validate splat/collider alignment; do not assume the collider needs an identical transform without inspecting it. [SPZ rendering guide](https://docs.worldlabs.ai/api/rendering-spz)

For the POC, orbit/free inspection proves loaded 3D structure but not collision-safe walking. To demonstrate walking, add camera movement constrained by the collider, a reasonable spawn point and tests that prevent traversing walls/floors. World Labs publishes examples combining Spark, Three and Rapier with controllers and collision geometry. These are implementation references, not proof that our app already supports them. [Interactive examples](https://docs.worldlabs.ai/api/interactive-world-examples)

Keep OpenAI for photograph/memory understanding and DeepSeek for narrative/interaction descriptions. Their existing planned coordinates have no guaranteed alignment with Marble's asset. Begin with user-placed anchors or verified raycast points on the aligned collider. Store each anchor with world ID and transform version. Only show a narrative at a location after that association is confirmed; otherwise retain it in the memory panel. Splats alone do not provide a dependable semantic object-picking contract.

## Export permissions and caching

The terms distinguish free-account noncommercial use from paid/API output rights, and condition API distribution/commercial use on the terms and applicable order form. Preserve attribution and embedded notices. This does not verify this team's specific entitlement or settle any account-specific condition. App subscription export tiers must not be treated as API entitlements. [Terms, especially §§2.10 and 3.3–3.7](https://www.worldlabs.ai/terms-of-service) [App mesh export tiers](https://docs.worldlabs.ai/marble/export/mesh)

The same terms constrain API-response caching to permitted retention periods; a universal duration was not established in the reviewed docs. Do not promise permanent caching. Separate authorized exported-file storage from cached API responses/signed URLs, and confirm retention with the team's order form or World Labs before enabling persistent asset caching. Download-URL expiry is also not the same as permission to retain the file. [Terms §2.10](https://www.worldlabs.ai/terms-of-service)

Proposed cost-avoidance design after retention is resolved: a tenant-scoped hash of normalized photo content, model, prompt and generation settings links to a persisted job/world record. Reuse completed authorized assets, refresh expiring URLs through a world lookup, and resume the existing operation after a browser disconnect. Never start another paid job just because polling times out. The operation response provides completion/error fields and, where available, settled cost credits; record those plus wall-clock start/end timestamps for actual reporting. [Operation reference](https://docs.worldlabs.ai/api/reference/operations/get)

## Isolated POC build plan — gated, not implemented

Once a private key and explicit one-job approval exist:

1. Snapshot the dirty integration work, then create an isolated experimental branch/worktree; do not replace the current mode.
2. Add a server-only World Labs client and read-only access check. No frontend API key.
3. Validate an uploaded JPEG/PNG/WebP using existing signature/size checks. Keep the first sample public or explicitly authorized for transmission.
4. Persist submission state before starting one approved job. If the POST times out ambiguously, reconcile rather than auto-resubmit; no idempotency mechanism is assumed without documented support.
5. Return a local job ID immediately. Poll provider GETs with bounded backoff, honor rate limits, handle 401/402/429/5xx, and preserve operation ID for resume. Do not buy credits in code. [Rate limits](https://docs.worldlabs.ai/api/rate-limits)
6. Treat an operation as success only when complete, error-free and containing a usable world asset. Validate output shape/URLs; don't turn a provider error into a fake generated world.
7. Add a private POC viewer route using a low-resolution SPZ plus aligned collider when available. Validate browser fetching/CORS, coordinate frame, render performance, spawn and navigation. No automatic HQ export.
8. Only after that success, expose an optional generated-world mode alongside the current JSON mode. Keep memory selection and existing source/fallback indicators. Connect SenseShift/audio once its actual implementation is available.
9. Test job reuse and failure fallback without producing repeat API charges. Add controlled cache only after retention permission is established.

Acceptance evidence required: provider operation/world IDs retained privately, exact selected model, usable downloaded/streamed 3D asset, settled credit cost, measured generation/load times, browser navigation and anchor click results, and unchanged existing regression tests. A borrowed public sample verifies viewer compatibility only; it is not evidence that our uploaded photograph was generated.

## Tests and actual expenditure in this review

- Existing backend tests: **18 passed**.
- Existing frontend tests: **12 passed**.
- Production build: **passed**; existing bundle-size advisory remains.
- World Labs authenticated calls, generation, export, asset loading/navigation and memory alignment: **not run**.
- Actual World Labs generation time: **not measured**.
- Actual World Labs spend from this work: **$0; zero generation/export calls and zero purchases**.
- Files changed by this phase: this report only, plus a deliverable copy in Codex outputs. Existing code, branches and uncommitted integration remain intact. No experimental branch/service was created because Phase 2 was conditional on access being available.

## Required next input

Privately configure WLT_API_KEY in the intended backend environment; do not paste it into chat. Then approve or decline the one-draft trial above. A Marble web subscription or an OpenAI/Lablup key is not sufficient. If a teammate already has a generated asset with permission to use it, a free viewer-only test is possible, but it must remain labeled as an existing sample rather than photo-to-world generation by MemoVerse.
