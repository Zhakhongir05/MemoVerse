import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateMockCard } from './mockPayment.js'

const now = new Date(2026, 9, 31)
const card = overrides => ({ name: 'Demo User', number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123', ...overrides })

test('accepts only the explicit local success and decline test numbers', () => {
  assert.deepEqual(validateMockCard(card(), now), {})
  assert.deepEqual(validateMockCard(card({ number: '4000 0000 0000 0002' }), now), {})
  assert.ok(validateMockCard(card({ number: '4111 1111 1111 1111' }), now).number)
})
test('rejects expired or invalid expiry dates but permits the current month', () => {
  assert.ok(validateMockCard(card({ expiry: '09/26' }), now).expiry)
  assert.ok(validateMockCard(card({ expiry: '13/30' }), now).expiry)
  assert.ok(validateMockCard(card({ expiry: '00/30' }), now).expiry)
  assert.deepEqual(validateMockCard(card({ expiry: '10/26' }), now), {})
})
test('requires a demo name and a short numeric CVC', () => {
  assert.ok(validateMockCard(card({ name: ' ' }), now).name)
  assert.ok(validateMockCard(card({ cvc: 'ab3' }), now).cvc)
  assert.ok(validateMockCard(card({ cvc: '12345' }), now).cvc)
})
