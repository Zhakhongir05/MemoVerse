import { readPhoto } from './photo.js'
import { requestEnhancements } from './api.js'
import { parseEnhancementsForWorld } from './schema.js'
import { cacheIdentity, loadManifest } from './cache.js'

export function generatedManifest(payload, worldId) {
  const list = parseEnhancementsForWorld(payload, worldId)
  if (payload.source !== 'ai' || payload.fallback !== false) throw new Error('AI furniture generation is unavailable or disabled. No AI furniture was added. You may explicitly load sample furniture instead.')
  if (!list.length) throw new Error('No supported furniture was identified in this photograph. No sample furniture was substituted.')
  return list
}
export async function loadFurniture({ imageUrl, story = '', memory, owner, worldId, signal }, {
  fetchImpl = globalThis.fetch, generate = requestEnhancements,
  identify = cacheIdentity, readCache = loadManifest,
} = {}) {
  const photo = await readPhoto(imageUrl, { fetchImpl, signal })
  const identity = await identify({ photo, story, memory, owner, worldId })
  let cached, warning = ''
  try { cached = await readCache(identity) }
  catch { warning = 'Local saved furniture could not be read. New placements may not survive reload.' }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (cached) return { payload: cached, list: parseEnhancementsForWorld(cached, worldId), identity, source: 'saved', warning }
  const payload = await generate({ worldId, story: story.slice(0, 2000), photo, proposals: [] }, { signal })
  return { payload, list: generatedManifest(payload, worldId), identity, source: 'ai', warning }
}
