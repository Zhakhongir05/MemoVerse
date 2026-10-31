const TYPES = ['image/jpeg', 'image/png', 'image/webp']
export function memoryPhoto(memory) { return memory?.photos?.[0] || null }
export function photoUrl(photo, create = value => URL.createObjectURL(value)) {
  if (photo instanceof Blob) return { url: create(photo), owned: true }
  const url = typeof photo === 'string' ? photo : photo?.url
  if (!url) return { url: '', owned: false }
  if (!/^(https?:|blob:)/i.test(url)) throw new Error('This photograph has an unsupported URL. Reopen or replace it.')
  return { url, owned: false }
}
export async function readPhoto(imageUrl, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!imageUrl) throw new Error('Add a photograph to generate furniture. No sample furniture was substituted.')
  let response
  try { response = await fetchImpl(imageUrl, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' }) }
  catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('The photograph could not be loaded. Reopen the memory or replace its photograph.')
  }
  if (!response.ok) throw new Error('The photograph is unavailable or its link has expired. Reopen the memory or replace it.')
  const declared = response.headers?.get('content-type')?.split(';')[0]
  if (declared && !TYPES.includes(declared)) throw new Error('The photograph URL did not return a supported image. Its link may have expired; reopen the memory or choose a JPEG, PNG or WebP.')
  if (Number(response.headers?.get('content-length')) > 5 * 1024 * 1024) throw new Error('Furniture generation accepts photographs up to 5 MB. Choose a smaller copy.')
  const blob = await response.blob()
  if (!TYPES.includes(blob.type) || !blob.size || blob.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photograph up to 5 MB for furniture generation.')
  return new File([blob], 'memory-photo', { type: blob.type })
}
