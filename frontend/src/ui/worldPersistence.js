import { supabase } from './supabaseClient.js'
import { parseEnhancementResponse } from '../enhancements/schema.js'

// Persist references, never expiring signed URLs. Signing is a storage read,
// and never invokes generation or consumes a World Labs credit.
export async function resolveArchivedWorld(world, client = supabase) {
  if (world?.schemaVersion !== 1 || world.status !== 'ready') throw new Error('This world has not been archived yet.')
  if (!client) throw new Error('Sign in to reopen this world.')
  async function sign(asset) {
    if (!asset || asset.bucket !== 'memory-worlds' || !asset.path || asset.path.includes('..')) throw new Error('Invalid archived asset.')
    const { data, error } = await client.storage.from(asset.bucket).createSignedUrl(asset.path, 3600)
    if (error || !data?.signedUrl) throw new Error('The saved world could not be opened. Please try again.')
    return data.signedUrl
  }
  const splatUrl = await sign(world.assets?.splat)
  const colliderUrl = world.assets?.collider ? await sign(world.assets.collider) : null
  const fullResUrl = world.assets?.fullResolution ? await sign(world.assets.fullResolution) : splatUrl
  const audioUrls = await Promise.all((world.guidedTour?.audioAssets || []).map(sign))
  return { ...world, splatUrl, fullResUrl, colliderUrl, audioUrls }
}

export async function saveWorldCustomizations(memory, enhancements, tour = memory.world?.guidedTour ?? null, client = supabase) {
  const payload = parseEnhancementResponse(enhancements)
  if (payload.worldId !== memory.world?.id) throw new Error('These objects belong to another world.')
  // Final placements must not be grounded again when the memory is reopened.
  payload.enhancements = payload.enhancements.map(item => ({ ...item, anchor: 'none' }))
  const { data, error } = await client.rpc('save_world_customizations', {
    p_memory_id: memory.id, p_revision: memory.world.revision,
    p_enhancements: payload, p_tour: tour,
  })
  if (error) throw new Error(error.message.includes('WORLD_CONFLICT') ? 'This world changed on another device. Reopen the memory before saving.' : 'Your world changes could not be saved. Please try again.')
  return data
}
