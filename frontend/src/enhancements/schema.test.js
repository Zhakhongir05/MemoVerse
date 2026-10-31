import assert from 'node:assert/strict'
import test from 'node:test'

import { DEMO_ENHANCEMENT_RESPONSE, fitEnhancementsToBounds, parseEnhancementResponse, parseEnhancementsForWorld } from './schema.js'

const clone = () => structuredClone(DEMO_ENHANCEMENT_RESPONSE)

test('accepts the documented backend payload', () => {
  const parsed = parseEnhancementResponse(clone())
  assert.equal(parsed.worldId, DEMO_ENHANCEMENT_RESPONSE.worldId)
  assert.equal(parsed.enhancements.length, 6)
  assert.deepEqual(parsed.enhancements[0].position, [-0.8, -0.3, -2.8])
  assert.equal(parsed.enhancements[1].assetId, 'rug-feather-01')
})

test('normalizes scalar scale and omitted rotation', () => {
  const payload = clone()
  payload.enhancements[0].scale = 1.5
  delete payload.enhancements[0].rotation
  const [enhancement] = parseEnhancementResponse(payload).enhancements
  assert.deepEqual(enhancement.scale, [1.5, 1.5, 1.5])
  assert.deepEqual(enhancement.rotation, [0, 0, 0])
})

test('defaults the anchor by furniture type', () => {
  const enhancements = parseEnhancementResponse(clone()).enhancements
  assert.equal(enhancements[0].anchor, 'floor') // bed
  assert.equal(enhancements[4].anchor, 'ceiling') // pendant
})

test('accepts an explicit anchor and rejects unknown ones', () => {
  const payload = clone()
  payload.enhancements[0].anchor = 'none'
  assert.equal(parseEnhancementResponse(payload).enhancements[0].anchor, 'none')

  payload.enhancements[0].anchor = 'sofa'
  assert.throws(() => parseEnhancementResponse(payload), /anchor/)
})

test('rejects an asset outside the approved catalog', () => {
  const payload = clone()
  payload.enhancements[0].assetId = 'https://evil.example/model.glb'
  assert.throws(() => parseEnhancementResponse(payload), /approved catalog/)
})

test('rejects an asset whose catalog type disagrees', () => {
  const payload = clone()
  payload.enhancements[0].type = 'desk'
  assert.throws(() => parseEnhancementResponse(payload), /does not match its type/)
})

test('rejects duplicate ids', () => {
  const payload = clone()
  payload.enhancements[1].id = payload.enhancements[0].id
  assert.throws(() => parseEnhancementResponse(payload), /duplicate id/)
})

test('rejects non-finite transforms and impossible scales', () => {
  const nan = clone()
  nan.enhancements[0].position[1] = Number.NaN
  assert.throws(() => parseEnhancementResponse(nan), /position/)

  const zero = clone()
  zero.enhancements[0].scale = [1, 0, 1]
  assert.throws(() => parseEnhancementResponse(zero), /scale/)
})

test('rejects unsupported types', () => {
  const payload = clone()
  payload.enhancements[0].type = 'sofa'
  assert.throws(() => parseEnhancementResponse(payload), /not supported/)
})

test('refuses a payload for a different world', () => {
  assert.throws(() => parseEnhancementsForWorld(clone(), 'another-world'), /targets world/)
})

test('rejects an oversized enhancement list', () => {
  const payload = clone()
  payload.enhancements = Array.from({ length: 21 }, (_, index) => ({
    ...structuredClone(DEMO_ENHANCEMENT_RESPONSE.enhancements[0]),
    id: `bed-${index}`,
  }))
  assert.throws(() => parseEnhancementResponse(payload), /too many/)
})

test('fits approximate placements inside the room, clamped on x/z only', () => {
  const bounds = { min: { x: -4, y: -1.5, z: -6 }, max: { x: 3, y: 2.5, z: 2 } }
  const enhancements = parseEnhancementResponse(clone()).enhancements
  const outside = enhancements.map((enhancement, index) => ({
    ...enhancement,
    position: index === 0 ? [40, 5, -40] : enhancement.position,
  }))

  const fitted = fitEnhancementsToBounds(outside, bounds)

  assert.deepEqual(fitted[0].position, [3 - 0.15, 5, -6 + 0.15])
  assert.deepEqual(fitted[1].position, enhancements[1].position)
})

test('centers placements when the room is narrower than the margin', () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 0.1, y: 1, z: 0.1 } }
  const [enhancement] = parseEnhancementResponse(clone()).enhancements
  const [fitted] = fitEnhancementsToBounds([{ ...enhancement, position: [9, 1, 9] }], bounds)
  assert.deepEqual(fitted.position, [0.05, 1, 0.05])
})
