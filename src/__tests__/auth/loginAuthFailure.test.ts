import {
  describePasswordSignInFailure,
  isUnconfiguredSignInFailure,
  LOGIN_INVALID_CREDENTIALS,
  LOGIN_TEMPORARY_LOCK,
} from '@/lib/auth/loginAuthFailure'
import { SUPABASE_UNCONFIGURED_MESSAGE } from '@/lib/supabaseConfig'

describe('describePasswordSignInFailure', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon
  })

  it('does not treat missing keys as a wrong password or a lockout', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(isUnconfiguredSignInFailure(SUPABASE_UNCONFIGURED_MESSAGE)).toBe(true)
    expect(describePasswordSignInFailure(SUPABASE_UNCONFIGURED_MESSAGE, 4)).toEqual({
      message: SUPABASE_UNCONFIGURED_MESSAGE,
      countAttempt: false,
    })
  })

  it('keeps invalid-credential copy when Supabase is configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://vsiiprzjrstjcmjpwcrd.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOi-not-a-real-key'
    expect(describePasswordSignInFailure('Invalid login credentials', 0)).toEqual({
      message: LOGIN_INVALID_CREDENTIALS,
      countAttempt: true,
    })
    expect(describePasswordSignInFailure('Invalid login credentials', 4)).toEqual({
      message: LOGIN_TEMPORARY_LOCK,
      countAttempt: true,
    })
  })
})
