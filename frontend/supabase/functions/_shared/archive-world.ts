/** Server-only adapter for the backend worker. Never import into React.
 * Use in a long-lived worker for large worlds; Edge execution limits still apply.
 * Provider submission/reconciliation remains the backend teammate's responsibility.
 */
type Source = { url: string; format: 'spz' | 'glb' | 'mp3' | 'wav' | 'ogg' }
type ArchiveOptions = {
  supabaseUrl: string; serviceKey: string; allowedProviderHosts: string[]
  userId: string; memoryId: string; requestId: string; signal?: AbortSignal
}

export async function archiveWorldAsset(source: Source, name: string, options: ArchiveOptions) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (![options.userId, options.memoryId, options.requestId].every(value => uuid.test(value)) || !/^[a-z0-9-]{1,60}$/.test(name)) throw new Error('Invalid archive identity')
  const mime = { spz: 'application/octet-stream', glb: 'model/gltf-binary', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }[source.format]
  if (!mime) throw new Error('Unsupported archive format')
  const url = new URL(source.url)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !options.allowedProviderHosts.includes(url.hostname)) throw new Error('Untrusted provider asset host')
  // Do not follow redirects into private networks or forward service credentials
  // to a provider host. Hosts must be an administrator's exact public allowlist.
  const response = await fetch(url, { redirect: 'error', signal: options.signal })
  if (!response.ok || !response.body) throw new Error('Provider asset unavailable')
  const limit = 1024 * 1024 * 1024
  const length = Number(response.headers.get('content-length'))
  if (length > limit) { await response.body.cancel(); throw new Error('Archive exceeds object limit') }
  // A unique immutable object name avoids replacing a previously committed
  // world and lets an interrupted archive retry without trusting a partial file.
  const path = `${options.userId}/${options.memoryId}/${options.requestId}/${name}-${crypto.randomUUID()}.${source.format}`
  let size = 0
  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength
      if (size > limit) throw new Error('Archive exceeds object limit')
      controller.enqueue(chunk)
    },
    flush() { if (!size) throw new Error('Empty provider asset') },
  }))
  const target = new URL(`/storage/v1/object/memory-worlds/${path}`, options.supabaseUrl)
  const uploaded = await fetch(target, {
    method: 'POST', headers: { Authorization: `Bearer ${options.serviceKey}`, apikey: options.serviceKey, 'Content-Type': mime, 'x-upsert': 'false' },
    body, signal: options.signal,
  })
  if (!uploaded.ok) throw new Error('Private asset archival failed')
  return { bucket: 'memory-worlds', path, format: source.format, size, contentType: mime }
}
