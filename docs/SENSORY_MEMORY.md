# MemoVerse — sensory memory layer (hackathon theme: sensation)

A journal entry becomes a room you can stand in. This layer makes that room
remember its **senses**: the rain in the story, the woodsmoke, the cold boards,
the lamplight. Every cue is copied from the writer's own words and shown with
the exact sentence it came from — nothing is invented, and nothing is generated
by a paid model.

## Judge path — no account, no keys

1. Open the app and choose **Explore Memories**.
2. On the sign-in sheet choose **Continue exploring without signing in**.
3. Open the journal menu (the options button) and choose **Try a Demo**.
4. The sample World Labs room opens immediately, labelled **Sample**. It is the
   real splat room used by the project, not a mock.
5. Press **Sensory pass** — the card cycles through the senses found in the
   sample story: rain, a settling fire, woodsmoke, bare floorboards, lamplight.
   Each card shows the cue, a short description, and the verbatim sentence it
   was read from, ending in *remembered from your words*.
6. Press **Senses on** — the sound cues play as synthesized ambience, supported
   phones get a short haptic pulse for temperature and texture, and a
   temperature cue tints the room cool or warm while its card is open.
7. Go **Back**, write an entry in your own words, and open its world. The cues
   are then extracted from that entry and its placed memory anchors.

The sample path is a demo fixture. After signing in, every cue comes from the
memory you saved.

## Pipeline

```
saved journal entry (story + placed memory anchors)
        │  POST /api/sensory-cues   (deterministic, no provider call)
        ▼
backend/sensory.py — lexicon match → cue with kind, engine, label, detail,
                     verbatim quote, source, anchorId, intensity
        ▼
frontend/src/sensory/cues.js — contract validation, drops a bad cue only
        ▼
WorldLabsViewer — evidence card, optional Web Audio + haptics, temperature tint
```

## API

`POST /api/sensory-cues`

```json
{
  "story": "Rain taps at the window and a fire is crackling in the grate. ...",
  "anchors": [{ "id": "anchor-1", "memory": "The floor was always cold." }],
  "mood": "Nostalgic"
}
```

```json
{
  "version": 1,
  "source": "lexicon",
  "cues": [
    {
      "id": "sense-1",
      "kind": "sound",
      "engine": "rain",
      "label": "Rain against the glass",
      "detail": "A steady rain on the window.",
      "quote": "Rain taps at the window and a fire is crackling in the grate.",
      "source": "story",
      "intensity": 0.5
    }
  ]
}
```

- `story` ≤ 12,000 chars; up to 40 anchors, each ≤ 2,000 chars. Extra keys are
  rejected by the shared `ContractModel` (`extra='forbid'`), so a malformed
  client fails loudly instead of silently.
- `kind` is one of `sound | scent | temperature | texture | light`; `engine` is
  one of `rain | fire | wind | birds | waves | hum | music | none`.
- `quote` is always a verbatim, whitespace-normalised slice of the submitted
  text (≤ 240 chars, windowed when the sentence is longer).
- Caps: 4 cues per kind, 12 total. A cue is de-duplicated by
  `(kind, engine, anchorId)`, so two mentions of smoke produce one card, and
  its `intensity` rises from 0.5 to 0.7.
- The endpoint is stateless and returns `Cache-Control: no-store` through the
  existing middleware. It never echoes the submitted story in an error.

## Evidence rules

- **Deterministic, not generative.** `backend/sensory.py` holds 22 lexicon
  entries of regex keywords. Same entry in, same cues out — no LLM, no paid
  call, and no external provider — the only request is our own endpoint.
- **Quoted, not invented.** A cue cannot exist without a matching sentence, and
  the card always prints that sentence.
- **Grounded in what the user wrote.** Cues come from the story and from memory
  anchors that already carry text. Scene objects without a written memory are
  not turned into senses.
- **Honest labels.** Non-sound cues say *Scent remembered*, *Temperature
  remembered*, *Touch remembered*, *Light remembered* — they are described, not
  emitted. Only sound has a synthesizer, and the sample path is labelled
  `Sample`.
- **Fails quietly.** If the endpoint is unreachable, the viewer keeps working
  with no cues and no error banner; the room is never blocked by senses.

## Audio and haptics

`frontend/src/sensory/audio.js` synthesizes seven beds with Web Audio —
`rain`, `fire`, `wind`, `birds`, `waves`, `hum`, `music`. There are no audio
files and no network requests. The `AudioContext` is created on the first user
gesture, one voice plays at a time, intensity scales the level, and stopping
fades out over 1.2 s before nodes are released. Haptics use
`navigator.vibrate` only when senses are switched on (a short pattern for
temperature and texture), and reduced-motion preferences disable the tint
transition.

## Files

| Path | Role |
| --- | --- |
| `backend/sensory.py` | Lexicon, extraction, validation models, `/api/sensory-cues` |
| `backend/main.py` | Body-limit middleware entry and router registration |
| `backend/tests/test_sensory.py` | 9 endpoint tests (empty input, quotes, caps, dedupe, anchors, validation) |
| `frontend/src/sensory/cues.js` | Contract parsing, request builder from a saved memory |
| `frontend/src/sensory/cues.test.js` | Contract and request-builder tests |
| `frontend/src/sensory/sensoryApi.js` | Timeout-aware POST client |
| `frontend/src/sensory/audio.js` | Seven Web Audio engines |
| `frontend/src/integration/WorldLabsViewer.jsx` | Evidence card, senses toggle, sensory pass, tint, anchor focus |
| `frontend/src/3d_world/scene.css`, `frontend/src/ui/ImmersiveMemory.css` | Card and control layout in both viewer modes |

## Run and verify locally

Backend (its own shell, from the repository root):

```sh
DEMO_MODE=true .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```sh
curl -s http://127.0.0.1:8000/api/sensory-cues \
  -H 'Content-Type: application/json' \
  -d '{"story":"Rain on the glass. The room smells of woodsmoke.","anchors":[],"mood":"Nostalgic"}'
```

Expect two cues: `sound/rain` and `scent`, each quoting its sentence. A backend
started before this route existed returns 404 — restart it.

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s backend/tests -q   # 134 tests
cd frontend && npm test                                      # sensory + app tests
cd frontend && npm run build                                 # production build
```

## Limitations — stated plainly

- The lexicon is English and keyword-based: it finds what the writer literally
  named. A remembered smell described without a keyword ("the kitchen after she
  left") produces no scent cue. That is the intended trade: no invention, no
  provider cost, and no external service.
- Scent, temperature, texture and light are described and tinted; they are not
  emitted. Only sound is audible, and it is synthesized ambience, not a
  recording of the remembered place.
- Haptics depend on the device and browser; most desktops have none.
- The demo room is the project's existing sample splat; the sensory cards on it
  are computed from the sample story that ships with the demo.
