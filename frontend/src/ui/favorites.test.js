import test from 'node:test'
import assert from 'node:assert/strict'
import { cachedFavorites, setFavorite, syncFavorites } from './favorites.js'
const storage = () => { const values = new Map(); return { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) } }
test('guest hearts survive reload, toggle off and stay separate from account favorites', async () => {
  const cache = storage()
  await setFavorite('local-device', 'memory-a', true, null, cache)
  assert.equal(cachedFavorites('local-device', cache).values['memory-a'], true)
  assert.deepEqual(cachedFavorites('other-user', cache).values, {})
  await setFavorite('local-device', 'memory-a', false, null, cache)
  assert.equal(cachedFavorites('local-device', cache).values['memory-a'], false)
})
test('offline account favorites remain queued; another account cannot send them', async () => {
  const cache = storage()
  await assert.rejects(setFavorite('account-a', 'memory-a', true, null, cache), /saved on this device/)
  assert.deepEqual(cachedFavorites('account-a', cache).pending, { 'memory-a': true })
  await assert.rejects(syncFavorites('account-a', { auth: { getUser: async () => ({ data: { user: { id: 'account-b' } } }) } }, cache), /Sign in again/)
})
test('account sync persists hearts in the separate table without changing journal or quotas', async () => {
  const cache = storage(), remote = new Map()
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) }, from(table) {
    assert.equal(table, 'memory_favorites')
    return { upsert: async row => { remote.set(row.memory_id, row); return {} }, select: () => ({ eq: async () => ({ data: [...remote.values()] }) }), delete: () => ({ eq: () => ({ eq: async (key, value) => { remote.delete(value); return {} } }) }) }
  } }
  await setFavorite('a', 'memory', true, client, cache)
  assert.deepEqual(await syncFavorites('a', client, cache), { memory: true })
  await setFavorite('a', 'memory', false, client, cache)
  assert.deepEqual(await syncFavorites('a', client, cache), {})
})
