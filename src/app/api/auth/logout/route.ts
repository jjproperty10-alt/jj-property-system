import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

async function doLogout() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as any)
          )
        },
      },
    }
  )
  await supabase.auth.signOut()
  const redirectUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jj-property-system.vercel.app'
  return NextResponse.redirect(new URL('/login', redirectUrl))
}

export async function POST() { return doLogout() }
export async function GET()  { return doLogout() }
