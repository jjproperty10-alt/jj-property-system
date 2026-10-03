import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Anon browser clients. This module has no service key and no server-only
 * import. Client components must use it instead of `@/lib/supabase`, because
 * that module loads the staff-permission check and `next/headers`.
 *
 * The anon singleton is created on first use. Importing this module during
 * `next build` must not call createClient when the public URL is unset.
 */

let anonClient: SupabaseClient | undefined

function anonBrowserClient(): SupabaseClient {
  if (!anonClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('supabaseUrl is required.')
    }
    anonClient = createClient(url, key)
  }
  return anonClient
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = anonBrowserClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/**
 * Cookie-based browser client for login and authenticated pages.
 * Uses createBrowserClient from @supabase/ssr so that sessions are stored
 * in cookies (matching what the middleware expects), NOT localStorage.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
