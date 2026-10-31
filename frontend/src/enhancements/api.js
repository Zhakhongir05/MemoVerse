/**
 * Client for the backend's additive furniture manifest endpoint.
 *
 * Contract lives in backend/docs/ENHANCEMENTS.md: positions must already be in
 * the rendered, Y-up world frame (the same frame WorldLabsViewer renders), and
 * the response is validated by parseEnhancementsForWorld before it reaches the
 * scene. A backend outage is not fatal — callers keep the demo placements.
 */
export const ENHANCEMENTS_ENDPOINT = '/api/generate-enhancements'
export function enhancementEndpoint(base = import.meta.env?.VITE_API_BASE_URL || '') {
  if (!base) return ENHANCEMENTS_ENDPOINT
  let url
  try { url = new URL(base) } catch { throw new Error('The furniture API URL is invalid.') }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('The furniture API must use HTTPS.')
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Use a public backend origin without credentials, query parameters or a path.')
  return url.origin + ENHANCEMENTS_ENDPOINT
}
const REQUEST_TIMEOUT_MS = 45_000

const PROPOSAL_FIELDS = [
  'id',
  'type',
  'assetId',
  'position',
  'rotation',
  'scale',
  'anchor',
  'confidence',
  'memory',
]

/** Drops renderer-only fields; the backend only accepts approved proposal keys. */
export function toProposal(enhancement) {
  const proposal = {}
  for (const key of PROPOSAL_FIELDS) {
    if (enhancement[key] !== undefined) proposal[key] = enhancement[key]
  }
  return proposal
}

export async function requestEnhancements(
  { worldId, story = '', proposals = [], evidence = [], photo = null },
  { fetchImpl = globalThis.fetch, signal, apiBase, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  if (!worldId) throw new Error('requestEnhancements: worldId is required')

  const context = {
    worldId,
    coordinateFrame: 'render-y-up',
    story,
    proposals,
    evidence,
  }
  const body = new FormData()
  body.append('context', JSON.stringify(context))
  if (photo) body.append('photo', photo)

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort)
  if (signal?.aborted) controller.abort()

  try {
    const response = await fetchImpl(enhancementEndpoint(apiBase), {
      method: 'POST',
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(response.status === 413 ? 'The photograph exceeds the backend size limit (5 MB).' : response.status === 422 ? 'The photograph or placement request was rejected. Check the image and memory.' : `Furniture generation is unavailable (${response.status}). Please retry.`)
    }
    try { return await response.json() }
    catch { throw new Error('The furniture service returned an invalid response. Please retry.') }
  } catch (error) {
    if (timedOut) throw new Error('Furniture generation timed out. Please retry.')
    if (error instanceof TypeError) throw new Error('Could not reach the furniture service. Check your connection and retry.')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
