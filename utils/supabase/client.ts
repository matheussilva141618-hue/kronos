import { createBrowserClient } from '@supabase/ssr'
import { createSupabaseStub } from './service'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) return createSupabaseStub()

  return createBrowserClient(url, key)
}
