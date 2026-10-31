import { createClient } from '@supabase/supabase-js'

const url = import.meta.env?.VITE_SUPABASE_URL
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY

// Only a publishable key belongs in Vite. Never use a secret/service-role key.
function configureClient() {
  if (!url || !key || url.includes('YOUR_PROJECT_ID') || key === 'YOUR_PUBLISHABLE_KEY') return null
  try {
    return createClient(url, key)
  } catch {
    // Keep setup UI usable when the URL/key configuration is malformed.
    return null
  }
}

export const supabase = configureClient()
