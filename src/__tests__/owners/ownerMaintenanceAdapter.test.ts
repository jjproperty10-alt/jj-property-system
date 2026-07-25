/**
 * ownerMaintenanceAdapter.test.ts
 *
 * G3-A: Unit tests for the RC3 maintenance data adapter.
 *
 * Tests verify:
 * - Empty properties → returns []
 * - Property with renovation rows → maps correctly to OwnerMaintenanceItemDTO
 * - description → title mapping (critical: 'Roof repair' preservation)
 * - Platform tracking rows excluded
 * - 'reference' display group excluded
 * - 'info' display group excluded (internal tracking only)
 * - status always 'unknown', statusReason always 'rc3_has_no_lifecycle_status'
 * - source always 'rc3'
 * - amountEur from client_amount (COALESCE semantics)
 * - Multiple properties → results merged, sorted by date desc
 * - Failed property → skipped, others returned
 */

jest.mock('server-only', () => ({}), { virtual: true })

const mockFetchRC3Report = jest.fn()
jest.mock('@/lib/report/fetchReport', () => ({
  fetchRC3Report: (...args: unknown[]) => mockFetchRC3Report(...args),
}))

import { fetchOwnerMaintenance } from '@/lib/owners/ownerMaintenanceAdapter'
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRenovationRow(overrides: Partial<{
  id: string
  date: string
  description: string | null
  subcategory: string | null
  display_label: string
  amount_eur: number
  client_charge: number | null
  client_amount: number
  display_group: string
  is_platform_tracking: boolean
}> = {}) {
  return {
    id: overrides.id ?? 'row-1',
    date: overrides.date ?? '2026-05-01',
    property_name: 'Villa Mazotos',
    reporting_name: 'Villa Mazotos',
    category: 'Renovation',
    subcategory: overrides.subcategory ?? 'General Renovation',
    description: overrides.description ?? null,
    payer: 'JJ',
    payee: 'Supplier',
    amount_eur: overrides.amount_eur ?? 1200,
    client_charge: overrides.client_charge ?? null,
    client_amount: overrides.client_amount ?? overrides.amount_eur ?? 1200,
    notes: null,
    k_note: null,
    account_type: 'renovation',
    is_contract_value: false,
    is_platform_tracking: overrides.is_platform_tracking ?? false,
    is_bpo: false,
    review_status: 'active',
    balance_effect: -(overrides.amount_eur ?? 1200),
    is_balance_affecting: true,
    display_group: overrides.display_group ?? 'expense',
    display_label: overrides.display_label ?? 'Renovation Work',
  }
}

function makeRenovationSection(rows: ReturnType<typeof makeRenovationRow>[]): RC3AccountSection {
  return {
    account_type: 'renovation',
    account_label: 'Property Renovation',
    account_label_he: 'שיפוץ נכס',
    balance_convention: 'client_debt',
    opening_balance: 0,
    contract_baseline: 0,
    rows,
    total_income: 0,
    total_expenses: rows.reduce((s, r) => s + r.amount_eur, 0),
    total_bpo: 0,
    closing_balance: -(rows.reduce((s, r) => s + r.amount_eur, 0)),
  } as unknown as RC3AccountSection
}

function makeReport(reportingName: string, rows: ReturnType<typeof makeRenovationRow>[]): RC3PropertyReport {
  return {
    reporting_name: reportingName,
    from_date: null,
    to_date: null,
    generated_at: '2026-07-25T00:00:00Z',
    accounts: rows.length > 0 ? [makeRenovationSection(rows)] : [],
    has_sale: false,
    has_renovation: rows.length > 0,
    has_rental: false,
    has_airbnb: false,
  }
}

afterEach(() => jest.clearAllMocks())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fetchOwnerMaintenance', () => {
  it('returns [] when properties list is empty', async () => {
    const result = await fetchOwnerMaintenance({ properties: [] })
    expect(result).toEqual([])
    expect(mockFetchRC3Report).not.toHaveBeenCalled()
  })

  it('returns [] when no renovation account in report', async () => {
    mockFetchRC3Report.mockResolvedValueOnce({
      reporting_name: 'Villa Mazotos',
      from_date: null, to_date: null, generated_at: '2026-07-25T00:00:00Z',
      accounts: [], has_sale: false, has_renovation: false, has_rental: false, has_airbnb: false,
    })

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })
    expect(result).toEqual([])
  })

  it('maps description → title (critical: Roof repair preservation)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ id: 'uuid-1', description: 'Roof repair', amount_eur: 1200, client_amount: 1200 }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Roof repair')                                  // ← mandatory preservation
    expect(result[0].amountEur).toBe('1200')
  })

  it('falls back to display_label then subcategory when description is null', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ description: null, display_label: 'Renovation Work', subcategory: 'Plumbing' }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })
    expect(result[0].title).toBe('Renovation Work')
  })

  it('falls back to subcategory when description and display_label are null', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ description: null, display_label: '', subcategory: 'Electrical' }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })
    // display_label is falsy → subcategory
    expect(result[0].title).toBe('Electrical')
  })

  it('sets status to "unknown" and statusReason to "rc3_has_no_lifecycle_status"', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeRenovationRow()]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })

    expect(result[0].status).toBe('unknown')
    expect(result[0].statusReason).toBe('rc3_has_no_lifecycle_status')
  })

  it('sets source to "rc3" always', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeRenovationRow()]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })
    expect(result[0].source).toBe('rc3')
  })

  it('uses client_amount for amountEur (COALESCE semantics)', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ amount_eur: 1500, client_charge: 1200, client_amount: 1200 }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })
    expect(result[0].amountEur).toBe('1200')
  })

  it('excludes platform tracking rows', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ id: 'track-1', is_platform_tracking: true,  description: 'Tracking row' }),
        makeRenovationRow({ id: 'real-1',  is_platform_tracking: false, description: 'Real item' }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Real item')
  })

  it('excludes reference display group rows', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ id: 'ref-1',  display_group: 'reference', description: 'Contract value' }),
        makeRenovationRow({ id: 'exp-1',  display_group: 'expense',   description: 'Actual work' }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Actual work')
  })

  it('excludes info display group rows', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeRenovationRow({ id: 'info-1', display_group: 'info',    description: 'Internal tracking' }),
        makeRenovationRow({ id: 'exp-1',  display_group: 'expense', description: 'Roof repair' }),
      ]),
    )

    const result = await fetchOwnerMaintenance({ properties: ['Villa Mazotos'] })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Roof repair')
  })

  it('merges results from multiple properties sorted by date desc', async () => {
    mockFetchRC3Report
      .mockResolvedValueOnce(
        makeReport('Villa Mazotos', [
          makeRenovationRow({ id: 'vm-old', date: '2025-03-01', description: 'Old repair' }),
          makeRenovationRow({ id: 'vm-new', date: '2026-05-15', description: 'New repair' }),
        ]),
      )
      .mockResolvedValueOnce(
        makeReport('Apartment A', [
          makeRenovationRow({ id: 'apt-1', date: '2026-01-10', description: 'Apartment work' }),
        ]),
      )

    const result = await fetchOwnerMaintenance({
      properties: ['Villa Mazotos', 'Apartment A'],
    })

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('vm-new')     // 2026-05-15 — most recent
    expect(result[1].id).toBe('apt-1')      // 2026-01-10
    expect(result[2].id).toBe('vm-old')     // 2025-03-01 — oldest
  })

  it('skips failed properties and returns results from successful ones', async () => {
    mockFetchRC3Report
      .mockRejectedValueOnce(new Error('[TEST] property A fails'))
      .mockResolvedValueOnce(
        makeReport('Apartment B', [
          makeRenovationRow({ description: 'Apartment repair' }),
        ]),
      )

    const result = await fetchOwnerMaintenance({
      properties: ['Apartment A', 'Apartment B'],
    })

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Apartment repair')
  })

  it('returns [] when all properties fail', async () => {
    mockFetchRC3Report.mockRejectedValue(new Error('[TEST] all fail'))

    const result = await fetchOwnerMaintenance({
      properties: ['Villa Mazotos', 'Apartment B'],
    })

    expect(result).toEqual([])
  })
})
