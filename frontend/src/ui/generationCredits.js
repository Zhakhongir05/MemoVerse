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
  return data
}
