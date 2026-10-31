import { createClient } from 'npm:@supabase/supabase-js@2'

// Provider calls are possible only after verified Google identity + atomic quota.
Deno.serve(async request => {
  const origin = request.headers.get('origin') || ''
  const allowed = (Deno.env.get('ALLOWED_APP_ORIGINS') || 'https://memoverse05.vercel.app,http://localhost:5173,http://localhost:5174').split(',').map(value => value.trim())
  const headers = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' }
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { headers })
  if (request.method !== 'POST' || (origin && !allowed.includes(origin))) return respond({ error: 'Request not allowed.' }, 403)
  try {
    const upstream = Deno.env.get('WORLD_GENERATION_UPSTREAM_URL')
    const upstreamToken = Deno.env.get('WORLD_GENERATION_UPSTREAM_TOKEN')
    if (!upstream || !upstreamToken || !upstream.startsWith('https://')) return respond({ error: 'Realistic generation is not available yet.' }, 503)
    const authorization = request.headers.get('authorization') || ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return respond({ error: 'Sign in to generate your memory.' }, 401)
    const google = user.identities?.find(identity => identity.provider === 'google')
    const subject = google?.identity_data?.sub
    if (!google || !subject || !user.email_confirmed_at || !/@(gmail|googlemail)\.com$/i.test(user.email || '')) return respond({ error: 'Use your verified Gmail account with Continue with Google to generate a world.' }, 403)
    if (Number(request.headers.get('content-length')) > 12 * 1024 * 1024) return respond({ error: 'The image must be 10 MB or smaller.' }, 413)
    const form = await request.formData()
    const files = [...form.entries()].filter(([, value]) => value instanceof File)
    const photo = form.get('photo')
    const memoryId = String(form.get('memoryId') || '')
    const story = String(form.get('story') || '')
    if (files.length !== 1 || !(photo instanceof File) || !photo.size || photo.size > 10 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(photo.type) || story.length > 12000 || !/^[a-f0-9-]{36}$/i.test(memoryId)) return respond({ error: 'Choose exactly one JPG, PNG, or WebP image up to 10 MB.' }, 400)
    const bytes = new Uint8Array(await photo.arrayBuffer())
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
    const webp = new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP'
    if (!(photo.type === 'image/jpeg' ? jpeg : photo.type === 'image/png' ? png : webp)) return respond({ error: 'The image format could not be verified.' }, 400)
    const { data: entry, error: entryError } = await admin.from('journal_entries').select('id').eq('id', memoryId).eq('user_id', user.id).is('deleted_at', null).maybeSingle()
    if (entryError || !entry) return respond({ error: 'Save this memory to your account before generating.' }, 403)
    const imageHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2,'0')).join('')
    const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(memoryId + ':' + imageHash + ':' + story)))].map(value => value.toString(16).padStart(2,'0')).join('')
    const { data: reservation, error: reserveError } = await admin.rpc('reserve_world_generation', { p_user_id: user.id, p_google_subject: String(subject), p_memory_id: memoryId, p_fingerprint: fingerprint })
    if (reserveError) return respond({ error: reserveError.message.includes('NO_GENERATION_CREDITS') ? 'You have used your generations. Add 15 more for ₩10,000.' : 'Generation is paused. Please try again later.' }, 429)
    if (!reservation.created) return reservation.state === 'succeeded' ? respond(reservation.result) : respond({ error: reservation.state === 'reserved' ? 'This memory is already being generated. Please check again later.' : 'This generation could not complete. Contact support before retrying this request.' }, 409)
    // Do not retry a provider automatically: even timeouts can consume credits.
    // The private upstream MUST require this token and honor the idempotency key.
    try {
      const upstreamForm = new FormData()
      upstreamForm.set('photo', photo); upstreamForm.set('story', story); upstreamForm.set('memoryId', memoryId)
      const response = await fetch(upstream, { method: 'POST', headers: { Authorization: `Bearer ${upstreamToken}`, 'Idempotency-Key': reservation.id }, body: upstreamForm, signal: AbortSignal.timeout(120000) })
      if (!response.ok) throw new Error('Generation failed')
      const result = await response.json()
      if (!result?.world || typeof result.world !== 'object' || Array.isArray(result.world) || !Object.keys(result.world).length) throw new Error('Missing world')
      const { error } = await admin.from('generation_requests').update({ state: 'succeeded', result }).eq('id', reservation.id)
      if (error) return respond({ error: 'The world needs recovery. Contact support; do not submit it again.' }, 503)
      return respond(result)
    } catch {
      await admin.from('generation_requests').update({ state: 'failed' }).eq('id', reservation.id)
      return respond({ error: 'Generation could not complete. The attempt was counted; support can review it.' }, 502)
    }
  } catch { return respond({ error: 'Generation could not start. Please try again later.' }, 500) }
})
