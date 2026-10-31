import assert from 'node:assert/strict'
import test from 'node:test'

import { ENHANCEMENTS_ENDPOINT, requestEnhancements, toProposal } from './api.js'
import { DEMO_ENHANCEMENT_RESPONSE, parseEnhancementsForWorld } from './schema.js'

function captureFetch(payload, init = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => payload,
      text: async () => init.detail ?? '',
    }
  }
  return { calls, fetchImpl }
}

test('posts the documented context as multipart form data', async () => {
  const { calls, fetchImpl } = captureFetch(DEMO_ENHANCEMENT_RESPONSE)
  const proposals = DEMO_ENHANCEMENT_RESPONSE.enhancements.map(toProposal)

  await requestEnhancements(
    { worldId: DEMO_ENHANCEMENT_RESPONSE.worldId, story: 'A quiet room.', proposals },
    { fetchImpl },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, ENHANCEMENTS_ENDPOINT)
  assert.equal(calls[0].options.method, 'POST')
  assert.ok(calls[0].options.body instanceof FormData)

  const context = JSON.parse(calls[0].options.body.get('context'))
  assert.deepEqual(Object.keys(context).sort(), ['coordinateFrame', 'evidence', 'proposals', 'story', 'worldId'])
  assert.equal(context.worldId, DEMO_ENHANCEMENT_RESPONSE.worldId)
  assert.equal(context.coordinateFrame, 'render-y-up')
  assert.equal(context.proposals.length, 6)
  assert.equal(calls[0].options.body.get('photo'), null)
})

test('appends an optional photo and defaults empty collections', async () => {
  const { calls, fetchImpl } = captureFetch({ worldId: 'w', enhancements: [] })
  const photo = new Blob(['pixels'], { type: 'image/jpeg' })

  await requestEnhancements({ worldId: 'w', photo }, { fetchImpl })

  const body = calls[0].options.body
  assert.ok(body.get('photo') instanceof Blob)
  const context = JSON.parse(body.get('context'))
  assert.deepEqual(context.proposals, [])
  assert.deepEqual(context.evidence, [])
  assert.equal(context.story, '')
})

test('rejects without a worldId before calling fetch', async () => {
  let called = false
  await assert.rejects(
    requestEnhancements({}, { fetchImpl: async () => { called = true } }),
    /worldId is required/,
  )
  assert.equal(called, false)
})

test('throws a readable error for a non-OK response', async () => {
  const { fetchImpl } = captureFetch(null, { ok: false, status: 422, detail: 'Invalid context' })
  await assert.rejects(
    requestEnhancements({ worldId: 'w' }, { fetchImpl }),
    /Enhancement request failed \(422\): Invalid context/,
  )
})

test('returns a payload the schema validator accepts', async () => {
  const { fetchImpl } = captureFetch(DEMO_ENHANCEMENT_RESPONSE)
  const payload = await requestEnhancements(
    { worldId: DEMO_ENHANCEMENT_RESPONSE.worldId },
    { fetchImpl },
  )
  const enhancements = parseEnhancementsForWorld(payload, DEMO_ENHANCEMENT_RESPONSE.worldId)
  assert.equal(enhancements.length, 6)
  assert.equal(enhancements[0].anchor, 'floor')
})

test('toProposal keeps approved keys and drops renderer-only ones', () => {
  const proposal = toProposal({
    ...DEMO_ENHANCEMENT_RESPONSE.enhancements[0],
    model: 'renderer-only',
    selected: true,
  })
  assert.deepEqual(proposal, DEMO_ENHANCEMENT_RESPONSE.enhancements[0])
  assert.equal('model' in proposal, false)
  assert.equal('selected' in proposal, false)
})
