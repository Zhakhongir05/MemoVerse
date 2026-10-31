import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reliveState, validateReliveResult } from './reliveFlow.js'

test('missing integration never pretends to generate a realistic world', () => {
  assert.equal(reliveState({ photos: [{}] }, false, false), 'unavailable')
  assert.equal(reliveState({ photos: [{}] }, true, false), 'unavailable')
  assert.equal(reliveState({ photos: [{}] }, true, true), 'pending')
})
test('a photograph is required unless a world already exists', () => {
  assert.equal(reliveState({ photos: [] }, true, true), 'needs-photo')
  assert.equal(reliveState({ photos: [], world: { id: 'existing-world' } }, false, true), 'ready')
})
test('empty or invalid generated-world payloads are rejected', () => {
  for (const result of [null, {}, { world: {} }, { world: [] }, { world: 'fake' }]) assert.throws(() => validateReliveResult(result), /not ready/)
  assert.equal(validateReliveResult({ world: { id: 'generated-world' } }).world.id, 'generated-world')
})
