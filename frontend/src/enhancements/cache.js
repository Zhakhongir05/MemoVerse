import { parseEnhancementsForWorld } from './schema.js'
const DATABASE = 'memoverse-enhancements'
const VERSION = 1
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('manifests', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onblocked = () => reject(new Error('Close other MemoVerse tabs, then retry saving furniture.'))
    request.onerror = () => reject(new Error('Saved furniture could not be accessed on this device.'))
  })
}
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('')
}
export async function cacheIdentity({ memory, owner, worldId, photo, story }) {
  // Persist no signed URLs or image bytes in the cache. Content hashes survive
  // object-URL recreation and distinguish replacement photographs.
  const fingerprint = await digest(await photo.arrayBuffer())
  const input = await digest(new TextEncoder().encode(JSON.stringify([VERSION, fingerprint, story])))
  const scope = owner || memory?.owner || 'local-device'
  return { key: JSON.stringify([scope, memory?.id || 'studio', worldId, input]), owner: scope, worldId, input }
}
export async function loadManifest(identity) {
  const db = await open()
  try {
    const row = await new Promise((resolve, reject) => {
      const request = db.transaction('manifests').objectStore('manifests').get(identity.key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Saved furniture could not be read.'))
    })
    if (!row) return null
    if (row.version !== VERSION || row.owner !== identity.owner || row.worldId !== identity.worldId || row.input !== identity.input) return null
    parseEnhancementsForWorld(row.manifest, identity.worldId)
    return row.manifest
  } finally { db.close() }
}
export async function saveManifest(identity, manifest) {
  parseEnhancementsForWorld(manifest, identity.worldId)
  const db = await open()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manifests', 'readwrite')
      // Preserve the final rendered transforms, rather than ray-snapping them
      // again on the next visit. This cache is local, not Supabase persistence.
      tx.objectStore('manifests').put({ ...identity, version: VERSION, updatedAt: new Date().toISOString(), manifest: { ...manifest, enhancements: manifest.enhancements.map(e => ({ ...e, anchor: 'none' })) } })
      tx.oncomplete = resolve
      tx.onabort = () => reject(new Error('Furniture could not be saved on this device.'))
      tx.onerror = () => reject(new Error('Furniture could not be saved on this device.'))
    })
  } finally { db.close() }
}
