/**
 * Gate for /preview/avi-certified-compose* routes.
 *
 * Production must never expose the compose fixture — even if Supabase keys
 * are accidentally missing. Non-production Preview may use the fixture only
 * when Supabase is unconfigured (local / Cloud Agent without keys).
 *
 * Presentation / routing only — no settlement math.
 */
import { isSupabaseConfigured } from '@/lib/supabaseConfig'

export function isAviCertifiedComposePreviewAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') return false
  return !isSupabaseConfigured()
}
