/**
 * Detect whether Supabase public keys are present and non-placeholder.
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
  // Scripts key must never be treated as the public anon key.
  if (anon.startsWith('sb_secret_')) return false
  const haystack = `${url} ${anon}`.toLowerCase()
  return !PLACEHOLDER_MARKERS.some((marker) => haystack.includes(marker))
}
