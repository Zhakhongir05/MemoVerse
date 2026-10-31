import assert from 'node:assert/strict'
import test from 'node:test'

import { cuesForAnchor, parseSensoryResponse, sensoryRequestFromMemory, storyCues } from './cues.js'
import { requestSensoryCues, sensoryUrl } from './sensoryApi.js'

const cue = (patch = {}) => ({
  id: 'sense-1',
  kind: 'sound',
  engine: 'rain',
  label: 'Rain against the glass',
  detail: 'A steady rain on the window.',
  quote: 'It rained all afternoon.',
  source: 'story',
  intensity: 0.5,
  ...patch,
})
const payload = (...cues) => ({ version: 1, source: 'lexicon', cues })

test('accepts the documented payload', () => {
  const [parsed] = parseSensoryResponse(payload(cue()))
  assert.equal(parsed.engine, 'rain')
  assert.equal(parsed.source, 'story')
  assert.equal(parsed.anchorId, null)
  assert.equal(parsed.quote, 'It rained all afternoon.')
})

test('clamps intensity instead of rejecting the cue', () => {
  assert.equal(parseSensoryResponse(payload(cue({ intensity: 4 })))[0].intensity, 1)
  assert.equal(parseSensoryResponse(payload(cue({ intensity: -2 })))[0].intensity, 0)
  assert.equal(parseSensoryResponse(payload(cue({ intensity: 'loud' })))[0].intensity, 0.5)
})

test('drops one unusable cue and keeps the rest', () => {
  const cues = parseSensoryResponse(payload(
    cue({ kind: 'taste' }),
    cue({ id: 'sense-2', engine: 'smoke' }),
    cue({ id: 'sense-3', kind: 'scent', engine: 'none', source: 'anchor', anchorId: 'bad/id' }),
    cue({ id: 'sense-4', kind: 'scent', engine: 'none', label: 'Woodsmoke' }),
    cue({ id: 'sense-4', kind: 'scent', engine: 'none', label: 'Duplicate' }),
  ))
  assert.deepEqual(cues.map((entry) => entry.label), ['Woodsmoke'])
})

test('anchor cues require a valid anchor id', () => {
  const [parsed] = parseSensoryResponse(payload(cue({ source: 'anchor', anchorId: 'anchor-1' })))
  assert.equal(parsed.anchorId, 'anchor-1')
  assert.deepEqual(parseSensoryResponse(payload(cue({ source: 'anchor' }))), [])
})

test('rejects a malformed envelope', () => {
  assert.throws(() => parseSensoryResponse(null))
  assert.throws(() => parseSensoryResponse({ version: 2, source: 'lexicon', cues: [] }))
  assert.throws(() => parseSensoryResponse({ version: 1, source: 'ai', cues: [] }))
  assert.throws(() => parseSensoryResponse({ version: 1, source: 'lexicon', cues: 'none' }))
  assert.throws(() => parseSensoryResponse(payload(...Array.from({ length: 13 }, (_, index) => cue({ id: 'sense-' + index })))))
})

test('splits anchor cues from ambient story cues', () => {
  const cues = parseSensoryResponse(payload(
    cue(),
    cue({ id: 'sense-2', source: 'anchor', anchorId: 'a1', kind: 'scent', engine: 'none', label: 'Woodsmoke' }),
  ))
  assert.equal(storyCues(cues).length, 1)
  assert.equal(cuesForAnchor(cues, 'a1')[0].label, 'Woodsmoke')
  assert.deepEqual(cuesForAnchor(cues, 'missing'), [])
})

test('builds a bounded request from a saved memory', () => {
  const request = sensoryRequestFromMemory({
    story: '  It rained.  ',
    mood: 'Peaceful',
    world: { memoryAnchors: [
      { id: 'a1', memory: 'The floorboards were cold.' },
      { id: 'bad/id', memory: 'ignored' },
      { id: 'a2', memory: '   ' },
    ] },
  })
  assert.deepEqual(request, { story: '  It rained.  ', anchors: [{ id: 'a1', memory: 'The floorboards were cold.' }], mood: 'Peaceful' })
  assert.deepEqual(sensoryRequestFromMemory({}).anchors, [])
})

test('posts to the stateless endpoint and returns JSON', async () => {
  assert.equal(sensoryUrl(), '/api/sensory-cues')
  let seen
  const result = await requestSensoryCues({ story: 'Rain.', anchors: [] }, {
    fetchImpl: async (url, options) => {
      seen = { url, options }
      return { ok: true, json: async () => payload(cue()) }
    },
  })
  assert.equal(seen.url, '/api/sensory-cues')
  assert.equal(seen.options.method, 'POST')
  assert.equal(seen.options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(seen.options.body), { story: 'Rain.', anchors: [] })
  assert.equal(result.cues.length, 1)
})

test('reports a failed request without hiding the room', async () => {
  await assert.rejects(
    requestSensoryCues({ story: '' }, { fetchImpl: async () => ({ ok: false, status: 503 }) }),
    /still works without them/,
  )
})
