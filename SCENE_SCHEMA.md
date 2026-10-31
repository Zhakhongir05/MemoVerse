# MemoVerse Scene Contract

Owner: 3D / 2.5D render (person 3)
Consumers: backend (produces this JSON), frontend (fetches + passes it down), interaction handlers (listen to events).

The AI-generated image is the painted room. The renderer mounts it as the back wall, adds a real 3D floor at the painted floor line, and stands the interactable props on that floor. The result is a grounded diorama: the image supplies the detail, the 3D layer supplies depth, contact shadows, and perspective.

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
  anchor: 'surface',
  support: 'desk_1',
  rotation: [0, 0, 0],   // degrees
  scale: [1, 1, 1],
  label: 'Old TV',
  memoryId: 'mem_tv_1',
  interactive: true,
}
```

## Camera controls

The renderer ships an inspectable, **constrained** camera:

- **Scroll** — zoom, toward the cursor.
- **Drag** — orbit around X/Y, clamped by `stage.orbit`.
- **Right-drag** — pan.
- **Double-click** — reset the view.

The painted back wall and the 3D floor/props live in the same scene, so they stay aligned while orbiting. Keep the orbit range small; the back wall is still a painting.

## Stage block

Add `stage` to the payload. Every field is optional and has a default.

| field            | default              | meaning |
| ---------------- | -------------------- | ------- |
| `floorLine`      | `0.62`               | Normalized image Y where the painted wall meets the painted floor. |
| `floorColor`     | `#3b2a21`            | Color of the painted floor at that line. The 3D floor is tinted/textured from it. |
| `vanishingPoint` | `[0.5, 0.47]`        | Normalized image position of the perspective vanishing point (advisory). |
| `cameraHeight`   | `1.5`                | Eye height in meters used when generating the image (advisory). |
| `orbit`          | `{ "azimuth": 0.35, "polar": 0.2 }` | Max orbit from center, in radians. |

## Coordinates and anchors

- `position: [x, y]` is **normalized to the background image**: `x: 0 → left, 1 → right`; `y: 0 → TOP, 1 → bottom`.
- The point is the object's **base center** — where it touches the floor or a supporting surface. Props grow upward from it.
- `anchor` decides where that base lands:
  - `floor` — solved onto the 3D floor. The base still projects to `[x, y]`, so a painted floor position becomes a real world position. Default for `bed`, `desk`, `chair`, `rug`, `bookshelf`, `wardrobe`.
  - `surface` — stacked on another prop's top. Requires `support: "<object id>"`; the prop follows the support when it moves. Default when `support` is present.
  - `wall` — mounted on the painted image plane. Default for `poster`.
  - `image` — legacy image-plane placement; also the fallback for unknown types.
- `depth` is no longer used for placement. It is an optional mouse-parallax hint for wall/image props; floor props derive their parallax from how close they are to the camera.
- `rotation`: yaw in **degrees** as a number, or a full `[x, y, z]` in degrees.
- `scale`: number or `[x, y, z]`. `1` is the primitive's native size **relative to the image plane** — the renderer compensates for perspective, so a prop keeps its apparent size when its floor depth changes.
- The renderer **letterboxes the image (object-fit: contain)**. Mapping stays exact at any window size, so `[0.5, 0.5]` is always the image center.
- Background images should be **16:9**, at least 1280×720, and served with CORS headers.

## Payload

```json
{
  "id": "scene_001",
  "background": {
    "url": "https://.../room.png",
    "width": 1536,
    "height": 864
  },
  "stage": {
    "floorLine": 0.62,
    "floorColor": "#4a3427",
    "vanishingPoint": [0.5, 0.47],
    "cameraHeight": 1.5,
    "orbit": { "azimuth": 0.35, "polar": 0.2 }
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
      "rotation": [0, 8, 0],
      "scale": 1.95,
      "label": "Your childhood bed",
      "memoryId": "mem_bed_1"
    },
    {
      "id": "desk_1",
      "type": "desk",
      "position": [0.73, 0.78],
      "rotation": [0, -8, 0],
      "scale": 1.95
    },
    {
      "id": "tv_1",
      "type": "crt_tv",
      "position": [0.73, 0.575],
      "support": "desk_1",
      "rotation": [0, -6, 0],
      "scale": 1.6,
      "label": "Old CRT television",
      "memoryId": "mem_tv_1"
    }
  ]
}
```

`background.url` is the only required field — everything else has defaults. An invalid or missing URL falls back to a dark gradient, so the demo never shows a blank canvas. The 3D floor still renders, so props remain grounded while you iterate.

## How the payload is produced

The key rule: **generate the image first, then ground the scene JSON on that image.** Do not ask a text model to guess pixel positions.

1. **Image prompt** — the LLM turns the user prompt into something like:
   > 16:9 interior, eye level about 1.5 m, 35–50 mm, one-point perspective, vanishing point centered, wall/floor junction at about 62% of image height, lower third is clean floor, no foreground occlusions, no people or text, soft nostalgic lighting.
2. **Image generation** — produce the background at 16:9.
3. **Vision pass on the generated image** — return:
   - `stage.floorLine` — normalized Y of the wall/floor junction.
   - `stage.floorColor` — sampled from the painted floor near that line.
   - `stage.vanishingPoint` — optional.
   - `objects` — each with a type, `position` at its base center, scale, and `support` where it stands on another object.
4. **Return** `{ background, stage, atmosphere, objects }` to the frontend.

If the vision pass cannot determine the floor line, fall back to `0.62` and generate the image with the camera spec above. The renderer's dev drag tool exists to fix the remaining alignment by hand.

## Object types

Implemented primitives and their default anchor:

| type        | anchor    | notes |
| ----------- | --------- | ----- |
| `bed`       | `floor`   | base at floor |
| `desk`      | `floor`   | base at floor |
| `crt_tv`    | `surface` | set `support` to a desk/shelf id; falls back to the image plane without one |
| `desk_lamp` | `surface` | set `support` to a desk id |
| `rug`       | `floor`   | flat floor prop; keep it subtle in perspective |
| `poster`    | `wall`    | base center = poster bottom |

Aliases accepted: `tv`, `television`, `crt` → `crt_tv`; `table`, `writing_desk` → `desk`; `lamp` → `desk_lamp`; `carpet` → `rug`; `picture` → `poster`.

Anything unknown renders a neutral placeholder box and is still clickable — it never disappears silently. Add new furniture as a component in `frontend/src/3d_world/objects.jsx` and register it in `OBJECT_COMPONENTS`. Surface heights and contact-shadow footprints live in `registry.js`.

## Events

`onSelect(object, event)` fires on click/tap. `onHover(object)` fires on enter, `onHover(null)` on leave. The frontend can open the memory modal with `memoryId`.

## Testing without the backend

`npm run dev`, then use the **“Edit scene JSON”** button in the bottom-left. Paste any payload and press Apply — no API needed. It is dev-only and is stripped from production builds.

Click **Move props** to drag a prop. Floor props move on the 3D floor; wall/surface props move on their image plane. The editor collapses out of the way while edit mode is on; click **Stop moving props**, then **Copy current** to copy the calibrated positions back out as scene JSON.
