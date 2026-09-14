import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabaseConfig'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Hard-block Avi compose fixture in Production even if Supabase keys are missing.
  if (
    process.env.NODE_ENV === 'production' &&
    pathname.startsWith('/preview/avi-certified-compose')
  ) {
    return new NextResponse('Not Found', { status: 404 })
  }

  let supabaseResponse = NextResponse.next({ request })

  if (!isSupabaseConfigured()) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // LOCAL DEV ONLY: /client-report bypasses auth for RC1 visual parity testing.
  // restore_auth.bat removes this line before production deploy.
  const publicPaths = [
    '/login',
    '/auth/callback',
    '/auth/reset',
    '/_next',
    '/favicon',
    '/share/avi-external-partner',
    // Unconfigured Preview only — page itself 404s when Supabase keys are present.
    '/preview/avi-certified-compose',
  ]
  if (publicPaths.some(p => pathname.startsWith(p))) return supabaseResponse

  if (!user) {
    // Build the complete return path: pathname + query string
    // FIX(VS1B): Previously only `pathname` was used, dropping query parameters.
    // This caused /partner/avi/statement?property=Villa%20Mazotos to lose the
    // property selection after login redirect.
    const returnPath = pathname + request.nextUrl.search

    const loginUrl = new URL('/login', request.nextUrl.origin)
    loginUrl.searchParams.set('next', returnPath)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff2|woff)$).*)'],
}
