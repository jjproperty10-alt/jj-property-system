/**
 * Local / Cloud Agent fallback when Supabase keys are not present.
 *
 * Production always has real NEXT_PUBLIC_SUPABASE_* values.
 * Placeholders from .env.example or the Jest mock URL must not
 * be treated as a live database — queries would hang on DNS.
 */

const PLACEHOLDER_MARKERS = [
  'your-project',
  'your-anon-key',
  'your-service',
  'example.supabase',
]

export const SUPABASE_UNCONFIGURED_MESSAGE =
  'Supabase is not configured in this environment. Copy .env.example to .env.local and add the project keys.'

/** Anon / publishable key present. Enough for login and session checks. */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url || !anon) return false
  // Scripts key from BI\JJ\.env — must never be treated as the public anon key.
  if (anon.startsWith('sb_secret_')) return false
  const haystack = `${url} ${anon}`.toLowerCase()
  return !PLACEHOLDER_MARKERS.some((marker) => haystack.includes(marker))
}

/**
 * Service-role JWT present. Required for CEO / owner data (bypasses RLS).
 * The scripts `sb_secret_…` key is the wrong secret and is rejected.
 */
export function isSupabaseServiceConfigured(): boolean {
  if (!isSupabaseConfigured()) return false
  const key =
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!key) return false
  if (key.startsWith('sb_secret_')) return false
  return !PLACEHOLDER_MARKERS.some((marker) => key.toLowerCase().includes(marker))
}

type QueryResult = {
  data: null
  error: { message: string }
}

function queryResult(): QueryResult {
  return { data: null, error: { message: SUPABASE_UNCONFIGURED_MESSAGE } }
}

function queryBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {}
  const passthrough = () => builder
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'order',
    'eq',
    'neq',
    'in',
    'is',
    'gte',
    'lte',
    'gt',
    'lt',
    'like',
    'ilike',
    'filter',
    'match',
    'not',
    'or',
    'limit',
    'range',
  ]
  for (const name of methods) builder[name] = passthrough
  builder.single = async () => queryResult()
  builder.maybeSingle = async () => queryResult()
  builder.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(queryResult()).then(resolve)
  return builder
}

/** Minimal client so pages render instead of hanging when keys are missing. */
export function createUnconfiguredClient() {
  return {
    from: () => queryBuilder(),
    schema: () => ({ from: () => queryBuilder() }),
    rpc: async () => queryResult(),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: SUPABASE_UNCONFIGURED_MESSAGE },
      }),
      resetPasswordForEmail: async () => ({
        data: {},
        error: { message: SUPABASE_UNCONFIGURED_MESSAGE },
      }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({
        data: { user: null, session: null },
        error: { message: SUPABASE_UNCONFIGURED_MESSAGE },
      }),
    },
  }
}
