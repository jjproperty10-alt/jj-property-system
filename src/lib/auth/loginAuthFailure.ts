import {
  isSupabaseConfigured,
  SUPABASE_UNCONFIGURED_MESSAGE,
} from '@/lib/supabaseConfig'

export const LOGIN_UNCONFIGURED_BANNER =
  'This Preview cannot sign you in. Supabase keys are not loaded in this environment, so the account service is never contacted. Your email and password are not being checked.'

export const LOGIN_INVALID_CREDENTIALS = 'Invalid email or password.'

export const LOGIN_TEMPORARY_LOCK =
  'Account temporarily locked after 5 failed attempts. Try again in 10 minutes.'

export function isUnconfiguredSignInFailure(authErrorMessage: string | undefined): boolean {
  return !isSupabaseConfigured() || authErrorMessage === SUPABASE_UNCONFIGURED_MESSAGE
}

/**
 * Maps a password-sign-in failure to UI copy.
 * Unconfigured Preview must not look like a wrong password or a real lockout.
 */
export function describePasswordSignInFailure(
  authErrorMessage: string | undefined,
  previousFailedAttempts: number,
): { message: string; countAttempt: boolean } {
  if (isUnconfiguredSignInFailure(authErrorMessage)) {
    return { message: SUPABASE_UNCONFIGURED_MESSAGE, countAttempt: false }
  }
  if (previousFailedAttempts >= 4) {
    return { message: LOGIN_TEMPORARY_LOCK, countAttempt: true }
  }
  return { message: LOGIN_INVALID_CREDENTIALS, countAttempt: true }
}
