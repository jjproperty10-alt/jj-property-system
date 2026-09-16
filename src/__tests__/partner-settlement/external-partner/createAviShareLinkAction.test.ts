/**
 * Staff mint of Avi share links — fail closed. No Avi account.
 */
jest.mock('server-only', () => ({}))

const authMock = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => authMock(),
}))

import { createAviShareLink } from '@/lib/partner-settlement/external-partner/createAviShareLinkAction'
import { AVI_SHARE_PATH_PREFIX, verifyAviShareToken } from '@/lib/partner-settlement/external-partner/aviShareToken'

describe('createAviShareLink', () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it('NO_SESSION does not mint a token', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const result = await createAviShareLink()
    expect(result).toEqual({ ok: false, error: 'NO_SESSION' })
  })

  it('NOT_STAFF does not mint a token', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(createAviShareLink()).resolves.toEqual({ ok: false, error: 'NOT_STAFF' })
  })

  it('STAFF_INACTIVE does not mint a token', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    await expect(createAviShareLink()).resolves.toEqual({ ok: false, error: 'STAFF_INACTIVE' })
  })

  it('active staff receives a verifiable path', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'x', isActive: true })
    const result = await createAviShareLink()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path.startsWith(`${AVI_SHARE_PATH_PREFIX}/`)).toBe(true)
    const token = result.path.slice(`${AVI_SHARE_PATH_PREFIX}/`.length)
    const verified = verifyAviShareToken(token)
    expect(verified.ok).toBe(true)
  })
})
