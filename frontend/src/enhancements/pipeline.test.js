import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { memoryPhoto, photoUrl, readPhoto } from './photo.js'
import { cacheIdentity, loadManifest, saveManifest } from './cache.js'
import { generatedManifest, loadFurniture } from './generation.js'
import { DEMO_ENHANCEMENT_RESPONSE } from './schema.js'
const worldId = DEMO_ENHANCEMENT_RESPONSE.worldId
const ai = () => ({ ...structuredClone(DEMO_ENHANCEMENT_RESPONSE), source: 'ai', fallback: false })
const photo = text => new File([text], 'room.jpg', { type: 'image/jpeg' })
const identity = (extra = {}) => cacheIdentity({ owner: 'account-a', memory: { id: crypto.randomUUID() }, worldId, photo: photo('pixels'), story: 'my story', ...extra })
const response = file => ({ ok: true, headers: new Headers({ 'content-type': file.type }), blob: async () => file })

test('Studio blob URLs, Journal URL records and persisted Journal File photos resolve correctly', () => {
  const file = photo('a')
  assert.equal(memoryPhoto({ photos: [file] }), file)
  assert.deepEqual(photoUrl(file, () => 'blob:journal-file'), { url: 'blob:journal-file', owned: true })
  assert.deepEqual(photoUrl({ url: 'https://storage.example/signed-photo' }), { url: 'https://storage.example/signed-photo', owned: false })
  assert.equal(photoUrl('blob:studio').url, 'blob:studio')
  assert.equal(photoUrl(null).url, '')
  assert.throws(() => photoUrl({ url: 'javascript:alert(1)' }))
})

test('missing and expired photos fail explicitly before requesting generation', async () => {
  let calls = 0
  const generate = async () => { calls++; return ai() }
  await assert.rejects(loadFurniture({ imageUrl: '', worldId }, { generate }), /Add a photograph/)
  await assert.rejects(loadFurniture({ imageUrl: 'https://expired.example', worldId }, { fetchImpl: async () => ({ ok: false, status: 403 }), generate }), /expired/)
  assert.equal(calls, 0)
  await assert.rejects(readPhoto('blob:large', { fetchImpl: async () => response(new File([new Uint8Array(5*1024*1024+1)], 'large.jpg', { type: 'image/jpeg' })) }), /5 MB/)
})

test('the exact photo bytes reach the provider request and distinct photos are not conflated', async () => {
  const seen = []
  const generate = async input => { seen.push(await input.photo.text()); const p = ai(); p.enhancements = p.enhancements.slice(0, input.photo.size); return p }
  for (const content of ['a', 'bb']) {
    const result = await loadFurniture({ imageUrl: 'blob:memory', worldId, story: 'User words' }, { fetchImpl: async () => response(photo(content)), generate, readCache: async () => null })
    assert.equal(result.list.length, content.length)
  }
  assert.deepEqual(seen, ['a', 'bb'])
})

test('demo, empty, malformed and failed responses never silently substitute furniture', async () => {
  assert.throws(() => generatedManifest({ ...ai(), source: 'demo', fallback: true }, worldId), /unavailable or disabled/)
  assert.throws(() => generatedManifest({ ...ai(), enhancements: [] }, worldId), /No supported furniture/)
  assert.throws(() => generatedManifest({ ...ai(), worldId: 'wrong-world' }, worldId), /targets world/)
  await assert.rejects(loadFurniture({ imageUrl: 'blob:memory', worldId }, { fetchImpl: async () => response(photo('a')), readCache: async () => null, generate: async () => { throw new Error('API unavailable') } }), /API unavailable/)
})

test('adjusted placements survive database reopen and skip regeneration on Relive', async () => {
  const memory = { id: crypto.randomUUID(), owner: 'account-a' }
  const id = await identity({ memory })
  const payload = ai(); payload.enhancements[0].position = [1.23, -0.4, -2.34]; payload.enhancements[0].rotation = [0, 1.57, 0]
  await saveManifest(id, payload)
  const result = await loadFurniture({ imageUrl: 'blob:new-url-after-reload', owner: 'account-a', memory, worldId, story: 'my story' }, { fetchImpl: async () => response(photo('pixels')), generate: async () => { throw new Error('Must reuse saved manifest') } })
  assert.equal(result.source, 'saved')
  assert.deepEqual(result.list[0].position, [1.23, -0.4, -2.34])
  assert.deepEqual(result.list[0].rotation, [0, 1.57, 0])
  assert.equal(result.list[0].anchor, 'none')
})

test('cache is scoped by owner, memory, world, image content and story', async () => {
  const memory = { id: crypto.randomUUID() }
  const opts = { memory }
  const id = await identity(opts); await saveManifest(id, ai())
  for (const override of [{ owner: 'account-b' }, { memory: { id: crypto.randomUUID() } }, { worldId: 'another-world' }, { photo: photo('changed pixels') }, { story: 'changed story' }]) {
    assert.equal(await loadManifest(await identity({ ...opts, ...override })), null)
  }
  assert.throws(() => generatedManifest({ ...ai(), fallback: true }, worldId))
})
