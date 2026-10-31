# MemoVerse AI backend

Python FastAPI pipeline: validated photograph → grounded OpenAI vision observations → DeepSeek symbolic scene plan → Pydantic-validated scene. No arbitrary meshes or geometry reconstruction. Existing root and health endpoints are preserved.

## Run

From the repository root, using the existing virtual environment:

```sh
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API docs: http://127.0.0.1:8000/docs. Health: http://127.0.0.1:8000/health.

Demo mode is on by default. For live generation, copy `backend/.env.example` to `backend/.env`, set the two server-side keys and `DEMO_MODE=false`, then restart. Existing process environment takes precedence. Only backend/.env is loaded; the root .env is deliberately not loaded or changed. No secrets belong in frontend environment variables. Configure keys privately; no keys are included in this implementation.

`ALLOW_MOCK_FALLBACK=true` returns a clearly labeled deterministic demo on unavailable credentials, provider timeout/failure or invalid output. Disable it for strict live-only behavior: unavailable credentials → 503, timeout → 504, provider/JSON failure → 502. Request validation never triggers demo fallback.

## Contract proposal — coordinate before renderer adoption

No shared/scene.schema.json, renderer or frontend contract was present in this checkout. This implementation uses the user's proposed bedroom schema as a **backend proposal**, not an agreed shared interface. No shared or frontend files were created or modified. The renderer team must confirm object pivots, coordinates, scales, moods and supported assets before integration. `GET /api/scene-schema` exposes the generated schema with explicit proposal status. OpenAPI documents the response envelope.

Scene fields are exactly:

```json
{"title":"A quiet room","environment":"bedroom","mood":"nostalgic","objects":[{"id":"desk-1","type":"desk","position":[-2,0,-2],"scale":[1,1,1],"memory":"A memory explicitly written by the user","audioUrl":null}]}
```

Asset catalog: desk, bed, chair, window, bookshelf, lamp, photo-frame. Moods: nostalgic, joyful, melancholic. 1–7 objects; unique IDs (letters/digits/underscore/hyphen, max 64); positions bounded to [-10,10], Y up; scale factors (0,5]. Extra keys, non-finite values and arbitrary audio URLs are rejected. `audioUrl` is required but must be null until the audio team supplies a trusted catalog. No audio generation or remote asset fetch exists. Intended coordinates are meters with floor-level object pivots except wall-mounted windows/frames; renderer team confirmation is pending. The bedroom constraint means other photo environments receive symbolic bedroom adaptations, not faithful reconstructions.

## Request and frontend integration

```sh
curl -X POST http://127.0.0.1:8000/api/generate-scene \
  -F 'story=I remember studying by the bedroom window.' \
  -F 'photo=@/absolute/path/to/photo.jpg;type=image/jpeg'
```

Use multipart fields `story` (trimmed, 1–2000 characters) and `photo` (JPEG/PNG/WebP, at most 5 MiB). MIME must match actual signature; Pillow verifies decoding, rejects corrupt/animated images and limits dimensions to 20 megapixels. Total multipart body has a 5 MiB + 64 KiB cap, including chunked uploads.

```js
const form = new FormData();
form.append('story', story);
form.append('photo', photoFile);
const response = await fetch('http://127.0.0.1:8000/api/generate-scene', {
  method: 'POST', body: form,
}); // Let the browser set Content-Type and multipart boundary.
const data = await response.json();
if (!response.ok) throw data.detail;
// Render data.scene. Show data.source and data.reason prominently.
// data.source === 'mock' is a prepared demo, not AI analysis of the upload.
```

Exact response envelope: `{scene, source: 'ai'|'mock', fallback: boolean, reason: null|string}`. AI success has source=ai, fallback=false, reason=null. All prepared responses have source=mock, fallback=true; reason is demo_mode, missing_credentials, provider_timeout, provider_failure or invalid_model_output. Display the mock/demo badge prominently, including on HTTP 200. A prepared demo is independent of the uploaded image and story.

Errors: `{ "detail": [{"loc":["body","photo"],"type":"invalid_image","msg":"..."}] }`; missing/invalid fields use 422, oversized photos use 413. Pydantic errors exclude input values so private stories are not echoed. CORS allows only http://localhost and http://127.0.0.1 on frontend ports 5173 and 3000. Add other development ports deliberately; no wildcard origin.

## Provider compatibility and limits

Defaults: OPENAI_MODEL=gpt-4.1-mini and DEEPSEEK_MODEL=deepseek-flash. Both configurable. Official documentation checked 2026-10-31:

- [OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini): image input, text output and Chat Completions compatibility.
- [OpenAI vision guide](https://developers.openai.com/api/docs/guides/images-vision?api-mode=chat): base64 data URL image input.
- [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/): json_object, JSON instruction/example, deepseek-flash sample; blank content remains possible.

Separate official AsyncOpenAI clients pin provider hosts, avoiding accidental key routing through an OPENAI_BASE_URL override. Only OpenAI receives image bytes. DeepSeek receives validated photo observations and story, never the raw photo. Vision analysis omits the written story to keep visual observations separate from personal memories. Prompts prohibit invented people/memories and treat input as untrusted data; hallucination remains a provider limitation. Output is symbolic, with no measured spatial fidelity. Finite numeric validation and a closed asset catalog are enforced independently of prompts.

Each SDK has retries disabled; vision timeout 15s, planner 20s, whole pipeline deadline 35s. Empty, truncated, refused, oversized or schema-invalid model responses cause a labeled fallback (or structured error when disabled). Image decoding runs outside the event loop. Clients close at application shutdown. Photos/stories are not persisted by this application, and responses use Cache-Control: no-store. Providers have their own data policies. Do not enable SDK HTTP/body debug logging when processing personal content. Local server defaults do not log stories, image bytes or keys. Authentication, per-user quotas and production deployment are outside this local hackathon backend.

Mocked tests do not verify actual account/model availability or live API behavior. A live end-to-end test on 2026-10-31 passed OpenAI photo analysis, Lablup DeepSeek scene generation, Pydantic validation and HTTP 200 with `source=ai` and `fallback=false`. This used process-only live settings and does not change the demo-mode default. An earlier Lablup response failed validation; validation remains strict. An opt-in live compatibility check uses only a generated 32×32 color square and a generic text request (billable calls):

```sh
backend/.venv/bin/python -m backend.check_providers
```

This checks the configured models' real image/JSON compatibility, not just whether a model ID appears in a list. It does not print provider response bodies or secrets. No live provider success is claimed unless this check actually passes.

## Tests

```sh
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m unittest discover -s backend/tests -v
backend/.venv/bin/python -m pip check
```

Tests use synthetic images, injected async provider clients and official SDK clients over httpx.MockTransport; no network or real credentials. They cover health, input failures, valid formats, exact response keys, scene constraints, stage separation, JSON mode, invalid/truncated provider output, timeout, failure and honest fallback behavior. They do not test real provider accuracy or renderer compatibility.

## Lablup-hosted DeepSeek

For Lablup-issued credentials, set `DEEPSEEK_BASE_URL=https://api.console.lablup.ai/v1` and `DEEPSEEK_MODEL=DeepSeek-V4.1-Flash-B300`. The direct DeepSeek endpoint remains the default; a Lablup key must not be sent there. Only these two provider endpoints are accepted. Set `DEMO_MODE=false` and `ALLOW_MOCK_FALLBACK=false` for strict live verification. JSON-mode compatibility of this hosted model must be verified with a real request.
