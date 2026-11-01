import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, routePath } from './routes.js'

const id = '54f8a20d-d08e-485e-b83d-cb12c9eff646'

test('the landing page is the only address outside the journal', () => {
  assert.deepEqual(parseRoute('/'), { screen: 'landing' })
  assert.deepEqual(parseRoute('/unknown'), { screen: 'landing' })
})

test('journal sections have their own addresses', () => {
  assert.deepEqual(parseRoute('/journal'), { screen: 'journal', view: 'journal' })
  assert.deepEqual(parseRoute('/journal/'), { screen: 'journal', view: 'journal' })
  assert.deepEqual(parseRoute('/journal/timeline'), { screen: 'journal', view: 'timeline' })
  assert.deepEqual(parseRoute('/journal/worlds'), { screen: 'journal', view: 'creations' })
  assert.deepEqual(parseRoute('/journal/plans'), { screen: 'journal', view: 'plans' })
  assert.deepEqual(parseRoute('/journal/new'), { screen: 'journal', view: 'create' })
  assert.deepEqual(parseRoute('/journal/demo'), { screen: 'journal', view: 'relive', demo: true })
})

test('a memory address restores the exact screen', () => {
  assert.deepEqual(parseRoute('/journal/memory/' + id), { screen: 'journal', view: 'detail', memoryId: id })
  assert.deepEqual(parseRoute('/journal/memory/' + id + '/edit'), { screen: 'journal', view: 'edit', memoryId: id })
  assert.deepEqual(parseRoute('/journal/memory/' + id + '/prepare'), { screen: 'journal', view: 'prepare', memoryId: id })
  assert.deepEqual(parseRoute('/journal/memory/' + id + '/relive'), { screen: 'journal', view: 'relive', memoryId: id })
})

test('addresses are strict: a malformed or foreign memory id is not trusted', () => {
  assert.deepEqual(parseRoute('/journal/memory/not-a-uuid'), { screen: 'landing' })
  assert.deepEqual(parseRoute('/journal/memory/' + id + '/generate'), { screen: 'landing' })
  assert.deepEqual(parseRoute('/journal/memory/' + id + '/relive/extra'), { screen: 'landing' })
})

test('older #world share links still resolve to the world', () => {
  assert.deepEqual(parseRoute('/', '#world/' + id), { screen: 'journal', view: 'relive', memoryId: id, legacy: true })
})

test('routePath is the inverse of parseRoute for journal screens', () => {
  assert.equal(routePath({ view: 'journal' }), '/journal')
  assert.equal(routePath({ view: 'timeline' }), '/journal/timeline')
  assert.equal(routePath({ view: 'creations' }), '/journal/worlds')
  assert.equal(routePath({ view: 'create' }), '/journal/new')
  assert.equal(routePath({ view: 'create', draftId: id }), '/journal/memory/' + id + '/edit')
  assert.equal(routePath({ view: 'detail', memoryId: id }), '/journal/memory/' + id)
  assert.equal(routePath({ view: 'prepare', memoryId: id }), '/journal/memory/' + id + '/prepare')
  assert.equal(routePath({ view: 'relive', memoryId: id }), '/journal/memory/' + id + '/relive')
  assert.equal(routePath({ view: 'relive', demo: true }), '/journal/demo')
  assert.equal(routePath({ view: 'relive' }), '/journal')
  assert.equal(routePath({ view: 'detail' }), '/journal')
})
