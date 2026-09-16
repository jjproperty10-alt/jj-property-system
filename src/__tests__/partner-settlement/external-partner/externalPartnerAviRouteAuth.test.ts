/**
 * Commit 3C — behavioral proof that the Avi External Partner route stays
 * fail-closed with authenticateStatementUser BEFORE any report is built.
 * Print does not add an auth bypass on this staff route.
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

const buildMock = jest.fn(async () => ({ status: 'certified' }))
jest.mock('@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport', () => ({
  buildAviExternalPartnerReport: () => buildMock(),
}))

jest.mock('@/components/finance/ExternalPartnerAviReportView', () => ({
  ExternalPartnerAviReportView: () => null,
}))
jest.mock('@/components/finance/AviReportPrintButton', () => ({
  AviReportPrintButton: () => null,
}))
jest.mock('@/components/finance/AviShareLinkButton', () => ({
  AviShareLinkButton: () => null,
}))
jest.mock('@/components/ds', () => ({
  PageShell: (props: { children: unknown }) => props.children,
  WorkspaceHeader: () => null,
}))

import Page from '@/app/(app)/finance/external-partner/avi/page'

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  buildMock.mockClear()
})

describe('Avi External Partner route — staff authorization (fail closed)', () => {
  it('no session → redirect(/login), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('inactive staff → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('authorized staff → report built', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', entityId: 'x' })
    await Page()
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})
