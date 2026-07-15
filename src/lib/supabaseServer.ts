/**
 * @module lib/supabaseServer
 * @description Server-only Supabase client constructors requiring Next.js request context.
 *
 * This module is server-only — it imports `next/headers` which is not available
 * in client bundles. Do NOT import this from any client component or shared utility.
 *
 * Exports:
 *   createSupabaseServerClient() — cookie-aware Supabase client using @supabase/ssr.
 *     Reads the authenticated user's session cookies from the current HTTP request.
 *     Use ONLY for auth.getUser() to verify the current session.
 *     Do NOT use this client for data queries that require service_role privileges.
 *
 * For service-role data access, import createServiceClient() from '@/lib/supabase'.
 *
 * Two-client pattern (enforced in partnerAuthService.ts):
 *
 *   // Step 1: Session verification — cookie-aware, anon key
 *   const sessionClient = createSupabaseServerClient()          ← this module
 *   const { data: { user }, error } = await sessionClient.auth.getUser()
 *
 *   // Step 2: Data access — service role, no session
 *   const serviceClient = createServiceClient()                 ← from '@/lib/supabase'
 *   const { data } = await serviceClient.schema('lifecycle').from('investor_auth')...
 *
 * These two clients MUST NOT be substituted for each other:
 * - sessionClient has anon-key access only. It cannot read RLS-protected tables.
 * - serviceClient bypasses RLS. It must never be used to call auth.getUser()
 *   because getUser() on a service-role client returns the service account, not
 *   the browser user.
 *
 * @see src/lib/supabase.ts         — createServiceClient() for privileged data queries
 * @see src/lib/lifecycle/partnerAuthService.ts — two-client pattern usage example
 */

import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Create a cookie-aware Supabase client for server-side session resolution.
 *
 * Uses the ANON KEY + the request's cookie store so that auth.getUser() returns
 * the user bound to the authenticated browser session.
 *
 * auth.getUser() performs a server-side token validation against Supabase Auth —
 * it does NOT blindly trust the cookie value. This makes it safe as an identity
 * proof in Server Components.
 *
 * MUST NOT be used for data queries. Data queries requiring elevated access
 * must use createServiceClient() from '@/lib/supabase'.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: object }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookie mutations are no-ops here.
            // Session refresh is handled by the middleware (middleware.ts).
          }
        },
      },
    }
  )
}
