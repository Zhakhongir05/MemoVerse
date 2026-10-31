const mutations = new Set()
export const terminalTour = tour => ['ready', 'failed', 'uncertain'].includes(tour?.status)
export const audioLinkExpired = (fetchedAt, expiresIn, now = Date.now()) => now >= fetchedAt + (expiresIn - 30) * 1000

export function memorycastClient(owner, client, { fetchImpl = fetch, baseUrl = '' } = {}) {
  async function request(path, { signal, body } = {}) {
    const session = async () => {
      const { data, error } = await client.auth.getSession()
      if (error || !data?.session || data.session.user.id !== owner) throw new DOMException('Your account changed. Reopen this memory after signing in.', 'AbortError')
      return data.session.access_token
    }
    const token = await session()
    signal?.throwIfAborted()
    const response = await fetchImpl(`${baseUrl}/api/memorycast/${path}`, {
      method: body ? 'POST' : 'GET', credentials: 'omit', signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    await session() // Discard a previous account's late response.
    signal?.throwIfAborted()
    if (!response.ok) {
      const messages = { 401: 'Sign in again to access MemoryCast.', 403: 'This saved memory is not available to your account.', 404: 'Save and sync this memory before opening MemoryCast.', 409: 'The saved memory has changed. Check its status before explicitly regenerating.', 429: 'MemoryCast is busy or its generation allowance is reached. Saved tours can still be replayed.', 503: 'MemoryCast generation or database setup is not enabled yet. Saved tours can still be replayed when available.' }
      throw new Error(messages[response.status] || 'MemoryCast could not complete the request. Check status before continuing; no paid retry was started.')
    }
    try { return await response.json() }
    catch { throw new Error('MemoryCast returned an unreadable response. Check status before continuing.') }
  }
  return {
    load(memoryId, { language, tourId, signal } = {}) {
      const params = new URLSearchParams()
      if (language) params.set('language', language)
      if (tourId) params.set('tour_id', tourId)
      return request(`memories/${encodeURIComponent(memoryId)}${params.size ? '?' + params : ''}`, { signal })
    },
    async generate(memoryId, { approved, regenerate = false, language = 'en', signal } = {}) {
      if (approved !== true) throw new Error('Explicit approval is required before generating AI narration.')
      const key = `${owner}:${memoryId}`
      if (mutations.has(key)) throw new Error('A generation request is already running for this memory.')
      mutations.add(key)
      try { return await request(`memories/${encodeURIComponent(memoryId)}`, { signal, body: { approved: true, regenerate, language } }) }
      finally { mutations.delete(key) }
    },
    async advance(tourId, signal) {
      const key = `${owner}:step:${tourId}`
      if (mutations.has(key)) throw new Error('This narration step is already running.')
      mutations.add(key)
      try { return await request(`tours/${encodeURIComponent(tourId)}/advance`, { signal, body: {} }) }
      finally { mutations.delete(key) }
    },
  }
}

export function pauseBetweenSteps(ms, signal) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

// Only called following a user's Generate/Continue action, never on mount.
export async function advanceMemorycast(api, memoryId, snapshot, { signal, onUpdate, wait = pauseBetweenSteps } = {}) {
  let current = snapshot
  while (current.tour?.status === 'pending') {
    signal?.throwIfAborted()
    const result = await api.advance(current.tour.id, signal)
    if (result.tour.status !== 'ready') onUpdate?.({ ...current, tour: result.tour })
    if (['failed', 'uncertain'].includes(result.tour.status)) return { ...current, tour: result.tour }
    if (result.tour.status !== 'ready') await wait(4000, signal)
    current = await api.load(memoryId, { signal })
    onUpdate?.(current)
  }
  return current
}

export function playableChapters(tour) {
  if (tour?.status !== 'ready') return []
  const chapters = tour.script?.chapters
  if (!Array.isArray(chapters) || chapters.length !== 3) throw new Error('The saved narration chapters need review.')
  return [1, 2, 3].map(order => {
    const chapter = chapters.find(item => item.order === order)
    const audio = tour.audio?.find(item => item.order === order)
    if (!chapter || !audio || !Number.isFinite(audio.duration_seconds) || audio.duration_seconds <= 0 || !/^https?:\/\//.test(audio.url)) throw new Error('The saved narration audio needs review.')
    return { ...chapter, audio }
  })
}
