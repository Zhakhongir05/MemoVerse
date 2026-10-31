import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceMemorycast, audioLinkExpired, memorycastClient, playableChapters } from './memorycastClient.js'
import { cameraCueTarget } from './memorycastCameraCue.js'

function fixture(handler) {
  let owner = 'A'
  const calls = []
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner }, access_token: `session-${owner}` } } }) } }
  const api = memorycastClient('A', client, { fetchImpl: async (path, options) => { calls.push({ path, ...options }); return { ok: true, json: async () => handler(path, options) } } })
  return { api, calls, switchAccount: () => { owner = 'B' } }
}
test('opening and replaying only GET with the existing session token, including older-tour URL refresh', async () => {
  const f = fixture(() => ({ tour: null }))
  await f.api.load('memory'); await f.api.load('memory', { tourId: 'old' })
  assert.ok(f.calls.every(call => call.method === 'GET' && call.headers.Authorization === 'Bearer session-A' && call.credentials === 'omit'))
  assert.match(f.calls[1].path, /tour_id=old/)
  await assert.rejects(f.api.generate('memory', {}), /approval/)
  assert.equal(f.calls.length, 2)
})
test('paid generation requires explicit approval and regeneration flag; concurrent clicks cannot overlap', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const f = fixture(async () => { await gate; return { tour: { id: 'tour' } } })
  const first = f.api.generate('memory', { approved: true, regenerate: true, language: 'ko' })
  await assert.rejects(f.api.generate('memory', { approved: true }), /already running/)
  release(); await first
  assert.deepEqual(JSON.parse(f.calls[0].body), { approved: true, regenerate: true, language: 'ko' })
})
test('generation advances serially and waits/checks status when a different worker owns the lease', async () => {
  const calls = [], updates = []
  let step = 0
  const pending = () => ({ id: 'tour', status: 'pending', next_step: step })
  const api = {
    advance: async () => { calls.push('advance'); return { tour: step++ === 0 ? pending() : { id: 'tour', status: 'ready' }, advanced: step > 1 } },
    load: async () => { calls.push('get'); return { tour: step < 2 ? pending() : { id: 'tour', status: 'ready', audio: ['signed'] } } },
  }
  const result = await advanceMemorycast(api, 'memory', { tour: pending() }, { onUpdate: value => updates.push(value), wait: async ms => { assert.equal(ms, 4000); calls.push('wait') } })
  assert.deepEqual(calls, ['advance', 'wait', 'get', 'advance', 'get'])
  assert.equal(result.tour.status, 'ready')
  assert.deepEqual(result.tour.audio, ['signed'])
})
test('failed and uncertain steps stop without another advance or generation', async () => {
  for (const status of ['failed', 'uncertain']) {
    let calls = 0
    const result = await advanceMemorycast({ advance: async () => { calls++; return { tour: { status } } } }, 'memory', { tour: { id: 'tour', status: 'pending' } })
    assert.equal(result.tour.status, status); assert.equal(calls, 1)
  }
})
test('ambiguous network failure is never automatically retried', async () => {
  let calls = 0
  await assert.rejects(advanceMemorycast({ advance: async () => { calls++; throw new Error('Lost response') } }, 'memory', { tour: { id: 'tour', status: 'pending' } }), /Lost response/)
  assert.equal(calls, 1)
})
test('account switching blocks requests and discards a prior account’s late response', async () => {
  const first = fixture(() => ({ tour: null }))
  first.switchAccount()
  await assert.rejects(first.api.load('memory'), { name: 'AbortError' }); assert.equal(first.calls.length, 0)
  const late = fixture(() => { late.switchAccount(); return { tour: { private: true } } })
  // Switch during the fetch itself, before the post-response session check.
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: late.calls.length ? 'B' : 'A' }, access_token: 'session' } } }) } }
  const api = memorycastClient('A', client, { fetchImpl: async () => { late.calls.push({}); return { ok: true, json: async () => ({ private: true }) } } })
  await assert.rejects(api.load('memory'), { name: 'AbortError' })
})
test('ready playback uses actual durations and chapter order; malformed audio is rejected', () => {
  const tour = { status: 'ready', script: { chapters: [3, 1, 2].map(order => ({ order, subtitles: `chapter ${order}` })) }, audio: [2, 3, 1].map(order => ({ order, url: `https://private.test/${order}.wav`, expires_in: 900, duration_seconds: order * 1.25 })) }
  assert.deepEqual(playableChapters(tour).map(chapter => chapter.audio.duration_seconds), [1.25, 2.5, 3.75])
  tour.audio[0].duration_seconds = NaN
  assert.throws(() => playableChapters(tour), /audio needs review/)
})
test('migration and disabled-server errors are actionable and never expose backend details', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'A' }, access_token: 'token' } } }) } }
  const api = memorycastClient('A', client, { fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ detail: 'private provider credential' }) }) })
  await assert.rejects(api.load('memory'), /database setup is not enabled/)
})
test('audio URLs refresh before backend expiry, independently of chapter duration', () => {
  assert.equal(audioLinkExpired(1000, 900, 1000 + 869000), false)
  assert.equal(audioLinkExpired(1000, 900, 1000 + 870000), true)
})
test('camera cues never animate with reduced motion or invalid/unknown targets', () => {
  const cue = { camera: { target: [1, 0, -2] } }
  assert.deepEqual(cameraCueTarget(cue, false), [1, 0, -2])
  assert.equal(cameraCueTarget(cue, true), null)
  assert.equal(cameraCueTarget({ camera: { target: [NaN, 0, 0] } }, false), null)
  assert.equal(cameraCueTarget({ camera: { target: [100, 0, 0] } }, false), null)
  assert.equal(cameraCueTarget({}, false), null)
})
