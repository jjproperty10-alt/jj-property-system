/**
 * @module partner-settlement/external-partner/aviShareToken
 * @description Cookie-less HMAC share token for the certified Avi report.
 *
 * Staff mint a short-lived URL. The holder can read the same certified DTO
 * without an Avi login. No financial formulas. No database table.
 *
 * Fail closed: missing/short secret, tamper, expiry, or snapshot mismatch
 * are all INVALID to the caller (verify) — do not leak why in the HTTP page.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const AVI_SHARE_PATH_PREFIX = '/share/avi-external-partner'
export const AVI_SHARE_TTL_SECONDS = 72 * 60 * 60
export const AVI_SHARE_SECRET_ENV = 'AVI_EXTERNAL_PARTNER_SHARE_SECRET'

export interface AviShareClaims {
  readonly v: 1
  readonly partner: 'Avi'
  readonly property: 'Villa Mazotos'
  readonly snapshotVersion: string
  readonly snapshotSha256: string
  readonly iat: number
  readonly exp: number
  readonly jti: string
}

export type AviShareSignResult =
  | { readonly ok: true; readonly token: string; readonly expiresAt: string; readonly path: string }
  | { readonly ok: false; readonly error: 'SECRET_MISSING' }

export type AviShareVerifyResult =
  | { readonly ok: true; readonly claims: AviShareClaims }
  | { readonly ok: false; readonly error: 'SECRET_MISSING' | 'INVALID' | 'EXPIRED' }

const MIN_SECRET_LENGTH = 32

function coerceSecret(secret: string | null | undefined): string | null {
  if (typeof secret !== 'string') return null
  if (secret.length < MIN_SECRET_LENGTH) return null
  return secret
}

export function readAviShareSecret(
  source: NodeJS.ProcessEnv = process.env,
): string | null {
  return coerceSecret(source[AVI_SHARE_SECRET_ENV])
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url')
}

function signPayload(payload: string, secret: string): string {
  return toBase64Url(createHmac('sha256', secret).update(payload).digest())
}

function signaturesMatch(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch {
    return false
  }
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

function isAviShareClaims(value: unknown): value is AviShareClaims {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.v === 1 &&
    v.partner === 'Avi' &&
    v.property === 'Villa Mazotos' &&
    typeof v.snapshotVersion === 'string' &&
    v.snapshotVersion.length > 0 &&
    typeof v.snapshotSha256 === 'string' &&
    v.snapshotSha256.length > 0 &&
    typeof v.iat === 'number' &&
    Number.isFinite(v.iat) &&
    typeof v.exp === 'number' &&
    Number.isFinite(v.exp) &&
    typeof v.jti === 'string' &&
    v.jti.length > 0
  )
}

export function signAviShareToken(input: {
  readonly snapshotVersion: string
  readonly snapshotSha256: string
  readonly now?: Date
  readonly ttlSeconds?: number
  readonly secret?: string | null
}): AviShareSignResult {
  const secret = coerceSecret(
    input.secret !== undefined ? input.secret : readAviShareSecret(),
  )
  if (secret === null) return { ok: false, error: 'SECRET_MISSING' }

  const now = input.now ?? new Date()
  const iat = Math.floor(now.getTime() / 1000)
  const ttl =
    input.ttlSeconds != null && Number.isFinite(input.ttlSeconds) && input.ttlSeconds > 0
      ? input.ttlSeconds
      : AVI_SHARE_TTL_SECONDS

  const claims: AviShareClaims = {
    v: 1,
    partner: 'Avi',
    property: 'Villa Mazotos',
    snapshotVersion: input.snapshotVersion,
    snapshotSha256: input.snapshotSha256,
    iat,
    exp: iat + ttl,
    jti: randomBytes(16).toString('hex'),
  }
  const payload = toBase64Url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const token = `${payload}~${signPayload(payload, secret)}`
  return {
    ok: true,
    token,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    path: `${AVI_SHARE_PATH_PREFIX}/${token}`,
  }
}

export function verifyAviShareToken(
  token: string,
  options: {
    readonly secret?: string | null
    readonly now?: Date
    readonly expectedSnapshotVersion?: string
    readonly expectedSnapshotSha256?: string
  } = {},
): AviShareVerifyResult {
  const secret = coerceSecret(
    options.secret !== undefined ? options.secret : readAviShareSecret(),
  )
  if (secret === null) return { ok: false, error: 'SECRET_MISSING' }
  if (typeof token !== 'string' || token.length < 16) return { ok: false, error: 'INVALID' }

  const separator = token.lastIndexOf('~')
  if (separator <= 0 || separator === token.length - 1) return { ok: false, error: 'INVALID' }
  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!signaturesMatch(payload, signature, secret)) return { ok: false, error: 'INVALID' }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, error: 'INVALID' }
  }
  if (!isAviShareClaims(parsed)) return { ok: false, error: 'INVALID' }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000)
  if (parsed.exp <= nowSeconds) return { ok: false, error: 'EXPIRED' }
  if (parsed.iat > nowSeconds + 60) return { ok: false, error: 'INVALID' }

  if (
    options.expectedSnapshotVersion !== undefined &&
    parsed.snapshotVersion !== options.expectedSnapshotVersion
  ) {
    return { ok: false, error: 'INVALID' }
  }
  if (
    options.expectedSnapshotSha256 !== undefined &&
    parsed.snapshotSha256 !== options.expectedSnapshotSha256
  ) {
    return { ok: false, error: 'INVALID' }
  }

  return { ok: true, claims: parsed }
}
