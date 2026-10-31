import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePodcast } from './preparePodcast.js'
const id = () => crypto.randomUUID()
test('one world prepares one durable podcast and revisits only read saved audio', async () => {
  const owner = id(), memory = id(), calls = []
  let tour = null
  const request = async (path, options = {}) => {
    calls.push([path, options.method || 'GET'])
    if (!options.method) return { tour, generation_enabled: true }
    if (path.startsWith('/memories/')) { assert.equal(options.body.regenerate, false); tour = { id: id(), status: 'pending' }; return { tour } }
    tour = { ...tour, status: 'ready' }; return { tour, advanced: true }
  }
  const first = preparePodcast(owner, memory, request)
  const second = preparePodcast(owner, memory, request)
  assert.equal(first, second)
  assert.equal((await first).tour.status, 'ready')
  assert.equal(calls.filter(([, method]) => method === 'POST').length, 2)
  calls.length = 0
  await preparePodcast(owner, memory, request)
  assert.deepEqual(calls, [['/memories/' + memory, 'GET']])
})
test('disabled, failed, uncertain and existing ready recordings never submit paid work', async () => {
  for (const status of ['ready', 'failed', 'uncertain', null]) {
    let calls = 0
    await preparePodcast(id(), id(), async (path, options) => { assert.equal(options, undefined); calls++; return { tour: status ? { status } : null, generation_enabled: status !== null } })
    assert.equal(calls, 1)
  }
})
test('interrupted pending jobs resume the same tour without creating another version', async () => {
  const tourId = id(), methods = []
  let status = 'pending'
  await preparePodcast(id(), id(), async (path, options) => {
    methods.push(options?.method || 'GET')
    if (options) { assert.equal(path, '/tours/' + tourId + '/advance'); status = 'ready'; return { advanced: true, tour: { id: tourId, status } } }
    return { generation_enabled: true, tour: { id: tourId, status }, stale: true }
  })
  assert.deepEqual(methods, ['GET', 'POST', 'GET'])
})
test('busy leases and unknown network outcomes cannot spin into a new reservation', async () => {
  const owner = id(), memory = id(), tourId = id()
  const methods = []
  await preparePodcast(owner, memory, async (path, options) => {
    methods.push(options?.method || 'GET')
    return options ? { tour: { id: tourId, status: 'pending' }, advanced: false } : { tour: { id: tourId, status: 'pending' }, generation_enabled: true }
  })
  assert.deepEqual(methods, ['GET', 'POST', 'GET'])
  await assert.rejects(preparePodcast(id(), id(), async () => { throw new Error('offline') }), /offline/)
})
