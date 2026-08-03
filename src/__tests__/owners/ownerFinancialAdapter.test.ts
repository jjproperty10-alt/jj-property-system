/**
 * ownerFinancialAdapter.test.ts
 *
 * G3-A: Unit tests for the RC3 financial data adapter.
 *
 * Tests verify:
 * - Empty properties → empty DTO (null position, no sections)
 * - All fetchRC3Report calls fail → empty DTO (never throws)
 * - Partial failure → uses available reports only
 * - Composition arithmetic D-1: sums of RC3 engine section aggregates
 * - Platform tracking rows excluded from section rows
 * - 'reference' display group excluded
 * - display_group mapping → OwnerFinancialRowDTO.displayGroup
 */

jest.mock('server-only', () => ({}), { virtual: true })

const mockFetchRC3Report = jest.fn()
jest.mock('@/lib/report/fetchReport', () => ({
  fetchRC3Report: (...args: unknown[]) => mockFetchRC3Report(...args),
}))

import { fetchOwnerFinancial } from '@/lib/owners/ownerFinancialAdapter'
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<{
  id: string
  date: string
  description: string | null
  subcategory: string | null
  amount_eur: number
  client_charge: number | null
  client_amount: number
  display_group: string
  display_label: string
  is_platform_tracking: boolean
  is_bpo: boolean
  is_balance_affecting: boolean
  balance_effect: number
}> = {}) {
  return {
    id: overrides.id ?? 'row-1',
    date: overrides.date ?? '2026-05-01',
    property_name: 'Villa Mazotos',
    reporting_name: 'Villa Mazotos',
    category: 'Airbnb',
    subcategory: overrides.subcategory ?? 'Platform Income',
    description: overrides.description ?? null,
    payer: 'Airbnb',
    payee: 'JJ',
    amount_eur: overrides.amount_eur ?? 1000,
    client_charge: overrides.client_charge ?? null,
    client_amount: overrides.client_amount ?? overrides.amount_eur ?? 1000,
    notes: null,
    k_note: null,
    account_type: 'airbnb',
    is_contract_value: false,
    is_platform_tracking: overrides.is_platform_tracking ?? false,
    is_bpo: overrides.is_bpo ?? false,
    review_status: 'active',
    balance_effect: overrides.balance_effect ?? overrides.amount_eur ?? 1000,
    is_balance_affecting: overrides.is_balance_affecting ?? true,
    display_group: overrides.display_group ?? 'income',
    display_label: overrides.display_label ?? 'Platform Income',
  }
}

function makeSection(overrides: Partial<{
  account_type: string
  account_label: string
  total_income: number
  total_expenses: number
  total_bpo: number
  closing_balance: number
  rows: ReturnType<typeof makeRow>[]
}>  = {}): RC3AccountSection {
  return {
    account_type: (overrides.account_type ?? 'airbnb') as RC3AccountSection['account_type'],
    account_label: overrides.account_label ?? 'Airbnb',
    account_label_he: 'אייר בי אנד בי',
    balance_convention: 'owner_credit',
    opening_balance: 0,
    contract_baseline: 0,
    rows: overrides.rows ?? [],
    total_income: overrides.total_income ?? 1000,
    total_expenses: overrides.total_expenses ?? 200,
    total_bpo: overrides.total_bpo ?? 800,
    closing_balance: overrides.closing_balance ?? 1800,
  } as unknown as RC3AccountSection
}

function makeReport(
  reportingName: string,
  sections: RC3AccountSection[],
): RC3PropertyReport {
  return {
    reporting_name: reportingName,
    from_date: null,
    to_date: null,
    generated_at: '2026-07-25T00:00:00Z',
    accounts: sections,
    has_purchase: sections.some(s => s.account_type === 'purchase'),
    has_sale: sections.some(s => s.account_type === 'sale'),
    has_renovation: sections.some(s => s.account_type === 'renovation'),
    has_rental: sections.some(s => s.account_type === 'rental'),
    has_airbnb: sections.some(s => s.account_type === 'airbnb'),
  }
}

afterEach(() => jest.clearAllMocks())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fetchOwnerFinancial', () => {
  it('returns empty DTO when properties list is empty', async () => {
    const result = await fetchOwnerFinancial({ properties: [] })

    expect(result.position.incomeEur).toBeNull()
    expect(result.position.expensesEur).toBeNull()
    expect(result.sections).toHaveLength(0)
    expect(result.timeline).toHaveLength(0)
    expect(mockFetchRC3Report).not.toHaveBeenCalled()
  })

  it('returns empty DTO when all fetchRC3Report calls fail', async () => {
    mockFetchRC3Report.mockRejectedValue(new Error('[TEST] RC3 unavailable'))

    const result = await fetchOwnerFinancial({
      properties: ['Villa Mazotos', 'Apartment A'],
    })

    expect(result.position.incomeEur).toBeNull()
    expect(result.position.closingBalanceEur).toBeNull()
    expect(result.sections).toHaveLength(0)
  })

  it('uses partial results when only some properties fail', async () => {
    mockFetchRC3Report
      .mockResolvedValueOnce(
        makeReport('Villa Mazotos', [
          makeSection({ account_type: 'rental', total_income: 5000, total_expenses: 1000, total_bpo: 4000, closing_balance: 4000 }),
        ]),
      )
      .mockRejectedValueOnce(new Error('[TEST] second property fails'))

    const result = await fetchOwnerFinancial({
      properties: ['Villa Mazotos', 'Apartment B'],
    })

    // Only Villa Mazotos contributed
    expect(result.sections).toHaveLength(1)
    expect(result.position.incomeEur).toBe('5000')
    expect(result.position.expensesEur).toBe('1000')
  })

  it('composes position by summing RC3 engine section aggregates (D-1 Option B)', async () => {
    // Two properties, each with one section
    mockFetchRC3Report
      .mockResolvedValueOnce(
        makeReport('Villa Mazotos', [
          makeSection({ total_income: 3000, total_expenses: 500, total_bpo: 2500, closing_balance: 3500 }),
        ]),
      )
      .mockResolvedValueOnce(
        makeReport('Apartment A', [
          makeSection({ account_type: 'rental', account_label: 'Rental', total_income: 2000, total_expenses: 300, total_bpo: 1700, closing_balance: 2300 }),
        ]),
      )

    const result = await fetchOwnerFinancial({
      properties: ['Villa Mazotos', 'Apartment A'],
    })

    expect(result.position.incomeEur).toBe('5000')            // 3000 + 2000
    expect(result.position.expensesEur).toBe('800')           // 500 + 300
    expect(result.position.netEur).toBe('4200')               // 5000 - 800
    expect(result.position.paidToOwnerEur).toBe('4200')       // 2500 + 1700
    expect(result.position.closingBalanceEur).toBe('5800')    // 3500 + 2300
    expect(result.position.pendingEur).toBeNull()             // RC2 scope
  })

  it('excludes platform tracking rows from section rows', async () => {
    const platformRow = makeRow({ is_platform_tracking: true, description: 'Platform tracking', amount_eur: 100, client_amount: 100 })
    const normalRow   = makeRow({ id: 'normal-1', is_platform_tracking: false, description: 'Rent', amount_eur: 900, client_amount: 900 })

    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeSection({ rows: [platformRow, normalRow] }),
      ]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
    const rows = result.sections[0]?.rows ?? []

    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Rent')
  })

  it('excludes reference display group rows', async () => {
    const referenceRow = makeRow({ id: 'ref-1', display_group: 'reference', description: 'Contract value', amount_eur: 50000, client_amount: 50000 })
    const incomeRow    = makeRow({ id: 'inc-1', display_group: 'income', description: 'Platform Income', amount_eur: 1200, client_amount: 1200 })

    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeSection({ rows: [referenceRow, incomeRow] }),
      ]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
    const rows = result.sections[0]?.rows ?? []

    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Platform Income')
  })

  it('maps display_group to OwnerFinancialRowDTO.displayGroup correctly', async () => {
    const rows = [
      makeRow({ id: 'r1', display_group: 'income',      description: 'Income row',    amount_eur: 100, client_amount: 100 }),
      makeRow({ id: 'r2', display_group: 'expense',     description: 'Expense row',   amount_eur: 50,  client_amount: 50  }),
      makeRow({ id: 'r3', display_group: 'payment_out', description: 'Payment row',   amount_eur: 80,  client_amount: 80  }),
      makeRow({ id: 'r4', display_group: 'info',        description: 'Info row',      amount_eur: 10,  client_amount: 10  }),
    ]

    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeSection({ rows })]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
    const dtoRows = result.sections[0]?.rows ?? []

    expect(dtoRows[0].displayGroup).toBe('income')
    expect(dtoRows[1].displayGroup).toBe('expense')
    expect(dtoRows[2].displayGroup).toBe('payment')
    expect(dtoRows[3].displayGroup).toBe('info')
  })

  it('maps section label from account_label', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeSection({ account_type: 'renovation', account_label: 'Property Renovation' }),
      ]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
    expect(result.sections[0].label).toBe('Property Renovation')
    expect(result.sections[0].type).toBe('renovation')
  })

  it('uses client_amount for row amountEur (COALESCE semantics)', async () => {
    const row = makeRow({
      amount_eur: 1000,
      client_charge: 800,   // client pays 800, JJ cost is 1000
      client_amount: 800,
    })

    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeSection({ rows: [row] })]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
    expect(result.sections[0].rows[0].amountEur).toBe('800')
  })

  it('passes fromDate and toDate to fetchRC3Report', async () => {
    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [makeSection()]),
    )

    await fetchOwnerFinancial({
      properties: ['Villa Mazotos'],
      fromDate: '2026-01-01',
      toDate:   '2026-06-30',
    })

    expect(mockFetchRC3Report).toHaveBeenCalledWith({
      reportingName: 'Villa Mazotos',
      fromDate: '2026-01-01',
      toDate:   '2026-06-30',
    })
  })
})
