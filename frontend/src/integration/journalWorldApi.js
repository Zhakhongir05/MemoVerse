import { supabase } from '../ui/supabaseClient.js'
import { enhancementEndpoint } from '../enhancements/api.js'

export async function journalWorldRequest(memoryId, { method = 'GET', body, signal, client = supabase, fetchImpl = globalThis.fetch } = {}) {
  if (!/^[a-f0-9-]{36}$/i.test(memoryId || '')) throw new Error('Save and sync this memory before opening its world.')
  const { data, error } = await client?.auth.getSession() || {}
  if (error || !data?.session?.access_token) throw new Error('Sign in with your Google account to open this memory world.')
  const base = enhancementEndpoint().replace('/api/generate-enhancements', '')
  let response
  try {
    response = await fetchImpl(`${base}/api/journal/${memoryId}/world`, {
      method, signal, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Could not reach saved-world storage. Retry checking status; do not start another generation.')
  }
  if (!response.ok) {
    let detail;try{detail=(await response.json()).detail}catch{}
    if(typeof detail==='string'&&detail.length<=240)throw new Error(detail)
    throw new Error(response.status === 401 ? 'Please sign in again.' : response.status === 404 ? 'Sync this memory and its photograph before using Relive.' : response.status === 429 ? 'Your account allowance or judging budget is unavailable. Existing worlds can still reopen.' : 'World generation/storage is unavailable. Your existing reservation will not be resubmitted automatically.')
  }
  return response.json()
}
export async function waitForJournalWorld(memoryId, { signal, onStatus = () => {}, request = journalWorldRequest, sleep = abortableSleep } = {}) {
  // GET only: refresh, polling, and reopening can NEVER submit a provider job.
  for (;;) {
    const job = await request(memoryId, { signal })
    onStatus(job)
    if (!['pending', 'submitting'].includes(job.status)) return job
    await sleep(5000, signal)
  }
}
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}
export async function saveJournalExperience(memoryId, value, client = supabase) {
  const { data } = await client.auth.getSession()
  if (!data?.session?.access_token) throw new Error('Sign in again to save placements.')
  const base = enhancementEndpoint().replace('/api/generate-enhancements', '')
  const response = await fetch(`${base}/api/journal/${memoryId}/experience`, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  if (!response.ok) throw new Error(response.status === 409 ? 'Saved on another device. Reopen before saving again.' : 'Placements could not be saved. Please retry.')
  return response.json()
}
