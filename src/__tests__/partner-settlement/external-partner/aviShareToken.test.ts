/**
 * HMAC Avi share token — sign/verify, expiry, tamper, secret fail-closed.
 * No financial formulas.
 */
import {
  AVI_SHARE_PATH_PREFIX,
  AVI_SHARE_TTL_SECONDS,
  signAviShareToken,
  verifyAviShareToken,
} from '@/lib/partner-settlement/external-partner/aviShareToken'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from '@/lib/partner-settlement/external-partner'
import * as fs from 'fs'
import * as path from 'path'

const SNAP = {
  snapshotVersion: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
  snapshotSha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
}

describe('aviShareToken', () => {
  it('signs a path under /share/avi-external-partner and verifies', () => {
    const signed = signAviShareToken(SNAP)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    expect(signed.path.startsWith(`${AVI_SHARE_PATH_PREFIX}/`)).toBe(true)
    expect(signed.token.includes('~')).toBe(true)
    const verified = verifyAviShareToken(signed.token, {
      expectedSnapshotVersion: SNAP.snapshotVersion,
      expectedSnapshotSha256: SNAP.snapshotSha256,
    })
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.claims.partner).toBe('Avi')
    expect(verified.claims.property).toBe('Villa Mazotos')
    expect(verified.claims.snapshotVersion).toBe(SNAP.snapshotVersion)
    expect(JSON.stringify(verified.claims)).not.toMatch(/280600|18900|400000|500000/)
  })

  it('uses a 72-hour TTL', () => {
    expect(AVI_SHARE_TTL_SECONDS).toBe(72 * 60 * 60)
    const now = new Date('2026-09-03T12:00:00.000Z')
    const signed = signAviShareToken({ ...SNAP, now })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    expect(signed.expiresAt).toBe('2026-09-06T12:00:00.000Z')
  })

  it('rejects a tampered token', () => {
    const signed = signAviShareToken(SNAP)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const verified = verifyAviShareToken(signed.token + 'x')
    expect(verified.ok).toBe(false)
    if (verified.ok) return
    expect(verified.error).toBe('INVALID')
  })

  it('rejects an expired token', () => {
    const signed = signAviShareToken({
      ...SNAP,
      now: new Date('2026-01-01T00:00:00.000Z'),
      ttlSeconds: 60,
    })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const verified = verifyAviShareToken(signed.token, {
      now: new Date('2026-01-01T00:02:00.000Z'),
    })
    expect(verified.ok).toBe(false)
    if (verified.ok) return
    expect(verified.error).toBe('EXPIRED')
  })

  it('rejects a snapshot mismatch', () => {
    const signed = signAviShareToken(SNAP)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const verified = verifyAviShareToken(signed.token, {
      expectedSnapshotVersion: 'other-version',
    })
    expect(verified.ok).toBe(false)
  })

  it('fails closed without a secret', () => {
    const signed = signAviShareToken({ ...SNAP, secret: null })
    expect(signed).toEqual({ ok: false, error: 'SECRET_MISSING' })
    const verified = verifyAviShareToken('not-a-token', { secret: null })
    expect(verified).toEqual({ ok: false, error: 'SECRET_MISSING' })
    const short = signAviShareToken({ ...SNAP, secret: 'too-short' })
    expect(short.ok).toBe(false)
  })

  it('does not contain financial formulas or a PDF engine', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/aviShareToken.ts'),
      'utf8',
    )
    expect(text).not.toContain('roundEur')
    expect(text).not.toContain('@react-pdf')
    expect(text).not.toContain('createServiceClient')
    expect(text).not.toContain('280600')
  })
})
