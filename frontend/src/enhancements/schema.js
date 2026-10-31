import { ASSET_CATALOG, ENHANCEMENT_TYPES } from './catalog.js'

/**
 * Validates the backend enhancement payload before anything reaches the scene.
 *
 * Contract:
 *   { worldId: string,
 *     enhancements: [{ id, type, assetId, position:[x,y,z],
 *                      rotation:[x,y,z] (radians), scale:[x,y,z]|number,
 *                      anchor: 'floor'|'ceiling'|'none',
 *                      photoPosition: [u,v] (optional),
 *                      confidence, memory }] }
 *
 * `position` is in the generated world's own asset units (the collider/scene
 * frame, Y-up) — the same frame the splat viewer renders. `anchor` says which
 * room surface the object rests on, so the client can ground it against the
 * collider; 'none' means the payload is already final and must not be moved.
 *
 * `assetId` must name a catalog entry, and its `type` must match the catalog
 * entry's type, so a backend cannot mount an arbitrary URL or the wrong mesh.
 */
export const ENHANCEMENT_CONTRACT_VERSION = 2

const MAX_ENHANCEMENTS = 20
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const ANCHORS = Object.freeze(['floor', 'ceiling', 'none'])
// Objects that hang from a surface rather than rest on one.
const DEFAULT_ANCHOR = Object.freeze({ pendant: 'ceiling' })

function fail(message) {
  throw new Error(`Invalid enhancement response: ${message}`)
}

function isVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}

function readVector(value, name, check) {
  if (!isVector(value)) fail(`${name} must be three finite numbers`)
  if (!value.every(check)) fail(`${name} is outside the allowed range`)
  return [value[0], value[1], value[2]]
}

function readText(value, name, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`${name} is required`)
    return ''
  }
  if (typeof value !== 'string') fail(`${name} must be text`)
  if (value.length > max) fail(`${name} is too long`)
  if (required && !value.trim()) fail(`${name} must not be empty`)
  return value
}

function normalizeScale(scale) {
  const vector = typeof scale === 'number' ? [scale, scale, scale] : scale
  return readVector(vector, 'scale', (n) => n > 0.01 && n <= 20)
}

function readAnchor(value, type, index) {
  if (value === undefined || value === null) return DEFAULT_ANCHOR[type] ?? 'floor'
  if (!ANCHORS.includes(value)) {
    fail(`enhancements[${index}].anchor must be one of ${ANCHORS.join(', ')}`)
  }
  return value
}

// A layout hint, not geometry: unusable values are dropped rather than
// rejecting the whole payload, so a bad hint cannot remove the furniture.
function readPhotoPosition(value) {
  if (!Array.isArray(value) || value.length !== 2) return null
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  return [Math.min(1, Math.max(0, value[0])), Math.min(1, Math.max(0, value[1]))]
}

export function normalizeEnhancement(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`enhancements[${index}] must be an object`)

  const id = readText(raw.id, `enhancements[${index}].id`, 64, { required: true })
  if (!ID_PATTERN.test(id)) fail(`enhancements[${index}].id has invalid characters`)

  if (!ENHANCEMENT_TYPES.includes(raw.type)) fail(`enhancements[${index}].type is not supported`)
  if (typeof raw.assetId !== 'string' || !(raw.assetId in ASSET_CATALOG)) {
    fail(`enhancements[${index}].assetId is not in the approved catalog`)
  }
  const asset = ASSET_CATALOG[raw.assetId]
  if (asset.type !== raw.type) fail(`enhancements[${index}].assetId does not match its type`)

  return {
    id,
    type: raw.type,
    assetId: raw.assetId,
    position: readVector(raw.position, `enhancements[${index}].position`, (n) => Math.abs(n) <= 1000),
    // glTF convention, radians.
    rotation: readVector(raw.rotation ?? [0, 0, 0], `enhancements[${index}].rotation`, (n) => Math.abs(n) <= Math.PI * 4),
    scale: normalizeScale(raw.scale ?? 1),
    anchor: readAnchor(raw.anchor, raw.type, index),
    photoPosition: readPhotoPosition(raw.photoPosition),
    confidence: readText(raw.confidence, `enhancements[${index}].confidence`, 40) || 'requires-calibration',
    memory: readText(raw.memory, `enhancements[${index}].memory`, 1000),
  }
}

export function parseEnhancementResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('payload must be an object')
  const worldId = readText(payload.worldId, 'worldId', 100, { required: true })
  if (!Array.isArray(payload.enhancements)) fail('enhancements must be an array')
  if (payload.enhancements.length > MAX_ENHANCEMENTS) fail('too many enhancements')

  const enhancements = payload.enhancements.map(normalizeEnhancement)
  const ids = new Set()
  for (const enhancement of enhancements) {
    if (ids.has(enhancement.id)) fail(`duplicate id "${enhancement.id}"`)
    ids.add(enhancement.id)
  }

  return { worldId, enhancements }
}

/** Parses a response only if it belongs to the world currently mounted. */
export function parseEnhancementsForWorld(payload, worldId) {
  const parsed = parseEnhancementResponse(payload)
  if (parsed.worldId !== worldId) {
    fail(`response targets world ${parsed.worldId}, but ${worldId} is mounted`)
  }
  return parsed.enhancements
}

/**
 * Keeps approximate (AI) placements inside the rendered room. Only X/Z are
 * clamped — Y is grounded against the collider separately — so a model guess
 * cannot put furniture through a wall or outside the floor.
 */
export function fitEnhancementsToBounds(enhancements, bounds, margin = 0.15) {
  if (!bounds) return enhancements
  const fit = (value, min, max) => {
    const low = min + margin
    const high = max - margin
    return low > high ? (min + max) / 2 : Math.min(Math.max(value, low), high)
  }
  return enhancements.map((enhancement) => ({
    ...enhancement,
    position: [
      fit(enhancement.position[0], bounds.min.x, bounds.max.x),
      enhancement.position[1],
      fit(enhancement.position[2], bounds.min.z, bounds.max.z),
    ],
  }))
}

/**
 * Maps a normalized place in the photograph onto the room's floor rectangle.
 * The viewer's default camera looks down -Z, so the top of the photo (v = 0)
 * is the far wall and the bottom is the near one. Only X/Z are set; the Y value
 * is still grounded against the collider.
 */
export function placeEnhancementsFromPhoto(enhancements, bounds, { margin = 0.15 } = {}) {
  if (!bounds) return enhancements
  if (!enhancements.some((enhancement) => Array.isArray(enhancement.photoPosition))) return enhancements
  const lowX = bounds.min.x + margin
  const highX = bounds.max.x - margin
  const lowZ = bounds.min.z + margin
  const highZ = bounds.max.z - margin
  if (lowX >= highX || lowZ >= highZ) return enhancements
  const round = (value) => Math.round(value * 1000) / 1000
  return enhancements.map((enhancement) => {
    const point = enhancement.photoPosition
    if (!Array.isArray(point)) return enhancement
    return {
      ...enhancement,
      position: [
        round(lowX + point[0] * (highX - lowX)),
        enhancement.position[1],
        round(lowZ + point[1] * (highZ - lowZ)),
      ],
    }
  })
}

/**
 * The model proposes furniture "near the origin" without knowing the room, so
 * its guesses collapse into a pile. Grow that relative arrangement around its
 * own centroid until it covers part of the real floor rectangle, then clamp.
 * Only scales up: an arrangement that already fits the room keeps its shape.
 * User-adjusted placements (anchor 'none') are never moved.
 */
export function spreadEnhancementsInRoom(enhancements, bounds, { fill = 0.6, margin = 0.15 } = {}) {
  if (!bounds || enhancements.length < 2) return enhancements
  const movable = enhancements.filter((enhancement) => enhancement.anchor !== 'none')
  if (movable.length < 2) return enhancements

  const xs = movable.map((enhancement) => enhancement.position[0])
  const zs = movable.map((enhancement) => enhancement.position[2])
  const aiCx = (Math.min(...xs) + Math.max(...xs)) / 2
  const aiCz = (Math.min(...zs) + Math.max(...zs)) / 2
  const lowX = bounds.min.x + margin
  const highX = bounds.max.x - margin
  const lowZ = bounds.min.z + margin
  const highZ = bounds.max.z - margin
  if (lowX >= highX || lowZ >= highZ) return enhancements
  const roomCx = (lowX + highX) / 2
  const roomCz = (lowZ + highZ) / 2
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanZ = Math.max(...zs) - Math.min(...zs)
  const grow = (span, target) => (span > 0.01 ? Math.max(1, target / span) : 1)
  const growX = grow(spanX, (highX - lowX) * fill)
  const growZ = grow(spanZ, (highZ - lowZ) * fill)
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

  const moved = new Map()
  for (const enhancement of movable) {
    moved.set(enhancement.id, [
      clamp(roomCx + (enhancement.position[0] - aiCx) * growX, lowX, highX),
      enhancement.position[1],
      clamp(roomCz + (enhancement.position[2] - aiCz) * growZ, lowZ, highZ),
    ])
  }
  return enhancements.map((enhancement) => (
    moved.has(enhancement.id) ? { ...enhancement, position: moved.get(enhancement.id) } : enhancement
  ))
}


/**
 * Demo payload hand-fitted to saved room 4fad570a…, in that world's raw asset
 * units (not meters). Positions are expected to need a final nudge with the
 * in-app calibration gizmo — that is what `confidence` communicates.
 */
export const DEMO_ENHANCEMENT_RESPONSE = Object.freeze({
  worldId: '4fad570a-957c-43a7-b7c9-150945606413',
  enhancements: [
    {
      id: 'bed-1',
      type: 'bed',
      assetId: 'bed-modern-01',
      position: [-0.8, -0.3, -2.8],
      rotation: [0, 0, 0],
      scale: [0.65, 0.65, 0.65],
      confidence: 'requires-calibration',
      memory: 'I used to sleep here under the sloped ceiling, wrapped in the rose quilt.',
    },
    {
      id: 'rug-1',
      type: 'rug',
      assetId: 'rug-feather-01',
      position: [0.0, -0.297, -2.3],
      rotation: [0, 0, 0],
      scale: [0.75, 1, 0.75],
      confidence: 'requires-calibration',
      memory: 'The feather rug held the cold mornings.',
    },
    {
      id: 'bookshelf-1',
      type: 'bookshelf',
      assetId: 'bookshelf-oak-01',
      position: [1.15, -0.3, -3.0],
      rotation: [0, -1.5708, 0],
      scale: [0.55, 0.55, 0.55],
      confidence: 'requires-calibration',
      memory: 'Every book on these shelves marked a winter.',
    },
    {
      id: 'armchair-1',
      type: 'armchair',
      assetId: 'armchair-ochre-01',
      position: [0.6, -0.3, -1.95],
      rotation: [0, -0.3, 0],
      scale: [0.65, 0.65, 0.65],
      confidence: 'requires-calibration',
      memory: 'This chair by the window was where I read in the afternoon light.',
    },
    {
      id: 'pendant-1',
      type: 'pendant',
      assetId: 'pendant-warm-01',
      position: [0.0, 0.95, -2.3],
      rotation: [0, 0, 0],
      scale: [0.55, 0.55, 0.55],
      confidence: 'requires-calibration',
      memory: 'The little pendant stayed on until the last page.',
    },
    {
      id: 'basket-1',
      type: 'basket',
      assetId: 'basket-woven-01',
      position: [0.95, -0.3, -2.55],
      rotation: [0, 0.4, 0],
      scale: [0.5, 0.5, 0.5],
      confidence: 'requires-calibration',
      memory: 'We kept letters in these baskets, folded in ribbons.',
    },
  ],
})
