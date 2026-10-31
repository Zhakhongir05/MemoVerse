import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { journeySteps, listEntries, MOODS, saveEntry, validateEntry } from './journalStore.js'

const entry = overrides => ({ title: 'Summer light', date: '2024-07-12', story: 'The windows were open.', mood: 'Nostalgic', photos: [], audio: null, ...overrides })

test('six photographs persist in order within one entry; a seventh is rejected', async () => {
  const owner = crypto.randomUUID()
  const photos = Array.from({ length: 6 }, (_, index) => new File([String(index)], `photo-${index}.jpg`, { type: 'image/jpeg' }))
  await saveEntry(owner, entry({ photos }))
  const [reopened] = await listEntries(owner)
  assert.deepEqual(await Promise.all(reopened.photos.map(photo => photo.text())), ['0', '1', '2', '3', '4', '5'])
  assert.ok(validateEntry(entry({ photos: [...photos, photos[0]] })).photos)
})

test('every journal feeling can be saved and restored', async () => {
  const owner = crypto.randomUUID()
  for (const mood of MOODS) await saveEntry(owner, entry({ mood }))
  assert.deepEqual((await listEntries(owner)).map(memory => memory.mood).sort(), [...MOODS].sort())
  assert.ok(validateEntry(entry({ mood: 'Unknown' })).mood)
})

test('journal and timeline sort by memory date across years, not creation order', async () => {
  const owner = crypto.randomUUID()
  await saveEntry(owner, entry({ date: '2024-07-12' }))
  await saveEntry(owner, entry({ date: '2020-01-02' }))
  await saveEntry(owner, entry({ date: '2026-10-31' }))
  assert.deepEqual((await listEntries(owner)).map(item => item.date), ['2026-10-31', '2024-07-12', '2020-01-02'])
})

test('photos and audio persist across reopened IndexedDB connections without object URLs', async () => {
  const owner = crypto.randomUUID()
  const photos = [new File(['photo bytes'], 'holiday.jpg', { type: 'image/jpeg' })]
  const audio = new File(['voice bytes'], 'voice.mp3', { type: 'audio/mpeg' })
  const saved = await saveEntry(owner, entry({ photos, audio, story: '' }))
  const [reopened] = await listEntries(owner)
  assert.equal(reopened.id, saved.id)
  assert.equal(await reopened.photos[0].text(), 'photo bytes')
  assert.equal(await reopened.audio.text(), 'voice bytes')
  assert.equal(reopened.photos[0].type, 'image/jpeg')
  assert.equal(reopened.audio.type, 'audio/mpeg')
})

test('editing updates one entry, preserving its creation date and owner', async () => {
  const owner = crypto.randomUUID()
  const saved = await saveEntry(owner, entry())
  const edited = await saveEntry(owner, { ...saved, title: 'Summer remembered', mood: 'Joyful' })
  const rows = await listEntries(owner)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, 'Summer remembered')
  assert.equal(edited.createdAt, saved.createdAt)
  assert.equal(edited.id, saved.id)
})

test('account namespaces hide other journals and reject overwriting another owner’s ID', async () => {
  const owner = crypto.randomUUID()
  const other = crypto.randomUUID()
  const saved = await saveEntry(owner, entry())
  assert.deepEqual(await listEntries(other), [])
  await assert.rejects(saveEntry(other, { ...saved, title: 'Overwrite' }), /another journal/)
  assert.equal((await listEntries(owner))[0].title, 'Summer light')
})

test('invalid dates and empty memories cannot be committed', async () => {
  assert.ok(validateEntry(entry({ date: '2025-02-30' })).date)
  assert.ok(validateEntry(entry({ title: '' })).title)
  assert.ok(validateEntry(entry({ story: '' })).story)
  await assert.rejects(saveEntry(crypto.randomUUID(), entry({ date: '2025-02-30' })), /Check your memory/)
})

test('guided steps use real paragraphs and photo anchors without fabricated camera or narration', () => {
  const steps = journeySteps(entry({ id: 'memory', story: 'We arrived.\n\nWe watched the sun.', photos: [new File(['p'], 'p.jpg')] }))
  assert.equal(steps.length, 2)
  assert.equal(steps[1].text, 'We watched the sun.')
  assert.equal(steps[0].photoIndex, 0)
  assert.equal(steps[0].cameraPose, null)
  assert.equal(steps[0].narrationUrl, null)
})
