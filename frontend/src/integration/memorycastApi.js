import { supabase } from '../ui/supabaseClient.js'
import { enhancementEndpoint } from '../enhancements/api.js'
export async function memorycastRequest(path, { method = 'GET', body, signal, client = supabase, fetchImpl = fetch } = {}) {
  if (!/^\/(memories|tours)\/[a-f0-9-]{36}(\/advance)?$/.test(path)) throw new Error('Save this journal entry before creating its podcast.')
  const { data, error } = await client?.auth.getSession() || {}
  if (error || !data?.session?.access_token) throw new Error('Sign in to open your private memory podcast.')
  const base = enhancementEndpoint().replace('/api/generate-enhancements', '')
  const response = await fetchImpl(base+'/api/memorycast'+path, { method, signal, headers: { Authorization: 'Bearer '+data.session.access_token, ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) throw new Error(response.status === 503 ? 'AI podcast creation is not enabled yet. Your journal entry is still saved.' : response.status === 401 ? 'Please sign in again.' : 'Your private podcast could not be loaded. Retry without uploading any audio.')
  return response.json()
}
