// Scene payload normalization. Keep in sync with SCENE_SCHEMA.md (repo root).

export const DEFAULT_ATMOSPHERE = {
  ambientColor: '#ffcf9e',
  ambientIntensity: 0.55,
  keyColor: '#ffb27a',
  keyIntensity: 1.1,
}

// Types the backend may emit, mapped to the primitive names we render.
const TYPE_ALIASES = {
  tv: 'crt_tv',
  television: 'crt_tv',
  television_set: 'crt_tv',
  crt: 'crt_tv',
  table: 'desk',
  writing_desk: 'desk',
  lamp: 'desk_lamp',
  carpet: 'rug',
  picture: 'poster',
}

const DEFAULT_DEPTH = 0.15
const DEFAULT_IMAGE_ASPECT = 16 / 9

export const DEFAULT_STAGE = {
  // Normalized image Y where the painted wall meets the painted floor.
  floorLine: 0.62,
  floorColor: '#3b2a21',
  vanishingPoint: [0.5, 0.47],
  cameraHeight: 1.5,
  orbit: { azimuth: 0.35, polar: 0.2 },
}

export function normalizeType(type) {
  const value = String(type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return TYPE_ALIASES[value] ?? value
}

function asNumber(value, fallback) {
  const number = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(number) ? number : fallback
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizePosition(position) {
  if (Array.isArray(position) && position.length >= 2) {
    return [
      clamp01(asNumber(position[0], 0.5)),
      clamp01(asNumber(position[1], 0.75)),
    ]
  }
  if (position && typeof position === 'object') {
    return [
      clamp01(asNumber(position.x, 0.5)),
      clamp01(asNumber(position.y, 0.75)),
    ]
  }
  return [0.5, 0.75]
}

// Degrees in, the renderer converts to radians.
function normalizeRotation(rotation) {
  if (Array.isArray(rotation)) {
    return [0, 1, 2].map((index) => asNumber(rotation[index], 0))
  }
  return [0, asNumber(rotation, 0), 0]
}

function normalizeScale(scale) {
  if (Array.isArray(scale)) {
    return [0, 1, 2].map((index) => asNumber(scale[index], 1))
  }
  const value = asNumber(scale, 1)
  return [value, value, value]
}

function normalizeObject(raw, index) {
  if (!raw || typeof raw !== 'object') return null

  const type = normalizeType(raw.type)
  if (!type) return null

  return {
    id: String(raw.id ?? `object_${index}`),
    type,
    position: normalizePosition(raw.position),
    depth: clamp01(asNumber(raw.depth, DEFAULT_DEPTH)),
    rotation: normalizeRotation(raw.rotation),
    scale: normalizeScale(raw.scale),
    label: typeof raw.label === 'string' ? raw.label : '',
    memoryId: raw.memoryId != null ? String(raw.memoryId) : null,
    interactive: raw.interactive !== false,
    // Optional placement hints. `anchor` overrides the type default and
    // `support` makes a prop ride on another prop's top surface.
    anchor:
      raw.anchor === 'floor' ||
      raw.anchor === 'wall' ||
      raw.anchor === 'surface' ||
      raw.anchor === 'image'
        ? raw.anchor
        : null,
    support: raw.support != null ? String(raw.support) : null,
  }
}

function normalizeBackground(raw) {
  const background = raw && typeof raw === 'object' ? raw : {}
  const width = asNumber(background.width, DEFAULT_IMAGE_ASPECT * 1000)
  const height = asNumber(background.height, 1000)

  return {
    url:
      typeof background.url === 'string' && background.url.trim()
        ? background.url.trim()
        : null,
    width: width > 0 ? width : DEFAULT_IMAGE_ASPECT * 1000,
    height: height > 0 ? height : 1000,
  }
}

function normalizeAtmosphere(raw) {
  const atmosphere = raw && typeof raw === 'object' ? raw : {}

  return {
    ambientColor:
      typeof atmosphere.ambientColor === 'string'
        ? atmosphere.ambientColor
        : DEFAULT_ATMOSPHERE.ambientColor,
    ambientIntensity: asNumber(
      atmosphere.ambientIntensity,
      DEFAULT_ATMOSPHERE.ambientIntensity,
    ),
    keyColor:
      typeof atmosphere.keyColor === 'string'
        ? atmosphere.keyColor
        : DEFAULT_ATMOSPHERE.keyColor,
    keyIntensity: asNumber(
      atmosphere.keyIntensity,
      DEFAULT_ATMOSPHERE.keyIntensity,
    ),
  }
}

function normalizeStage(raw) {
  const stage = raw && typeof raw === 'object' ? raw : {}
  const orbit = stage.orbit && typeof stage.orbit === 'object' ? stage.orbit : {}
  const vanishingPoint = Array.isArray(stage.vanishingPoint)
    ? stage.vanishingPoint
    : DEFAULT_STAGE.vanishingPoint

  return {
    floorLine: clamp(
      asNumber(stage.floorLine, DEFAULT_STAGE.floorLine),
      0.5,
      0.95,
    ),
    floorColor:
      typeof stage.floorColor === 'string'
        ? stage.floorColor
        : DEFAULT_STAGE.floorColor,
    vanishingPoint: [
      clamp01(asNumber(vanishingPoint[0], DEFAULT_STAGE.vanishingPoint[0])),
      clamp01(asNumber(vanishingPoint[1], DEFAULT_STAGE.vanishingPoint[1])),
    ],
    cameraHeight: Math.max(
      0.5,
      asNumber(stage.cameraHeight, DEFAULT_STAGE.cameraHeight),
    ),
    orbit: {
      azimuth: clamp(
        asNumber(orbit.azimuth, DEFAULT_STAGE.orbit.azimuth),
        0,
        Math.PI / 2,
      ),
      polar: clamp(
        asNumber(orbit.polar, DEFAULT_STAGE.orbit.polar),
        0,
        Math.PI / 2 - 0.01,
      ),
    },
  }
}

export function normalizeScene(raw) {
  const scene = raw && typeof raw === 'object' ? raw : {}

  return {
    id: String(scene.id ?? 'scene'),
    background: normalizeBackground(scene.background),
    atmosphere: normalizeAtmosphere(scene.atmosphere),
    stage: normalizeStage(scene.stage),
    objects: Array.isArray(scene.objects)
      ? scene.objects.map(normalizeObject).filter(Boolean)
      : [],
  }
}

// Used until the backend is wired up. Delete once the API is live.
export const MOCK_SCENE = {
  id: 'mock_90s_room',
  background: { url: null, width: 16, height: 9 },
  atmosphere: DEFAULT_ATMOSPHERE,
  stage: {
    ...DEFAULT_STAGE,
    floorColor: '#4a3427',
  },
  objects: [
    {
      id: 'bed_1',
      type: 'bed',
      position: [0.23, 0.82],
      depth: 0.12,
      rotation: [0, 8, 0],
      scale: 1.95,
      label: 'Your childhood bed',
      memoryId: 'mem_bed_1',
    },
    {
      id: 'desk_1',
      type: 'desk',
      position: [0.73, 0.78],
      depth: 0.18,
      rotation: [0, -8, 0],
      scale: 1.95,
      label: 'The desk',
      memoryId: 'mem_desk_1',
    },
    {
      id: 'tv_1',
      type: 'crt_tv',
      position: [0.73, 0.575],
      depth: 0.2,
      rotation: [0, -6, 0],
      scale: 1.6,
      support: 'desk_1',
      label: 'Old CRT television',
      memoryId: 'mem_tv_1',
    },
    {
      id: 'lamp_1',
      type: 'desk_lamp',
      position: [0.87, 0.575],
      depth: 0.2,
      rotation: [0, 0, 0],
      scale: 1.75,
      support: 'desk_1',
      label: 'Desk lamp',
      memoryId: 'mem_lamp_1',
    },
  ],
}
