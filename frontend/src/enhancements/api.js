/**
 * Client for the backend's additive furniture manifest endpoint.
 *
 * Contract lives in backend/docs/ENHANCEMENTS.md: positions must already be in
 * the rendered, Y-up world frame (the same frame WorldLabsViewer renders), and
 * the response is validated by parseEnhancementsForWorld before it reaches the
 * scene. A backend outage is not fatal — callers keep the demo placements.
 */
export const ENHANCEMENTS_ENDPOINT = '/api/generate-enhancements'
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
  { fetchImpl = globalThis.fetch, signal } = {},
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
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort)

  try {
    const response = await fetchImpl(ENHANCEMENTS_ENDPOINT, {
      method: 'POST',
      body,
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `Enhancement request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      )
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
