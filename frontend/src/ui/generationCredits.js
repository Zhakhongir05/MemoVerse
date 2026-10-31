import { supabase } from './supabaseClient.js'

export const FREE_GENERATIONS = 3
export const PAID_PACK_GENERATIONS = 15
export const PAID_PACK_PRICE_KRW = 10000

export function remainingCredits(account) {
  return Math.max(0, account.credits_total - account.credits_used)
}

export async function getGenerationPlan(user, client = supabase) {
  if (!user || !client) throw new Error('Sign in to see your generation allowance.')
  const { data, error } = await client.from('generation_accounts').select('plan,credits_total,credits_used').eq('user_id', user.id).maybeSingle()
  if (error) throw new Error('Generation plans are not available yet. Please try again later.')
  return data || { plan: 'free', credits_total: FREE_GENERATIONS, credits_used: 0 }
}

export async function requestCreditGeneration({ memory, photo, photos, story, signal }, client = supabase) {
  const source = photo || (photos?.length === 1 ? photos[0] : null)
  if (!source) throw new Error('Select exactly one source photograph.')
  if (!client) throw new Error('Sign in to generate a memory.')
  const body = new FormData()
  body.set('photo', source); body.set('memoryId', memory.id); body.set('story', story || '')
  const { data, error } = await client.functions.invoke('generate-memory', { body, signal })
  if (error) {
    let message = 'Generation is unavailable. Please try again later.'
    try { message = (await error.context.json()).error || message } catch { /* Do not expose provider internals. */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  if (data?.pending && data.requestId) return waitForGeneration(data.requestId, signal, client)
  return data
}

export async function waitForGeneration(requestId, signal, client = supabase) {
  // Read-only polling; retries and reopening never repeat a provider POST.
  for (let attempt = 0; attempt < 180; attempt++) {
    signal?.throwIfAborted()
    const { data: job, error } = await client.from('generation_requests').select('state,status,result').eq('id', requestId).single()
    if (error) throw new Error('Could not check your saved generation. Reopen this memory later; do not regenerate it.')
    if (job.state === 'succeeded') return job.result
    if (job.state === 'failed') throw new Error('Generation failed. Check Plans for your restored allowance before trying a different source.')
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, 5000)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
  throw new Error('Your world is still being prepared or recovered. Reopen this memory later; another generation will not be started.')
}
