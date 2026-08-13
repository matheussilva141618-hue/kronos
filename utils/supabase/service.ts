/**
 * Cliente Supabase com Service Role � uso EXCLUSIVO em API Routes server-side.
 * Bypassa RLS: sempre filtre manualmente por user_id.
 * NUNCA exponha este cliente no browser.
 */
import { createClient } from '@supabase/supabase-js'

type QueryChain = {
  eq: (column: string, value: unknown) => QueryChain
  order: (column: string, options?: { ascending?: boolean }) => QueryChain
  limit: (count: number) => Promise<{ data: unknown[] | null; error: null; count?: number }>
  single: () => Promise<{ data: unknown | null; error: null }>
  gte: (column: string, value: unknown) => QueryChain
  or: (filter: string) => QueryChain
  head: () => Promise<{ data: null; error: null; count?: number }>
}

type FromChain = {
  select: (columns?: string, options?: { count?: 'exact' | 'planned' | undefined }) => QueryChain
  insert: (values: unknown) => Promise<{ data: unknown | null; error: null }>
  upsert: (values: unknown) => Promise<{ data: unknown | null; error: null }>
  update: (values: unknown) => QueryChain
  delete: () => QueryChain
}

type SupabaseStub = {
  from: (table: string) => FromChain
  auth: {
    getUser: () => Promise<{ data: { user: null }; error: null }>
  }
}

export function createSupabaseStub(): SupabaseStub {
  const noop = () => Promise.resolve({ data: null, error: null } as const)

  const query: QueryChain = {
    eq: () => query,
    order: () => query,
    limit: () => noop() as Promise<{ data: unknown[] | null; error: null; count?: number }>,
    single: () => noop() as Promise<{ data: unknown | null; error: null }>,
    gte: () => query,
    or: () => query,
    head: () => noop() as Promise<{ data: null; error: null; count?: number }>,
  }

  const from: FromChain = {
    select: () => query,
    insert: () => noop() as Promise<{ data: unknown | null; error: null }>,
    upsert: () => noop() as Promise<{ data: unknown | null; error: null }>,
    update: () => query,
    delete: () => query,
  }

  return {
    from: (table: string) => from,
    auth: {
      getUser: () => noop() as Promise<{ data: { user: null }; error: null }>,
    },
  }
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return createSupabaseStub()

  return createClient(url, key, { auth: { persistSession: false } })
}
