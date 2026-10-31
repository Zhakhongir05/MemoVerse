import test from 'node:test'
import assert from 'node:assert/strict'
import { estimatedWorldProgress } from './worldProgress.js'

test('estimates increase while waiting but never claim a completed world', () => {
  const values = [0, 1000, 60000, 300000, 3600000].map(estimatedWorldProgress)
  assert.equal(values[0], 1)
  assert.ok(values.every((value, index) => value >= (values[index - 1] ?? 0) && value < 100))
  assert.equal(values.at(-1), 95)
  assert.equal(estimatedWorldProgress(-100), 1)
})
