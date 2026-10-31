import assert from 'node:assert/strict'
import test from 'node:test'

import { DEMO_ENHANCEMENT_RESPONSE, fitEnhancementsToBounds, parseEnhancementResponse, parseEnhancementsForWorld, spreadEnhancementsInRoom } from './schema.js'

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

test('spreads a pile of near-origin guesses across the room', () => {
  const bounds = { min: { x: -5, y: -1, z: -8 }, max: { x: 5, y: 2.5, z: 4 } }
  const pile = [
    { id: 'a', anchor: 'floor', position: [-0.2, 0, -0.1] },
    { id: 'b', anchor: 'floor', position: [0.3, 0, 0.2] },
  ]

  const spread = spreadEnhancementsInRoom(pile, bounds)

  // Centred on the room and separated along both axes.
  assert.ok(spread[0].position[0] < spread[1].position[0])
  assert.ok(spread[0].position[2] < spread[1].position[2])
  assert.equal(spread[0].position[1], 0)
  for (const item of spread) {
    assert.ok(item.position[0] >= -5 + 0.15 && item.position[0] <= 5 - 0.15)
    assert.ok(item.position[2] >= -8 + 0.15 && item.position[2] <= 4 - 0.15)
  }
})

test('spreads only up to part of the room and never shrinks a fitted layout', () => {
  const bounds = { min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 3, z: 10 } }
  const wide = [
    { id: 'a', anchor: 'floor', position: [-8, 0, -8] },
    { id: 'b', anchor: 'floor', position: [8, 0, 8] },
  ]
  assert.deepEqual(spreadEnhancementsInRoom(wide, bounds), wide)

  const pile = [
    { id: 'a', anchor: 'floor', position: [0, 0, 0] },
    { id: 'b', anchor: 'floor', position: [0.5, 0, 0.5] },
  ]
  const spread = spreadEnhancementsInRoom(pile, bounds)
  const span = spread[1].position[0] - spread[0].position[0]
  assert.ok(span > 0.5 && span < 20)
})

test('never moves user-adjusted placements or spreads a single object', () => {
  const bounds = { min: { x: -5, y: -1, z: -8 }, max: { x: 5, y: 2.5, z: 4 } }
  const mixed = [
    { id: 'a', anchor: 'floor', position: [0, 0, 0] },
    { id: 'b', anchor: 'floor', position: [0.4, 0, 0.3] },
    { id: 'pinned', anchor: 'none', position: [2, 1, -3] },
  ]
  const spread = spreadEnhancementsInRoom(mixed, bounds)
  assert.deepEqual(spread[2], mixed[2])
  assert.notDeepEqual(spread[0].position, mixed[0].position)

  const single = [{ id: 'a', anchor: 'floor', position: [0, 0, 0] }]
  assert.deepEqual(spreadEnhancementsInRoom(single, bounds), single)
  assert.deepEqual(spreadEnhancementsInRoom(mixed, null), mixed)
})
