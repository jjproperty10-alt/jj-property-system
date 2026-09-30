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
const aliasMock = jest.fn()
jest.mock('@/lib/ops/assistant/opsConversationActions', () => ({
  listAssistantProperties: () => catalogMock(),
  listAssistantPropertyAliases: () => aliasMock(),
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
  aliasMock.mockReset()
  aliasMock.mockResolvedValue({ ok: true, aliases: [] })
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
        suggestedPropertyName: null,
      },
    })
  })

  it('suggests a property only when the catalog match is unique', async () => {
    authMock.mockResolvedValue({ ok: true, userId: 'staff-1', staffRole: 'operations', isActive: true })
    frameMock.mockResolvedValue({ id: 'staff-1', name: 'Yossi', email: 'yossi@x', role: 'ceo' })
    catalogMock.mockResolvedValue({
      ok: true,
      properties: [
        { id: 'p1', name: 'Tamir Dekelia' },
        { id: 'p2', name: 'Tamir Radisson' },
      ],
    })
    const unique = await Page({ searchParams: { property: 'Tamir Dekelia' } })
    expect(unique).toMatchObject({ props: { suggestedPropertyName: 'Tamir Dekelia' } })
    const ambiguous = await Page({ searchParams: { property: 'Tamir' } })
    expect(ambiguous).toMatchObject({ props: { suggestedPropertyName: null } })
    const reopened = await Page({ searchParams: { c: 'conv-1', property: 'Tamir Dekelia' } })
    expect(reopened).toMatchObject({
      props: { initialConversationId: 'conv-1', suggestedPropertyName: null },
    })
  })

  it('suggests a property from one approved alias and does not suggest an unmatched or repeated name', async () => {
    authMock.mockResolvedValue({ ok: true, userId: 'staff-1', staffRole: 'operations', isActive: true })
    frameMock.mockResolvedValue({ id: 'staff-1', name: 'Yossi', email: 'yossi@x', role: 'ceo' })
    catalogMock.mockResolvedValue({
      ok: true,
      properties: [
        { id: 'p1', name: 'Mobile Test House' },
        { id: 'p2', name: 'Tamir Kiti' },
        { id: 'p3', name: 'Tamir Kiti' },
      ],
    })
    aliasMock.mockResolvedValue({
      ok: true,
      aliases: [
        { rawName: 'בית הבדיקה', canonicalName: 'Mobile Test House' },
        { rawName: 'שם חסר', canonicalName: 'Missing House' },
        { rawName: 'תמיר קיטי', canonicalName: 'Tamir Kiti' },
      ],
    })
    const unique = await Page({ searchParams: { property: 'בית הבדיקה' } })
    expect(unique).toMatchObject({ props: { suggestedPropertyName: 'Mobile Test House' } })
    const missing = await Page({ searchParams: { property: 'שם חסר' } })
    expect(missing).toMatchObject({ props: { suggestedPropertyName: null } })
    const repeated = await Page({ searchParams: { property: 'תמיר קיטי' } })
    expect(repeated).toMatchObject({ props: { suggestedPropertyName: null } })
    const reopened = await Page({ searchParams: { c: 'conv-1', property: 'בית הבדיקה' } })
    expect(reopened).toMatchObject({
      props: { initialConversationId: 'conv-1', suggestedPropertyName: null },
    })
  })
})
