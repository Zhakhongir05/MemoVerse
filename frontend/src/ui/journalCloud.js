import { supabase } from './supabaseClient.js'
import { listEntries, saveEntry, validateEntry } from './journalStore.js'

const BUCKET = 'memory-assets'
const columns = 'id,user_id,title,memory_date,story,mood,photos,audio,scene,world,created_at,updated_at,deleted_at'

async function assertAccount(client, owner) {
  if (!client) throw new Error('Cloud sync is unavailable. Check the Supabase configuration.')
  const { data, error } = await client.auth.getUser()
  if (error || data.user?.id !== owner) throw new Error('Please sign in again to sync this journal.')
}

async function hashBytes(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('')
}

export async function uploadJournalEntry(owner, entry, client = supabase) {
  await assertAccount(client, owner)
  if (entry.owner !== owner) throw new Error('This entry belongs to another journal.')
  if (Object.keys(validateEntry(entry)).length) throw new Error('Check your memory details before syncing.')
  async function upload(file, kind) {
    if (!file) return null
    const hash = await hashBytes(await file.arrayBuffer())
    const extension = file.name?.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    // Content-addressed paths make interrupted uploads and retries idempotent.
    const path = `${owner}/${entry.id}/${kind}-${hash}.${extension}`
    const known = [...(entry.cloudMedia?.photos || []), entry.cloudMedia?.audio].filter(Boolean)
    if (!known.some(asset => asset.path === path)) {
      const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
      if (error && String(error.statusCode) !== '409') throw error
    }
    return { path, name: file.name || `${kind}.${extension}`, type: file.type, size: file.size }
  }
  const photos = []
  for (const photo of entry.photos) photos.push(await upload(photo, 'photo'))
  const audio = await upload(entry.audio, 'audio')
  const { data, error } = await client.from('journal_entries').upsert({
    id: entry.id, user_id: owner, title: entry.title, memory_date: entry.date,
    story: entry.story, mood: entry.mood, photos, audio,
    scene: entry.scene || null, world: entry.world?.schemaVersion === 1 ? null : entry.world || null,
    created_at: entry.createdAt, updated_at: entry.updatedAt,
    deleted_at: null,
  }, { onConflict: 'id' }).select(columns).single()
  if (error) throw error
  // Do not delete uploaded files on a transport error: the DB request may have
  // committed. Nor remove old revisions another device may still reference.
  return { ...entry, world: data.world, syncState: 'synced', cloudUpdatedAt: data.updated_at, cloudMedia: { photos, audio } }
}

export async function syncDeletedEntry(owner, entry, client = supabase) {
  await assertAccount(client, owner)
  if (entry.owner !== owner || !entry.deletedAt) throw new Error('Invalid memory deletion.')
  const { data, error } = await client.from('journal_entries').upsert({
    id: entry.id, user_id: owner, title: entry.title, memory_date: entry.date,
    story: '', mood: entry.mood, photos: [], audio: null, scene: null, world: null,
    created_at: entry.createdAt, updated_at: entry.updatedAt, deleted_at: entry.deletedAt,
  }, { onConflict: 'id' }).select(columns).single()
  if (error) throw error
  return { ...entry, syncState: 'synced', cloudUpdatedAt: data.updated_at }
}

async function downloadEntry(row, client) {
  async function download(asset) {
    if (!asset) return null
    const { data, error } = await client.storage.from(BUCKET).download(asset.path)
    if (error) throw error
    return new File([data], asset.name, { type: asset.type || data.type })
  }
  const photos = []
  for (const asset of row.photos) photos.push(await download(asset))
  return {
    id: row.id, owner: row.user_id, title: row.title, date: row.memory_date,
    story: row.story, mood: row.mood, photos, audio: await download(row.audio),
    scene: row.scene, world: row.world, createdAt: row.created_at, updatedAt: row.updated_at,
    syncState: 'synced', cloudUpdatedAt: row.updated_at, cloudMedia: { photos: row.photos, audio: row.audio },
  }
}

export async function syncJournal(owner, client = supabase) {
  await assertAccount(client, owner)
  const local = await listEntries(owner, { includeDeleted: true })
  const cache = new Map(local.map(entry => [entry.id, entry]))
  const failures = []
  // Paginate: a multi-year journal must not silently stop at the API row limit.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from('journal_entries').select(columns).eq('user_id', owner)
      .order('id', { ascending: true }).range(offset, offset + 99)
    if (error) throw error
    for (const row of data) {
      const existing = cache.get(row.id)
      if (row.deleted_at) {
        const tombstone = { ...existing, id: row.id, owner, title: row.title, date: row.memory_date, mood: row.mood, story: '', photos: [], audio: null, scene: null, world: null, deletedAt: row.deleted_at, createdAt: row.created_at, updatedAt: row.updated_at, syncState: 'synced', cloudUpdatedAt: row.updated_at }
        await saveEntry(owner, tombstone, { preserveTimestamps: true })
        cache.set(row.id, tombstone)
        continue
      }
      if (existing && (existing.syncState !== 'synced' || existing.cloudUpdatedAt === row.updated_at)) continue
      try {
        const downloaded = await downloadEntry(row, client)
        await saveEntry(owner, downloaded, { preserveTimestamps: true })
        cache.set(row.id, downloaded)
      } catch (downloadError) { failures.push(`${row.title}: ${downloadError.message || 'Media download failed'}`) }
    }
    if (data.length < 100) break
  }
  for (const entry of [...cache.values()].filter(item => item.syncState !== 'synced')) {
    try {
      const synced = entry.deletedAt ? await syncDeletedEntry(owner, entry, client) : await uploadJournalEntry(owner, entry, client)
      await saveEntry(owner, synced, { preserveTimestamps: true })
      cache.set(entry.id, synced)
    } catch (error) { failures.push(`${entry.title}: ${error.message || 'Upload failed'}`) }
  }
  return { entries: await listEntries(owner), failures }
}

export async function importGuestEntries(owner) {
  const guests = await listEntries('local-device')
  const existing = new Set((await listEntries(owner, { includeDeleted: true })).map(entry => entry.id))
  let count = 0
  for (const guest of guests) {
    // Stable UUID per account/guest entry makes repeated imports safe.
    const hash = await hashBytes(new TextEncoder().encode(`${owner}:${guest.id}`))
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    if (existing.has(id)) continue
    await saveEntry(owner, { ...guest, id, syncState: 'pending', cloudMedia: null })
    count++
  }
  return count
}
