import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveArchivedWorld, saveWorldCustomizations } from './worldPersistence.js'
import { DEMO_ENHANCEMENT_RESPONSE } from '../enhancements/schema.js'
import { journeySteps } from './journalStore.js'
import { waitForGeneration } from './generationCredits.js'

test('reopening signs private references afresh without calling generation or modifying the manifest', async () => {
  let calls = 0
  const world = { schemaVersion: 1, status: 'ready', assets: { splat: { bucket: 'memory-worlds', path: 'owner/memory/job/world.spz' } }, guidedTour: { audioAssets: [{ bucket: 'memory-worlds', path: 'owner/memory/job/tour.mp3' }] } }
  const original = structuredClone(world)
  const client = { storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => {
    assert.equal(bucket, 'memory-worlds'); assert.equal(ttl, 3600)
    return { data: { signedUrl: `https://storage.test/${path}?signature=${++calls}` } }
  } }) } }
  const first = await resolveArchivedWorld(world, client)
  const reopened = await resolveArchivedWorld(world, client)
  assert.notEqual(first.splatUrl, reopened.splatUrl)
  assert.equal(reopened.audioUrls.length, 1)
  assert.deepEqual(world, original)
})

test('expired provider-only worlds and malformed references cannot pretend to be archived', async () => {
  await assert.rejects(resolveArchivedWorld({ splatUrl: 'expired' }), /not been archived/)
  await assert.rejects(resolveArchivedWorld({ schemaVersion: 1, status: 'ready', assets: { splat: { bucket: 'public', path: 'test' } } }, {}), /Invalid archived asset/)
})

test('placements preserve exact transforms, prevent regrounding and use optimistic revision locking', async () => {
  const input = structuredClone(DEMO_ENHANCEMENT_RESPONSE)
  const original = structuredClone(input)
  const world = { id: input.worldId, revision: 4, guidedTour: { script: 'A familiar place', chapters: [] } }
  await saveWorldCustomizations({ id: 'memory', world }, input, world.guidedTour, { rpc: async (name, args) => {
    assert.equal(name, 'save_world_customizations')
    assert.equal(args.p_revision, 4)
    assert.deepEqual(args.p_tour, world.guidedTour)
    args.p_enhancements.enhancements.forEach((item, index) => {
      assert.deepEqual(item.position, input.enhancements[index].position)
      assert.deepEqual(item.rotation, input.enhancements[index].rotation)
      assert.deepEqual(item.scale, input.enhancements[index].scale)
      assert.equal(item.anchor, 'none')
    })
    return { data: { ...world, revision: 5 } }
  } })
  assert.deepEqual(input, original)
  await assert.rejects(saveWorldCustomizations({ id: 'memory', world }, input, null, { rpc: async () => ({ error: { message: 'WORLD_CONFLICT_RELOAD' } }) }), /another device/)
})

test('saved chapters retain their narration and camera anchors when revisited', () => {
  const chapter = { id: 'arrival', title: 'Home', text: 'Welcome back', audioAssetIndex: 0, anchorId: 'lamp', cameraPose: { position: [1, 2, 3] } }
  const steps = journeySteps({ id: 'memory', photos: [], story: 'Different journal text', world: { guidedTour: { chapters: [chapter] } } })
  assert.deepEqual(steps[0], { ...chapter, photoIndex: null })
})

test('recovered jobs use stored results and aborted polling never submits another generation', async () => {
  const result = { world: { id: 'saved' } }
  const client = { from: table => ({ select: () => ({ eq: () => ({ single: async () => {
    assert.equal(table, 'generation_requests')
    return { data: { state: 'succeeded', result } }
  } }) }) }) }
  assert.deepEqual(await waitForGeneration('job', undefined, client), result)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(waitForGeneration('job', controller.signal, client), /abort/i)
})
