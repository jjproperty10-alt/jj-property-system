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

const getMock = jest.fn()
jest.mock('@/lib/transactions/agentDraftActions', () => ({
  getAgentTransactionDraft: (...args: unknown[]) => getMock(...args),
}))

import Page from '@/app/(app)/transactions/drafts/[id]/edit/page'

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  getMock.mockReset()
})

describe('/transactions/drafts/[id]/edit staff authorization', () => {
  it('no session → redirect(/login)', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page({ params: { id: 'draft-1' } })).rejects.toThrow('REDIRECT:/login')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound()', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page({ params: { id: 'draft-1' } })).rejects.toThrow('NOT_FOUND')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('posted drafts redirect back to the inbox', async () => {
    authMock.mockResolvedValue({ ok: true, userId: 'staff-1', staffRole: 'operations', isActive: true })
    getMock.mockResolvedValue({
      ok: true,
      draft: { id: 'draft-1', status: 'posted' },
    })
    await expect(Page({ params: { id: 'draft-1' } })).rejects.toThrow('REDIRECT:/transactions/drafts')
  })
})
