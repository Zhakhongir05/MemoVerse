import { ENHANCEMENTS_ENDPOINT, enhancementEndpoint } from '../enhancements/api.js'

/** Stateless extraction endpoint; deterministic, so it needs no auth or photo. */
export const SENSORY_ENDPOINT = '/api/sensory-cues'
const REQUEST_TIMEOUT_MS = 10_000

export function sensoryUrl(apiBase) {
  const endpoint = enhancementEndpoint(apiBase)
  return endpoint.slice(0, endpoint.length - ENHANCEMENTS_ENDPOINT.length) + SENSORY_ENDPOINT
}

export async function requestSensoryCues(body, { fetchImpl = globalThis.fetch, signal, apiBase, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort)
  if (signal?.aborted) controller.abort()

  try {
    const response = await fetchImpl(sensoryUrl(apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(response.status === 422
        ? 'The sensory request was rejected. Check the saved entry.'
        : `Sensory cues are unavailable (${response.status}). The room still works without them.`)
    }
    try { return await response.json() }
    catch { throw new Error('The sensory service returned an invalid response.') }
  } catch (error) {
    if (timedOut) throw new Error('Sensory cues timed out. The room still works without them.')
    if (error instanceof TypeError) throw new Error('Could not reach the sensory service. The room still works without it.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
