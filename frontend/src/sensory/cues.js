/**
 * Validation for the sensory-cue contract.
 *
 * Every cue is copied from the listener's own words: `quote` is a verbatim
 * slice of the saved story or anchor memory, and the interface must show it
 * beside the sensation. A single unusable cue is dropped; the rest still play.
 */
export const MAX_SENSORY_CUES = 12
export const SENSORY_KINDS = Object.freeze(['sound', 'scent', 'temperature', 'texture', 'light'])
export const SENSORY_ENGINES = Object.freeze(['rain', 'fire', 'wind', 'birds', 'waves', 'hum', 'music', 'none'])
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function readText(value, name, max, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`Invalid sensory response: ${name} is required`)
    return ''
  }
  if (typeof value !== 'string') throw new Error(`Invalid sensory response: ${name} must be text`)
  const text = value.trim()
  if (text.length > max) throw new Error(`Invalid sensory response: ${name} is too long`)
  if (required && !text) throw new Error(`Invalid sensory response: ${name} must not be empty`)
  return text
}

function readIntensity(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5
}

function normalizeCue(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  try {
    const id = readText(raw.id, 'cue.id', 64, { required: true })
    if (!ID_PATTERN.test(id)) return null
    if (!SENSORY_KINDS.includes(raw.kind)) return null
    if (!SENSORY_ENGINES.includes(raw.engine)) return null
    if (raw.source !== 'story' && raw.source !== 'anchor') return null
    let anchorId = null
    if (raw.source === 'anchor') {
      anchorId = readText(raw.anchorId, 'cue.anchorId', 64, { required: true })
      if (!ID_PATTERN.test(anchorId)) return null
    }
    return {
      id,
      kind: raw.kind,
      engine: raw.engine,
      label: readText(raw.label, 'cue.label', 60, { required: true }),
      detail: readText(raw.detail, 'cue.detail', 200, { required: true }),
      quote: readText(raw.quote, 'cue.quote', 240, { required: true }),
      source: raw.source,
      anchorId,
      intensity: readIntensity(raw.intensity),
    }
  } catch {
    return null
  }
}

export function parseSensoryResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid sensory response: payload must be an object')
  }
  if (payload.version !== 1) throw new Error('Invalid sensory response: unsupported version')
  if (payload.source !== 'lexicon') throw new Error('Invalid sensory response: unknown source')
  if (!Array.isArray(payload.cues)) throw new Error('Invalid sensory response: cues must be an array')
  if (payload.cues.length > MAX_SENSORY_CUES) throw new Error('Invalid sensory response: too many cues')

  const ids = new Set()
  const cues = []
  for (const raw of payload.cues) {
    const cue = normalizeCue(raw)
    if (!cue || ids.has(cue.id)) continue
    ids.add(cue.id)
    cues.push(cue)
  }
  return cues
}

/** Cues that belong to one placed memory anchor. */
export function cuesForAnchor(cues, anchorId) {
  return cues.filter((cue) => cue.source === 'anchor' && cue.anchorId === anchorId)
}

/** Ambient cues read from the story itself, used for the sensory pass. */
export function storyCues(cues) {
  return cues.filter((cue) => cue.source === 'story')
}

/**
 * Builds the endpoint request from a saved journal memory. It reuses exactly
 * the anchors MemoryCast already treats as evidence; scene objects without a
 * written memory are not invented into senses.
 */
export function sensoryRequestFromMemory(memory) {
  const story = typeof memory?.story === 'string' ? memory.story : ''
  const world = memory?.world && typeof memory.world === 'object' ? memory.world : {}
  const raw = world.memoryAnchors || world.anchors || (memory?.scene && memory.scene.objects) || []
  const anchors = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue
    const id = item.id
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) continue
    const text = typeof item.memory === 'string' ? item.memory : ''
    if (!text.trim()) continue
    anchors.push({ id, memory: text.slice(0, 2000) })
  }
  const mood = typeof memory?.mood === 'string' && memory.mood.trim() ? memory.mood.slice(0, 40) : 'Nostalgic'
  return { story: story.slice(0, 12000), anchors: anchors.slice(0, 40), mood }
}
