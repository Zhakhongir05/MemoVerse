import { memorycastRequest } from './memorycastApi.js'

// A single durable tour per memory. Never regenerate on replay or journal edits.
// DB reservations/leases also coalesce requests across tabs and devices.
const active = new Map()
export function preparePodcast(owner, memoryId, request = memorycastRequest) {
  const key = `${owner}:${memoryId}`
  if (active.has(key)) return active.get(key)
  const operation = (async () => {
    let result = await request('/memories/' + memoryId)
    if (!result.generation_enabled || ['ready', 'failed', 'uncertain'].includes(result.tour?.status)) return result
    let tour = result.tour
    if (!tour) ({ tour } = await request('/memories/' + memoryId, { method: 'POST', body: { approved: true, language: 'en', regenerate: false } }))
    for (let step = 0; step < 11 && tour.status === 'pending'; step++) {
      const next = await request('/tours/' + tour.id + '/advance', { method: 'POST' })
      tour = next.tour
      if (!next.advanced) break
    }
    return request('/memories/' + memoryId)
  })()
  active.set(key, operation)
  operation.finally(() => { if (active.get(key) === operation) active.delete(key) }).catch(() => {})
  return operation
}

export function watchPodcastPreparation(owner, memoryId, { onResult = () => {}, onError = () => {}, delay = 15000, request = memorycastRequest } = {}) {
  let stopped = false, timer, failures = 0
  async function run() {
    try {
      const result = await preparePodcast(owner, memoryId, request)
      if (stopped) return
      failures = 0
      onResult(result)
      if (result.tour?.status !== 'pending') return
    } catch (error) {
      if (stopped) return
      onError(error)
      if (++failures >= 3 || (error.status >= 400 && error.status < 500)) return
    }
    timer = setTimeout(run, delay)
  }
  void run()
  // Do not abort an already-leased provider step; it must finish persisting.
  return () => { stopped = true; clearTimeout(timer) }
}
