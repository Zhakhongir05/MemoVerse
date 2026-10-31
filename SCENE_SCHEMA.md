# MemoVerse Scene Contract

Owner: 3D / 2.5D render (person 3)
Consumers: backend (produces this JSON), frontend (fetches + passes it down), sensory (listens to interaction events).

The AI-generated background **is** the room. The renderer draws only the interactable props on top of it.

## Renderer API

```jsx
<Scene
  scene={sceneJson}      // the payload below
  loading={false}        // optional; shows a "building your memory" overlay
  onSelect={(object, event) => {}}   // object clicked
  onHover={(object | null) => {}}    // pointer entered/left an object
/>
```

`object` passed to callbacks is a normalized object (defaults applied):

```js
{
  id: 'tv_1',
  type: 'crt_tv',
  position: [0.73, 0.59],
  depth: 0.2,
  rotation: [0, 0, 0],   // degrees
  scale: [1, 1, 1],
  label: 'Old TV',
  memoryId: 'mem_tv_1',
  interactive: true,
}
```

## Coordinates

- `position: [x, y]` is **normalized to the background image**: `x: 0 → left, 1 → right`; `y: 0 → TOP, 1 → bottom`.
- The point is the object's **base center** — where it touches the painted floor or surface. Props grow upward from it.
- `depth: 0..1` — `0` sits on the painted plane, `1` is closest to the camera. Use `0.1 .. 0.4`; larger values create more mouse parallax.
- `rotation`: yaw in **degrees** as a number, or a full `[x, y, z]` in degrees.
- `scale`: number or `[x, y, z]`. `1` is the primitive's native size. Tune per generated image; the backend should return a sensible value.
- The renderer **letterboxes the image (object-fit: contain)**. Mapping stays exact at any window size, so `[0.5, 0.5]` is always the image center.
- Background images should be **16:9**, at least 1280×720, and served with CORS headers.
- The camera is fixed and straight-on. Do not ask the image to contain camera pitch/tilt beyond normal room perspective.

## Payload

```json
{
  "id": "scene_001",
  "background": {
    "url": "https://.../room.png",
    "width": 1536,
    "height": 864
  },
  "atmosphere": {
    "ambientColor": "#ffcf9e",
    "ambientIntensity": 0.55,
    "keyColor": "#ffb27a",
    "keyIntensity": 1.1
  },
  "objects": [
    {
      "id": "bed_1",
      "type": "bed",
      "position": [0.23, 0.82],
      "depth": 0.12,
      "rotation": [0, 8, 0],
      "scale": 1.35,
      "label": "Your childhood bed",
      "memoryId": "mem_bed_1"
    }
  ]
}
```

`background.url` is the only required field — everything else has defaults. An invalid or missing URL falls back to a dark gradient, so the demo never shows a blank canvas.

## Object types

Implemented primitives:

| type        | notes                                  |
| ----------- | -------------------------------------- |
| `bed`       | base at floor                          |
| `desk`      | base at floor                          |
| `crt_tv`    | base on the desk / shelf surface       |
| `desk_lamp` | base on the desk surface               |
| `rug`       | flat floor prop (needs a tilted camera; avoid in 2.5D) |
| `poster`    | wall prop; base center = poster bottom |

Aliases accepted: `tv`, `television`, `crt` → `crt_tv`; `table`, `writing_desk` → `desk`; `lamp` → `desk_lamp`; `carpet` → `rug`; `picture` → `poster`.

Anything unknown renders a neutral placeholder box and is still clickable — it never disappears silently. Add new furniture as a component in `frontend/src/3d_world/objects.jsx` and register it in `OBJECT_COMPONENTS`.

## Events

`onSelect(object, event)` fires on click/tap. `onHover(object)` fires on enter, `onHover(null)` on leave. Sensory can use these to trigger sound; frontend can open the memory modal with `memoryId`.

## Testing without the backend

`npm run dev`, then use the **“Edit scene JSON”** button in the bottom-left. Paste any payload and press Apply — no API needed. It is dev-only and is stripped from production builds. Rendering with no `background.url` falls back to the dark gradient, so the props are still visible while you iterate.
