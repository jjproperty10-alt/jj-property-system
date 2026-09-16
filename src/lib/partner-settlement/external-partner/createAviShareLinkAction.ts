'use server'

/**
 * Staff-only mint of a read-only Avi report share URL.
 * Does not create an Avi user, password, or public unauthenticated listing.
 * The token carries snapshot identity only — no financial amounts.
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from './externalPartnerSnapshot'
import { signAviShareToken } from './aviShareToken'

export type CreateAviShareLinkResult =
  | { readonly ok: true; readonly path: string; readonly expiresAt: string }
  | {
      readonly ok: false
      readonly error:
        | 'NO_SESSION'
        | 'NOT_STAFF'
        | 'STAFF_INACTIVE'
        | 'AUTH_ERROR'
        | 'SECRET_MISSING'
    }

export async function createAviShareLink(): Promise<CreateAviShareLinkResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error }
  }

  const signed = signAviShareToken({
    snapshotVersion: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
    snapshotSha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
  })
  if (!signed.ok) {
    return { ok: false, error: 'SECRET_MISSING' }
  }

  return { ok: true, path: signed.path, expiresAt: signed.expiresAt }
}
