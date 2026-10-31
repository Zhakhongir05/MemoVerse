import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FREE_GENERATIONS, PAID_PACK_GENERATIONS, PAID_PACK_PRICE_KRW, getGenerationPlan, remainingCredits, requestCreditGeneration } from './generationCredits.js'

test('plan terms are three lifetime Free generations and fifteen for 10000 KRW', () => {
  assert.equal(FREE_GENERATIONS, 3)
  assert.equal(PAID_PACK_GENERATIONS, 15)
  assert.equal(PAID_PACK_PRICE_KRW, 10000)
  assert.equal(remainingCredits({ credits_total: 3, credits_used: 3 }), 0)
  assert.equal(remainingCredits({ credits_total: 18, credits_used: 3 }), 15)
  assert.equal(remainingCredits({ credits_total: 3, credits_used: 10 }), 0)
})

test('a new account displays Free allowance but cannot mutate a plan', async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }
  const account = await getGenerationPlan({ id: 'user' }, client)
  assert.equal(account.plan, 'free')
  assert.equal(remainingCredits(account), 3)
})

test('generation submits exactly one photo and never browser-controlled plan or price fields', async () => {
  let payload
  const client = { functions: { invoke: async (name, options) => { payload = { name, form: options.body }; return { data: { world: { id: 'result' } }, error: null } } } }
  const photo = new File(['picture'], 'photo.jpg', { type: 'image/jpeg' })
  await requestCreditGeneration({ memory: { id: 'entry' }, photos: [photo], story: 'A sunny day' }, client)
  assert.equal(payload.name, 'generate-memory')
  assert.equal(payload.form.getAll('photo').length, 1)
  assert.equal(payload.form.get('story'), 'A sunny day')
  assert.equal(payload.form.get('plan'), null)
  assert.equal(payload.form.get('credits'), null)
  await assert.rejects(requestCreditGeneration({ memory: { id: 'entry' }, photos: [photo, photo] }, client), /exactly one/)
})

test('server credit-limit errors are shown instead of fabricated success', async () => {
  const client = { functions: { invoke: async () => ({ error: { context: { json: async () => ({ error: 'No generation credits remaining.' }) } } }) } }
  await assert.rejects(requestCreditGeneration({ memory: { id: 'entry' }, photo: new File(['p'], 'p.jpg') }, client), /No generation credits/)
})
