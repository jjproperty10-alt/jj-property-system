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

const listMock = jest.fn()
jest.mock('@/lib/transactions/agentDraftActions', () => ({
  listAgentTransactionDrafts: () => listMock(),
}))

import Page from '@/app/(app)/transactions/drafts/page'

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  listMock.mockReset()
})

describe('/transactions/drafts staff authorization', () => {
  it('no session → redirect(/login), list not called', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page()).rejects.toThrow('REDIRECT:/login')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound(), list not called', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('authorized staff loads the inbox', async () => {
    authMock.mockResolvedValue({ ok: true, userId: 'staff-1', staffRole: 'operations', isActive: true })
    listMock.mockResolvedValue({ ok: true, drafts: [] })
    const ui = await Page()
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
    expect(ui).toBeTruthy()
  })
})
