import { memorycastRequest } from './memorycastApi.js'

const running = new Map()
export const pendingPodcast = memoryId => running.get(memoryId)
// Share one creation sequence across world preparation and the player. The server
// reservation and leases also deduplicate reloads and requests from other devices.
export function preparePodcast(memoryId, request = memorycastRequest) {
  if (running.has(memoryId)) return running.get(memoryId)
  const task = (async () => {
    let result = await request('/memories/' + memoryId)
    let tour = result.tour
    if (tour?.status === 'ready') return result
    if (['failed', 'uncertain'].includes(tour?.status)) return result
    if (!result.generation_enabled) return result
    if (!tour) ({ tour } = await request('/memories/' + memoryId, {
      method: 'POST', body: { approved: true, language: 'en', regenerate: false },
    }))
    for (let step = 0; step < 11 && tour.status === 'pending'; step++) {
      const next = await request('/tours/' + tour.id + '/advance', { method: 'POST' })
      tour = next.tour
      if (!next.advanced) break
    }
    return request('/memories/' + memoryId)
  })().finally(() => running.delete(memoryId))
  running.set(memoryId, task)
  return task
}
