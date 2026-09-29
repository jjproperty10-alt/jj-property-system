/**
 * /owners list staff gate.
 *
 * authenticateStatementUser() must finish before getOwnersRoom().
 * Auth failure, non-staff, and inactive staff stop without an owner-room read.
 * Active staff still receive the list.
 *
 * Company isolation is not implemented here. The page states that the Owners
 * Room remains limited to a single active company.
 */

import * as fs from 'fs'
import * as path from 'path'

jest.mock('server-only', () => ({}))

const redirectMock = jest.fn((url: string) => {
  throw new Error('REDIRECT:' + url)
})
const notFoundMock = jest.fn(() => {
  throw new Error('NOT_FOUND')
})
jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock(),
}))

const authMock = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => authMock(),
}))

const roomMock = jest.fn()
jest.mock('@/lib/owners/ownerWorkspaceService', () => ({
  getOwnersRoom: () => roomMock(),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children?: unknown }) => children ?? null,
}))

jest.mock('@/components/ds', () => ({
  PageShell: ({ children }: { children?: unknown }) => children ?? null,
  WorkspaceHeader: () => null,
}))

jest.mock('../OwnersRoomClient', () => ({
  OwnersRoomClient: () => null,
}))

import Page from '@/app/(app)/owners/page'

const STAFF = {
  ok: true as const,
  userId: 'staff-1',
  staffRole: 'ceo',
  isActive: true,
}

const ROOM = {
  items: [
    {
      identity: { displayName: 'Fixture Owner' },
      balanceEur: 10,
    },
  ],
  summary: {
    totalOwners: 1,
    readyToSend: 0,
    actionRequired: 0,
    openCorrections: 0,
  },
}

function findProp(node: unknown, key: string): unknown {
  if (!node || typeof node !== 'object') return undefined
  const props = (node as { props?: Record<string, unknown> }).props
  if (props && key in props) return props[key]
  const children = props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findProp(child, key)
      if (found !== undefined) return found
    }
  } else if (children) {
    return findProp(children, key)
  }
  return undefined
}

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockReset()
  roomMock.mockReset()
  roomMock.mockResolvedValue(ROOM)
})

describe('/owners staff authorization', () => {
  it('AUTH_ERROR does not call getOwnersRoom()', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'AUTH_ERROR' })
    await expect(Page({})).rejects.toThrow('NOT_FOUND')
    expect(roomMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('NOT_STAFF does not call getOwnersRoom()', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page({})).rejects.toThrow('NOT_FOUND')
    expect(roomMock).not.toHaveBeenCalled()
  })

  it('STAFF_INACTIVE does not call getOwnersRoom()', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    await expect(Page({})).rejects.toThrow('NOT_FOUND')
    expect(roomMock).not.toHaveBeenCalled()
  })

  it('NO_SESSION redirects to /login and does not call getOwnersRoom()', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page({})).rejects.toThrow('REDIRECT:/login')
    expect(roomMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('does not start getOwnersRoom() until staff auth resolves', async () => {
    let release: (value: unknown) => void = () => {}
    authMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const pending = Page({})
    expect(roomMock).not.toHaveBeenCalled()
    release(STAFF)
    const ui = await pending
    expect(roomMock).toHaveBeenCalledTimes(1)
    expect(findProp(ui, 'room')).toEqual(ROOM)
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('active staff still loads the list', async () => {
    authMock.mockResolvedValue(STAFF)
    const ui = await Page({ searchParams: { q: 'fixture' } })
    expect(authMock).toHaveBeenCalledTimes(1)
    expect(roomMock).toHaveBeenCalledTimes(1)
    expect(findProp(ui, 'room')).toEqual(ROOM)
    expect(findProp(ui, 'initialQuery')).toBe('fixture')
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})

describe('/owners staff gate source', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../page.tsx'),
    'utf8',
  )

  it('calls authenticateStatementUser() before getOwnersRoom()', () => {
    const authIdx = source.indexOf('authenticateStatementUser()')
    const roomIdx = source.indexOf('getOwnersRoom()')
    expect(authIdx).toBeGreaterThan(-1)
    expect(roomIdx).toBeGreaterThan(authIdx)
  })

  it('records the single-company limit without a company filter', () => {
    const compact = source.replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ')
    expect(compact).toContain(
      'The Owners Room remains limited to a single active company. Do not enable it for a second company until every list source, certification, and balance is isolated by company and entity id.',
    )
    expect(compact).toContain('does not establish company isolation')
    expect(source).not.toContain('operating_company')
  })
})
