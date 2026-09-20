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

const frameMock = jest.fn()
jest.mock('@/lib/nav/resolveFrameUser', () => ({
  resolveFrameUser: () => frameMock(),
}))

const catalogMock = jest.fn()
jest.mock('@/lib/ops/assistant/opsConversationActions', () => ({
  listAssistantProperties: () => catalogMock(),
}))

const TEST_PARTNER_ACTORS = [
  { id: '11111111-1111-4111-8111-111111111111', canonicalName: 'Test Partner A' },
] as const

const listEntitiesMock = jest.fn()
const listPartnersMock = jest.fn()
jest.mock('@/lib/ops/assistant/clientCashSettlementActions', () => ({
  listClientSettlementEntities: () => listEntitiesMock(),
  listPartnerFundingActors: () => listPartnersMock(),
}))

jest.mock('@/components/ops/AssistantChat', () => ({
  AssistantChat: () => null,
}))

import Page from '@/app/(app)/assistant/page'

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  frameMock.mockReset()
  catalogMock.mockReset()
  listEntitiesMock.mockReset()
  listPartnersMock.mockReset()
  listEntitiesMock.mockResolvedValue({ ok: true, entities: [] })
  listPartnersMock.mockResolvedValue({ ok: true, actors: TEST_PARTNER_ACTORS })
})

describe('/assistant staff authorization', () => {
  it('no session → redirect(/login)', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page({})).rejects.toThrow('REDIRECT:/login')
    expect(catalogMock).not.toHaveBeenCalled()
    expect(listEntitiesMock).not.toHaveBeenCalled()
    expect(listPartnersMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound()', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page({})).rejects.toThrow('NOT_FOUND')
    expect(catalogMock).not.toHaveBeenCalled()
    expect(listEntitiesMock).not.toHaveBeenCalled()
    expect(listPartnersMock).not.toHaveBeenCalled()
  })

  it('authorized staff renders the assistant', async () => {
    authMock.mockResolvedValue({ ok: true, userId: 'staff-1', staffRole: 'operations', isActive: true })
    frameMock.mockResolvedValue({ id: 'staff-1', name: 'Yossi', email: 'yossi@x', role: 'ceo' })
    catalogMock.mockResolvedValue({ ok: true, properties: [] })
    const ui = await Page({})
    expect(catalogMock).toHaveBeenCalledTimes(1)
    expect(listEntitiesMock).toHaveBeenCalledTimes(1)
    expect(listPartnersMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
    expect(ui).toBeTruthy()
    expect(ui).toMatchObject({
      props: {
        entities: [],
        partners: TEST_PARTNER_ACTORS,
      },
    })
  })
})
