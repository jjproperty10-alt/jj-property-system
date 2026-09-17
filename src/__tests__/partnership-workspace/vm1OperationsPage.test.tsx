/**
 * Staff Property Operations route — same Partner Reports auth boundary.
 */
jest.mock('server-only', () => ({}))

const redirectMock = jest.fn((url: string) => {
  throw new Error('REDIRECT:' + url)
})
const notFoundMock = jest.fn(() => {
  throw new Error('NOT_FOUND')
})
jest.mock('next/navigation', () => ({
  redirect: (u: string) => redirectMock(u),
  notFound: () => notFoundMock(),
}))

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
})

const authMock = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => authMock(),
}))

const loadMock = jest.fn()
jest.mock('@/lib/partnership-workspace/vm1OperationsService', () => ({
  loadVm1OperationsView: (...args: unknown[]) => loadMock(...args),
}))

const createServiceClientMock = jest.fn(() => ({ rpc: jest.fn() }))
jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => createServiceClientMock(),
}))

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from '@/app/(app)/finance/external-partner/avi/operations/page'
import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from '@/lib/partnership-workspace/vm1Identity'

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  loadMock.mockReset()
  createServiceClientMock.mockClear()
})

describe('VM1 operations route — staff authorization (fail closed)', () => {
  it('no session → redirect(/login), data NOT loaded', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page({ searchParams: {} })).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(loadMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound(), data NOT loaded', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page({ searchParams: {} })).rejects.toThrow('NOT_FOUND')
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('inactive staff → notFound(), data NOT loaded', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    await expect(Page({ searchParams: {} })).rejects.toThrow('NOT_FOUND')
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('authorized staff loads operations after the guard', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    loadMock.mockResolvedValue({
      ok: true,
      from: '2026-08-25',
      to: '2026-09-17',
      identity: {
        canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
        legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
        hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
      },
      reservations: [],
      forecastLines: [],
    })
    const html = renderToStaticMarkup(await Page({ searchParams: { from: '2026-08-25', to: '2026-09-17' } }))
    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Verified')
    expect(html).toContain('412148')
    expect(html).toContain('data-testid="vm1-operations-root"')
    expect(html).toContain('Financial Forecast / תחזית כספית')
  })

  it('invalid range after auth shows a blocked staff error, not reservation rows', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    loadMock.mockResolvedValue({
      ok: false,
      kind: 'invalid_range',
      reason: 'from must be on or before to.',
      from: null,
      to: null,
    })
    const html = renderToStaticMarkup(
      await Page({ searchParams: { from: '2026-09-30', to: '2026-08-25' } }),
    )
    expect(html).toContain('Blocked')
    expect(html).toContain('Operational date range is invalid')
    expect(html).not.toContain('65733679')
  })
})
