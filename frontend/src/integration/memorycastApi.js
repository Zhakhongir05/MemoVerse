import { supabase } from '../ui/supabaseClient.js'
import { enhancementEndpoint } from '../enhancements/api.js'
export async function memorycastRequest(path, { method = 'GET', body, signal, client = supabase, fetchImpl = fetch } = {}) {
  if (!/^\/(memories|tours)\/[a-f0-9-]{36}(\/advance)?$/.test(path)) throw new Error('Save this journal entry before creating its podcast.')
  const { data, error } = await client?.auth.getSession() || {}
  if (error || !data?.session?.access_token) throw new Error('Sign in to open your private memory podcast.')
  const base = enhancementEndpoint().replace('/api/generate-enhancements', '')
  const response = await fetchImpl(base+'/api/memorycast'+path, { method, signal, headers: { Authorization: 'Bearer '+data.session.access_token, ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) {
    let code
    try { code = (await response.json())?.detail?.code } catch { /* Do not show raw upstream bodies. */ }
    const messages = {
      memorycast_schema_unavailable: 'Podcast database setup is incomplete. Ask the owner to verify the MemoryCast migration.',
      memorycast_storage_unavailable: 'Podcast storage is temporarily unavailable. Retry loading your saved tour.',
    }
    const message = messages[code] || (response.status === 503 ? 'The podcast service is unavailable. Retry loading; your journal entry is still saved.' : response.status === 401 ? 'Please sign in again.' : response.status === 429 ? 'Your podcast creation allowance has been reached. You can still load and replay saved recordings.' : response.status === 409 ? 'This entry has changed. Reload the saved podcast before choosing whether to update it.' : response.status === 422 ? 'The saved memory metadata needs attention. Your recording has not been regenerated.' : 'Your private podcast could not be loaded. Retry without uploading any audio.')
    const error = new Error(message); error.status = response.status; error.code = code
    throw error
  }
  return response.json()
}
