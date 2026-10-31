import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importGuestEntries, syncJournal, uploadJournalEntry } from './journalCloud.js'
import { listEntries, markEntryDeleted, saveEntry } from './journalStore.js'

function fakeCloud(owner) {
  const rows = new Map()
  const objects = new Map()
  const controls = { failRows: false, failDownloads: false, uploads: 0 }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    storage: { from: () => ({
      upload: async (path, file) => {
        controls.uploads++
        if (objects.has(path)) return { error: { statusCode: '409' } }
        objects.set(path, file)
        return { error: null }
      },
      download: async path => ({ data: objects.get(path), error: controls.failDownloads || !objects.has(path) ? new Error('Download failed') : null }),
    }) },
    from: () => ({
      upsert: row => ({ select: () => ({ single: async () => {
        if (controls.failRows) return { data: null, error: new Error('Database unavailable') }
        rows.set(row.id, row)
        return { data: row, error: null }
      } }) }),
      select: () => ({ eq: (_column, userId) => ({ order: () => ({ range: async (start, end) => ({
        data: [...rows.values()].filter(row => row.user_id === userId).sort((a, b) => a.id.localeCompare(b.id)).slice(start, end + 1), error: null,
      }) }) }) }),
    }),
  }
  return { client, rows, objects, controls }
}

const memory = overrides => ({ title: 'By the sea', date: '2022-06-18', story: 'Waves and warm evening light.', mood: 'Joyful', photos: [], audio: null, scene: { source: 'mock' }, world: { id: 'world-reference' }, ...overrides })

test('deleting a memory hides it locally and syncs a durable deletion marker', async () => {
  const owner = crypto.randomUUID(), cloud = fakeCloud(owner)
  const saved = await saveEntry(owner, memory({ syncState: 'pending' }))
  await syncJournal(owner, cloud.client)
  await markEntryDeleted(owner, saved)
  assert.deepEqual(await listEntries(owner), [])
  const result = await syncJournal(owner, cloud.client)
  assert.deepEqual(result.entries, [])
  assert.ok(cloud.rows.get(saved.id).deleted_at)
  assert.deepEqual(cloud.rows.get(saved.id).photos, [])
  assert.equal((await syncJournal(owner, cloud.client)).entries.length, 0)
})

test('offline deletion remains queued after failure and succeeds on retry', async () => {
  const owner = crypto.randomUUID(), cloud = fakeCloud(owner)
  const saved = await saveEntry(owner, memory())
  await markEntryDeleted(owner, saved)
  cloud.controls.failRows = true
  const failed = await syncJournal(owner, cloud.client)
  assert.equal(failed.failures.length, 1)
  assert.equal((await listEntries(owner, { includeDeleted: true }))[0].syncState, 'pending-delete')
  cloud.controls.failRows = false
  assert.deepEqual((await syncJournal(owner, cloud.client)).entries, [])
  assert.ok(cloud.rows.get(saved.id).deleted_at)
})

test('remote deletion wins over a stale pending edit on another device', async () => {
  const owner = crypto.randomUUID(), cloud = fakeCloud(owner)
  const saved = await saveEntry(owner, memory({ syncState: 'pending' }))
  await syncJournal(owner, cloud.client)
  cloud.rows.set(saved.id, { ...cloud.rows.get(saved.id), deleted_at: new Date().toISOString() })
  await saveEntry(owner, { ...saved, story: 'Stale edit', syncState: 'pending' })
  const result = await syncJournal(owner, cloud.client)
  assert.deepEqual(result.entries, [])
  assert.ok(cloud.rows.get(saved.id).deleted_at)
})

test('full journal fields, multiple photos, audio, and world metadata sync; repeat sync reuses assets', async () => {
  const owner = crypto.randomUUID()
  const cloud = fakeCloud(owner)
  const saved = await saveEntry(owner, memory({ syncState: 'pending', photos: [new File(['first'], 'first.jpg', { type: 'image/jpeg' }), new File(['second'], 'second.png', { type: 'image/png' })], audio: new File(['voice'], 'voice.wav', { type: 'audio/wav' }) }))
  const first = await syncJournal(owner, cloud.client)
  assert.deepEqual(first.failures, [])
  assert.equal(first.entries[0].syncState, 'synced')
  const row = cloud.rows.get(saved.id)
  assert.equal(row.user_id, owner)
  assert.equal(row.memory_date, '2022-06-18')
  assert.equal(row.title, saved.title)
  assert.equal(row.story, saved.story)
  assert.deepEqual(row.scene, saved.scene)
  assert.deepEqual(row.world, saved.world)
  assert.equal(row.photos.length, 2)
  assert.equal(cloud.objects.size, 3)
  assert.ok(row.audio.path.startsWith(`${owner}/${saved.id}/audio-`))
  const uploadCount = cloud.controls.uploads
  await syncJournal(owner, cloud.client)
  assert.equal(cloud.controls.uploads, uploadCount)
})

test('cloud entries download all media into a fresh local account cache', async () => {
  const owner = crypto.randomUUID()
  const cloud = fakeCloud(owner)
  const entry = { ...memory({ photos: [new File(['picture'], 'summer.webp', { type: 'image/webp' })], audio: new File(['sound'], 'voice.mp3', { type: 'audio/mpeg' }) }), id: crypto.randomUUID(), owner, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  await uploadJournalEntry(owner, entry, cloud.client)
  assert.deepEqual(await listEntries(owner), [])
  const result = await syncJournal(owner, cloud.client)
  assert.equal(result.entries[0].title, entry.title)
  assert.equal(await result.entries[0].photos[0].text(), 'picture')
  assert.equal(await result.entries[0].audio.text(), 'sound')
  assert.equal(result.entries[0].audio.name, 'voice.mp3')
  assert.equal(result.entries[0].syncState, 'synced')
})

test('failed metadata uploads leave a pending local copy; retry does not duplicate objects', async () => {
  const owner = crypto.randomUUID()
  const cloud = fakeCloud(owner)
  await saveEntry(owner, memory({ syncState: 'pending', photos: [new File(['picture'], 'summer.jpg', { type: 'image/jpeg' })] }))
  cloud.controls.failRows = true
  const failure = await syncJournal(owner, cloud.client)
  assert.equal(failure.failures.length, 1)
  assert.equal(failure.entries[0].syncState, 'pending')
  assert.equal(await failure.entries[0].photos[0].text(), 'picture')
  cloud.controls.failRows = false
  const success = await syncJournal(owner, cloud.client)
  assert.equal(success.entries[0].syncState, 'synced')
  assert.equal(cloud.objects.size, 1)
  assert.equal(cloud.rows.size, 1)
})

test('mismatched authenticated account is rejected before any upload', async () => {
  const owner = crypto.randomUUID()
  const cloud = fakeCloud(crypto.randomUUID())
  await assert.rejects(syncJournal(owner, cloud.client), /sign in again/)
  assert.equal(cloud.controls.uploads, 0)
})

test('explicit guest import is idempotent and keeps the guest original', async () => {
  const owner = crypto.randomUUID()
  const guest = await saveEntry('local-device', memory())
  assert.equal(await importGuestEntries(owner), 1)
  assert.equal(await importGuestEntries(owner), 0)
  const imported = await listEntries(owner)
  assert.equal(imported.length, 1)
  assert.notEqual(imported[0].id, guest.id)
  assert.equal(imported[0].syncState, 'pending')
  assert.equal((await listEntries('local-device'))[0].id, guest.id)
})
