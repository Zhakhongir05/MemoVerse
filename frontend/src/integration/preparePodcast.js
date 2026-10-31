import { memorycastRequest } from './memorycastApi.js'

const running = new Map()
const listeners = new Map()
export function watchPodcast(id, callback) {
  if(!listeners.has(id))listeners.set(id,new Set())
  listeners.get(id).add(callback)
  return ()=>{listeners.get(id)?.delete(callback);if(!listeners.get(id)?.size)listeners.delete(id)}
}
function publish(id,result,error){for(const callback of listeners.get(id)||[])callback(result,error)}
export const pendingPodcast = memoryId => running.get(memoryId)
// Share one creation sequence across world preparation and the player. The server
// reservation and leases also deduplicate reloads and requests from other devices.
export function preparePodcast(memoryId, request = memorycastRequest, { existingOnly = false } = {}) {
  if (running.has(memoryId)) return running.get(memoryId)
  const task = (async () => {
    let result = await request('/memories/' + memoryId)
    let tour = result.tour
    if (tour?.status === 'ready') return result
    if (tour?.status === 'uncertain') return result
    if (!tour && existingOnly) return result
    if (!result.generation_enabled) return result
    if (!tour || tour.status==='failed') ({ tour } = await request('/memories/' + memoryId, {
      method: 'POST', body: { approved: true, language: 'en', regenerate: false },
    }))
    for (let step = 0; step < 11 && tour.status === 'pending'; step++) {
      const next = await request('/tours/' + tour.id + '/advance', { method: 'POST' })
      tour = next.tour
      if (!next.advanced) break
    }
    return request('/memories/' + memoryId)
  })().then(result=>{publish(memoryId,result,null);return result},error=>{publish(memoryId,null,error);throw error}).finally(() => running.delete(memoryId))
  running.set(memoryId, task)
  return task
}

// Resume only existing durable work; never abort an in-flight leased step.
export function watchPodcastPreparation(_owner, memoryId) {
  let stopped = false, timer, failures = 0
  async function run() {
    try {
      const result = await preparePodcast(memoryId)
      if (stopped || result.tour?.status !== 'pending') return
      failures = 0
    } catch (error) {
      if (stopped || ++failures >= 3 || (error.status >= 400 && error.status < 500)) return
    }
    timer = setTimeout(run, 15000)
  }
  void run()
  return () => { stopped = true; clearTimeout(timer) }
}
