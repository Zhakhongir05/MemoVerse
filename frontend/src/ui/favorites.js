import { supabase } from './supabaseClient.js'
const key = owner => `memoverse:favorites:${owner}`
export function cachedFavorites(owner, storage = globalThis.localStorage) {
  try { const data = JSON.parse(storage?.getItem(key(owner)) || '{}'); return { values: data.values || {}, pending: data.pending || {} } } catch { return { values: {}, pending: {} } }
}
function write(owner, data, storage) { storage.setItem(key(owner), JSON.stringify(data)) }
async function account(owner, client) {
  const { data, error } = await client.auth.getUser()
  if (error || data.user?.id !== owner) throw new Error('Sign in again to sync favorites.')
}
export async function syncFavorites(owner, client = supabase, storage = globalThis.localStorage) {
  const local = cachedFavorites(owner, storage)
  if (owner === 'local-device') return local.values
  if (!client) throw new Error('Favorites are saved on this device. Cloud sync is unavailable.')
  await account(owner, client)
  for (const [id, value] of Object.entries(local.pending)) {
    const { error } = value ? await client.from('memory_favorites').upsert({ user_id: owner, memory_id: id }, { onConflict: 'user_id,memory_id' }) : await client.from('memory_favorites').delete().eq('user_id', owner).eq('memory_id', id)
    if (error) throw new Error('Favorites are saved on this device. Cloud sync needs attention.')
    // Preserve a newer toggle made while the request was in flight.
    const current = cachedFavorites(owner, storage)
    if (current.pending[id] === value) delete current.pending[id]
    write(owner, current, storage)
  }
  const { data, error } = await client.from('memory_favorites').select('memory_id').eq('user_id', owner)
  if (error) throw new Error('Favorites are saved on this device. Cloud sync needs attention.')
  const current = cachedFavorites(owner, storage)
  const values = { ...Object.fromEntries(data.map(row => [row.memory_id, true])), ...current.pending }
  write(owner, { values, pending: current.pending }, storage)
  return values
}
export async function setFavorite(owner, id, value, client = supabase, storage = globalThis.localStorage) {
  const local = cachedFavorites(owner, storage)
  local.values[id] = value
  if (owner !== 'local-device') local.pending[id] = value
  write(owner, local, storage)
  return syncFavorites(owner, client, storage)
}
