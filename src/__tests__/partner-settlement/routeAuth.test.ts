/**
 * QA #1 — behavioral proof that the Partner Report B route fails closed with the
 * repository's established staff-auth flow BEFORE any report is built.
 */

jest.mock('server-only', () => ({}))

const redirectMock = jest.fn((url: string) => { throw new Error('REDIRECT:' + url) })
const notFoundMock = jest.fn(() => { throw new Error('NOT_FOUND') })
jest.mock('next/navigation', () => ({
  redirect: (u: string) => redirectMock(u),
  notFound: () => notFoundMock(),
}))

const authMock = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => authMock(),
}))

const buildMock = jest.fn(async (_a?: unknown) => ({ meta: { schemaVersion: 'PartnerReportB/stage2' } }))
jest.mock('@/lib/partner-settlement/partnerReportBService', () => ({
  buildPartnerReportB: (a: unknown) => buildMock(a),
}))

jest.mock('@/components/partner-settlement/PartnerReportBView', () => ({
  PartnerReportBView: () => null,
}))

import Page from '@/app/(app)/finance/partner-settlement/[period]/page'

const PERIOD = { params: { period: '2026-06' } }

beforeEach(() => {
  redirectMock.mockClear(); notFoundMock.mockClear(); authMock.mockClear(); buildMock.mockClear()
})

describe('Partner Report B route — staff authorization (fail closed)', () => {
  it('no session → redirect(/login), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page(PERIOD as never)).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page(PERIOD as never)).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('inactive staff → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    await expect(Page(PERIOD as never)).rejects.toThrow('NOT_FOUND')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('authorized staff → report built', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', entityId: 'x' })
    await Page(PERIOD as never)
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})
