/**
 * Cliente Supabase com Service Role — uso EXCLUSIVO em API Routes server-side.
 * Bypassa RLS: sempre filtre manualmente por user_id.
 * NUNCA exponha este cliente no browser.
 */
import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Supabase service role não configurado.');
  return createClient(url, key, { auth: { persistSession: false } });
}
