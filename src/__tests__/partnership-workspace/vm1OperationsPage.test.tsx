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
const refreshMock = jest.fn()
jest.mock('next/navigation', () => ({
  redirect: (u: string) => redirectMock(u),
  notFound: () => notFoundMock(),
  useRouter: () => ({ refresh: refreshMock }),
}))
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
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

const createJwtClientMock = jest.fn(() => ({ rpc: jest.fn() }))
jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => createJwtClientMock(),
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
  createJwtClientMock.mockClear()
})

describe('VM1 operations route — staff authorization (fail closed)', () => {
  it('no session → redirect(/login), data NOT loaded', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page({ searchParams: {} })).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(loadMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(createJwtClientMock).not.toHaveBeenCalled()
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
      draftAdmissionLines: [],
      ownerStatementLines: [],
      ownerStatementEvidence: {
        ok: false,
        kind: 'missing_evidence',
        reason: 'No effective Owner Statement evidence was found for this period.',
      },
      expenseAdmission: {
        transactionId: null,
        date: null,
        category: null,
        subcategory: null,
        admissionState: 'blocked',
        partnershipChargeEur: null,
        jjActualCostEur: null,
        jjOperatingProfitEur: null,
        reason: 'Approved expense row was not returned as exactly one Production transaction.',
      },
    })
    const html = renderToStaticMarkup(await Page({ searchParams: { from: '2026-08-25', to: '2026-09-17' } }))
    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('Verified')
    expect(html).toContain('412148')
    expect(html).toContain('data-testid="vm1-operations-root"')
    expect(html).toContain('Financial Forecast / תחזית כספית')
    expect(html).toContain('Draft admission review / בדיקת קבלה לטיוטה')
    expect(html).toContain('Approved future-Draft expenses / הוצאות מאושרות לטיוטה עתידית')
    expect(html).toContain('Expense admission blocked')
    expect(loadMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      client: expect.anything(),
      ownerStatementClient: expect.anything(),
    }))
    expect(createJwtClientMock).toHaveBeenCalled()
    expect(html).toContain('לא נמצא Owner Statement אפקטיבי לתקופה זו')
    expect(html).toContain('No effective Owner Statement evidence was found for this period')
    expect(html).not.toContain('Owner Statement evidence not stored')
    expect(html).not.toContain('b2945e7fb84452ff08f2cee224bd8cd960ca1ba85b2941968d5ce108c5f79951')
    expect(html).toContain('data-testid="vm1-os-upload-section"')
    expect(html).toContain('Hostaway Owner Statement upload')
    expect(html).not.toContain('documentHash')
    expect(html).not.toContain('normalized_payload_hash')
    expect(html).not.toContain('50/25/25')
  })

  it('authorized operations staff sees the reader without the Owner Statement upload panel', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'operations', userId: 'u1' })
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
      draftAdmissionLines: [],
      ownerStatementLines: [],
      ownerStatementEvidence: {
        ok: false,
        kind: 'missing_evidence',
        reason: 'No effective Owner Statement evidence was found for this period.',
      },
      expenseAdmission: {
        transactionId: null,
        date: null,
        category: null,
        subcategory: null,
        admissionState: 'blocked',
        partnershipChargeEur: null,
        jjActualCostEur: null,
        jjOperatingProfitEur: null,
        reason: 'Approved expense row was not returned as exactly one Production transaction.',
      },
    })
    const html = renderToStaticMarkup(await Page({ searchParams: { from: '2026-08-25', to: '2026-09-17' } }))
    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(html).toContain('data-testid="vm1-operations-root"')
    expect(html).not.toContain('data-testid="vm1-os-upload-section"')
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
    expect(html).not.toContain('€30.00')
    expect(html).not.toContain('Partnership charge')
    expect(html).not.toContain('JJ actual cost')
    expect(html).not.toContain('JJ operating profit')
    expect(html).not.toContain('data-testid="vm1-expense-admission-approved"')
    expect(html).not.toContain('data-testid="vm1-os-upload-section"')
  })
})
