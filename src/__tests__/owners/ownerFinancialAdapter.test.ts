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

// ─── Supabase mock (required for fetchOccupancyPosition) ─────────────────────

const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
const mockLimit = jest.fn(() => ({ single: mockSingle }))
const mockIn = jest.fn(() => ({ limit: mockLimit }))
const mockSelect = jest.fn(() => ({ in: mockIn }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
const mockSchema = jest.fn(() => ({ from: mockFrom }))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({ schema: mockSchema }),
}))

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
  balance_convention: string
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
    balance_convention: overrides.balance_convention ?? 'owner_credit',
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
    expect(result.position.netEur).toBe('5800')               // computeNetOwnerBalance: 3500 + 2300 (both owner_credit)
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

  it('keeps reference display group rows but flags them with isReference', async () => {
    const referenceRow = makeRow({ id: 'ref-1', display_group: 'reference', description: 'Contract value', amount_eur: 50000, client_amount: 50000 })
    const incomeRow    = makeRow({ id: 'inc-1', display_group: 'income', description: 'Platform Income', amount_eur: 1200, client_amount: 1200 })

    mockFetchRC3Report.mockResolvedValueOnce(
      makeReport('Villa Mazotos', [
        makeSection({ rows: [referenceRow, incomeRow] }),
      ]),
    )

    const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
    const rows = result.sections[0]?.rows ?? []

    expect(rows).toHaveLength(2)
    expect(rows[0].isReference).toBe(true)
    expect(rows[0].description).toBe('Contract value')
    expect(rows[1].isReference).toBe(false)
    expect(rows[1].description).toBe('Platform Income')
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

  // ── Evidence-driven Purchase disposition ────────────────────────────────────

  describe('evidence-driven Purchase disposition', () => {
    // ── PURCHASE_DISPOSITIONS registry ──────────────────────────────

    it('classifies Uriel Duplex as internal_settled (evidence registry)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({ account_type: 'purchase', account_label: 'Property Purchase', balance_convention: 'client_debt', closing_balance: 130000, total_income: 0 }),
          makeSection({ account_type: 'sale', account_label: 'Property Sale', balance_convention: 'client_debt', closing_balance: -8000 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })

      // Purchase excluded from Overall Net (no Purchase Expenses → null section)
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).not.toContain('purchase')
      expect(deptTypes).toContain('sale')
    })

    it('classifies Uriel Studio Kitty as internal_settled (evidence registry)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Studio Kitty', [
          makeSection({ account_type: 'purchase', account_label: 'Property Purchase', balance_convention: 'client_debt', closing_balance: 0, total_income: 0 }),
          makeSection({ account_type: 'sale', account_label: 'Property Sale', balance_convention: 'client_debt', closing_balance: -5000 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Studio Kitty'] })

      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).not.toContain('purchase')
    })

    it('classifies Uriel Kokkines as internal_settled (evidence registry)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Kokkines', [
          makeSection({ account_type: 'purchase', account_label: 'Property Purchase', balance_convention: 'client_debt', closing_balance: 35000, total_income: 0 }),
          makeSection({ account_type: 'sale', account_label: 'Property Sale', balance_convention: 'client_debt', closing_balance: -15000 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Kokkines'] })

      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).not.toContain('purchase')
    })

    it('classifies Uriel Sharon English Metro as internal_settled (evidence registry)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Sharon English Metro', [
          makeSection({ account_type: 'purchase', account_label: 'Property Purchase', balance_convention: 'client_debt', closing_balance: 205250, total_income: 250 }),
          makeSection({ account_type: 'sale', account_label: 'Property Sale', balance_convention: 'client_debt', closing_balance: -40550 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Sharon English Metro'] })

      // ALL Purchase = JJ internal → fully excluded from owner net
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).not.toContain('purchase')
      expect(deptTypes).toContain('sale')
    })

    it('classifies unlisted property with Purchase as needs_review', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Tamir Dekelia', [
          makeSection({ account_type: 'purchase', account_label: 'Property Purchase', balance_convention: 'client_debt', closing_balance: 180000 }),
          makeSection({ account_type: 'sale', account_label: 'Property Sale', balance_convention: 'client_debt', closing_balance: -10000 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Tamir Dekelia'] })

      // Unlisted property → needs_review → purchase kept in net (no confirmed settlement)
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).toContain('purchase')
      expect(deptTypes).toContain('sale')
    })

    // ── Partial exclusion: getOwnerRelevantPurchaseSection ───────────

    it('fully excludes Purchase from net when total_income = 0 (no Purchase Expenses)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 130000,
            total_income: 0,
          }),
          makeSection({
            account_type: 'rental',
            account_label: 'Rental',
            balance_convention: 'owner_credit',
            closing_balance: 5000,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })

      // Only rental in the net — Purchase fully excluded (no expenses)
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).toEqual(['rental'])
      expect(result.overallNet!.netEur).toBe('5000')
    })

    it('fully excludes ALL Purchase from net for internal_settled (no partial exclusion)', async () => {
      // Sharon: even though total_income = 250 (gardener expense), ALL Purchase = JJ internal
      // Purchase is fully excluded from owner net regardless of Purchase Expenses
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Sharon English Metro', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 205250,
            total_income: 250,
            total_expenses: 30000,
            total_bpo: 0,
          }),
          makeSection({
            account_type: 'sale',
            account_label: 'Property Sale',
            balance_convention: 'client_debt',
            closing_balance: -40550,
            total_income: 0,
            total_expenses: 0,
          }),
          makeSection({
            account_type: 'rental',
            account_label: 'Rental',
            balance_convention: 'owner_credit',
            closing_balance: -150,
            total_income: 0,
            total_expenses: 150,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Sharon English Metro'] })

      // Net = rental(-150 owner_credit → -150) + sale(-40550 client_debt → +40550) = 40400
      // Purchase fully excluded (ALL Purchase = JJ internal)
      expect(result.overallNet).not.toBeNull()

      // Purchase NOT in departments (full exclusion)
      const purchaseDept = result.overallNet!.departments.find(d => d.type === 'purchase')
      expect(purchaseDept).toBeUndefined()

      // Net = sale + rental only = 40550 + (-150) = 40400
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).toContain('sale')
      expect(deptTypes).toContain('rental')
      expect(deptTypes).not.toContain('purchase')
    })

    // ── Property groups (per-property net) ──────────────────────────

    it('computes correct per-property net with partial exclusion in propertyGroups', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 130000,
            total_income: 0,
          }),
          makeSection({
            account_type: 'sale',
            account_label: 'Property Sale',
            balance_convention: 'client_debt',
            closing_balance: -16396,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })
      const group = result.propertyGroups?.find(g => g.propertyName === 'Uriel Duplex')

      expect(group).toBeDefined()
      expect(group!.hasPurchaseExclusion).toBe(true)
      expect(group!.hasNeedsReviewPurchase).toBe(false)
      // Net = sale only (client_debt): net -= (-16396) = +16396 (Due to You — client overpaid)
      expect(group!.propertyNet.netEur).toBe('16396')
      expect(group!.propertyNet.label).toBe('due_to_you')
    })

    // ── Section DTO: displayNote ────────────────────────────────────

    it('shows full-exclusion displayNote for internal_settled even with Purchase Expenses', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Sharon English Metro', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 205250,
            total_income: 250,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Sharon English Metro'] })
      const purchaseSection = result.sections.find(s => s.type === 'purchase')

      expect(purchaseSection).toBeDefined()
      // ALL Purchase = JJ internal — same displayNote regardless of Purchase Expenses
      expect(purchaseSection!.displayNote).toContain('excluded from Owner Summary')
      expect(purchaseSection!.purchaseDisposition).toBe('internal_settled')
    })

    it('shows full-exclusion displayNote for internal_settled without Purchase Expenses', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 130000,
            total_income: 0,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })
      const purchaseSection = result.sections.find(s => s.type === 'purchase')

      expect(purchaseSection).toBeDefined()
      // ALL Purchase = JJ internal — same displayNote for all internal_settled
      expect(purchaseSection!.displayNote).toContain('excluded from Owner Summary')
      expect(purchaseSection!.purchaseDisposition).toBe('internal_settled')
    })

    it('shows needs_review displayNote for unlisted property with Purchase', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Some New Property', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 95000,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Some New Property'] })
      const purchaseSection = result.sections.find(s => s.type === 'purchase')

      expect(purchaseSection).toBeDefined()
      expect(purchaseSection!.displayNote).toContain('Needs Review')
      expect(purchaseSection!.displayNote).toContain('95,000')
      expect(purchaseSection!.purchaseDisposition).toBe('needs_review')
    })

    // ── Section visibility ──────────────────────────────────────────

    it('shows purchase section in sections breakdown even when excluded from net', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 130000,
            total_income: 0,
          }),
          makeSection({
            account_type: 'sale',
            account_label: 'Property Sale',
            balance_convention: 'client_debt',
            closing_balance: -8000,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })

      // Sections breakdown shows ALL sections including purchase
      const sectionTypes = result.sections.map(s => s.type)
      expect(sectionTypes).toContain('purchase')
      expect(sectionTypes).toContain('sale')

      // But Overall Net excludes purchase (internal_settled, no expenses)
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).not.toContain('purchase')
    })

    // ── Non-disposition properties ──────────────────────────────────

    it('keeps purchase in Overall Net for JJ-owned property (no disposition entry)', async () => {
      const purchaseSection = makeSection({
        account_type: 'purchase',
        account_label: 'Property Purchase',
        balance_convention: 'client_debt',
        closing_balance: 100000,
      })
      const rentalSection = makeSection({
        account_type: 'rental',
        account_label: 'Rental',
        balance_convention: 'owner_credit',
        closing_balance: 5000,
      })

      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Villa Mazotos', [purchaseSection, rentalSection]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })

      // Villa Mazotos is not in PURCHASE_DISPOSITIONS and has no Purchase
      // section in this test (wait — it does have purchase). Since it's
      // not in the evidence registry, it gets needs_review → purchase stays in net.
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).toContain('purchase')
      expect(deptTypes).toContain('rental')
    })

    // ── Oshrit legacy NEEDS_REVIEW_PROPERTIES exclusion ─────────────

    it('excludes purchase from Oshrit Overall Net (NEEDS_REVIEW_PROPERTIES guard)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Oshrit Deklia', [
          makeSection({ account_type: 'purchase', account_label: 'Property Purchase', balance_convention: 'client_debt', closing_balance: 183000 }),
          makeSection({ account_type: 'sale', account_label: 'Property Sale', balance_convention: 'client_debt', closing_balance: -5600 }),
          makeSection({ account_type: 'rental', account_label: 'Rental', balance_convention: 'owner_credit', closing_balance: -17380 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).not.toContain('purchase')
      expect(deptTypes).toContain('sale')
      expect(deptTypes).toContain('rental')
    })
  })

  // ── Production guard ────────────────────────────────────────────────────────

  describe('production guard — needs_review for incomplete accounting models', () => {
    it('marks Oshrit Deklia Overall Net as needs_review', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Oshrit Deklia', [
          makeSection({ account_type: 'rental', account_label: 'Rental', closing_balance: 5000 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

      expect(result.overallNet).not.toBeNull()
      expect(result.overallNet!.reviewStatus).toBe('needs_review')
      expect(result.overallNet!.reviewReason).toBeTruthy()
    })

    it('does NOT mark non-guarded properties as needs_review', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Villa Mazotos', [
          makeSection({ account_type: 'rental', account_label: 'Rental', closing_balance: 5000 }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })

      expect(result.overallNet).not.toBeNull()
      expect(result.overallNet!.reviewStatus).toBeUndefined()
    })

    it('does NOT set reviewStatus when overallNet is null (no sections)', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Oshrit Deklia', []),
      )

      const result = await fetchOwnerFinancial({ properties: ['Oshrit Deklia'] })

      expect(result.overallNet).toBeNull()
    })
  })

  // ── KPI reconciliation with Purchase exclusion ────────────────────────────

  describe('KPI reconciliation', () => {
    it('KPIs exclude Purchase sections for internal_settled properties', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 130000,
            total_income: 0,
            total_expenses: 50000,
            total_bpo: 0,
          }),
          makeSection({
            account_type: 'sale',
            account_label: 'Property Sale',
            balance_convention: 'client_debt',
            closing_balance: -16396,
            total_income: 0,
            total_expenses: 16396,
            total_bpo: 0,
          }),
          makeSection({
            account_type: 'rental',
            account_label: 'Rental',
            balance_convention: 'owner_credit',
            closing_balance: 3000,
            total_income: 5000,
            total_expenses: 2000,
            total_bpo: 3000,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })

      // KPIs derive income/expenses from owner_credit sections only (rental, airbnb).
      // client_debt sections (purchase, sale, renovation) include contract reference
      // values that inflate raw totals — their impact is captured via
      // computeNetOwnerBalance in position.netEur instead.
      // incomeEur = rental(5000) only (sale is client_debt → excluded from KPI)
      // expensesEur = rental(2000) only (sale is client_debt → excluded from KPI)
      expect(result.position.incomeEur).toBe('5000')
      expect(result.position.expensesEur).toBe('2000')
    })

    it('KPIs include Purchase sections for needs_review properties', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Tamir Dekelia', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 180000,
            total_income: 0,
            total_expenses: 70000,
          }),
          makeSection({
            account_type: 'rental',
            account_label: 'Rental',
            balance_convention: 'owner_credit',
            closing_balance: 2000,
            total_income: 4000,
            total_expenses: 1000,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Tamir Dekelia'] })

      // KPIs derive income/expenses from owner_credit sections only (rental, airbnb).
      // Purchase (client_debt) excluded from KPI raw totals regardless of disposition.
      // incomeEur = rental(4000) only
      // expensesEur = rental(1000) only
      expect(result.position.incomeEur).toBe('4000')
      expect(result.position.expensesEur).toBe('1000')
    })
  })

  // ── Hardening: resolveDescription — Fabi staff accommodation ──────────────

  describe('resolveDescription (DS-009B Fabi staff accommodation)', () => {
    it('labels Duplex Tenant Payment with שכירות as Staff Accommodation — Rent Offset (Fabi)', async () => {
      const row = makeRow({
        id: 'fabi-1',
        subcategory: 'Tenant Payment',
        description: 'שכירות הדירה למטה',
        amount_eur: 350,
        client_amount: 350,
        display_group: 'income',
        display_label: 'Tenant Payment',
      })

      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({ account_type: 'rental', account_label: 'Rental', rows: [row] }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })
      const dtoRow = result.sections.find(s => s.type === 'rental')?.rows[0]

      expect(dtoRow).toBeDefined()
      expect(dtoRow!.description).toBe('Staff Accommodation — Rent Offset (Fabi)')
    })

    it('labels Duplex Staff Accommodation Rent as Owner Entitlement', async () => {
      const row = makeRow({
        id: 'sar-1',
        subcategory: 'Staff Accommodation Rent',
        description: 'Staff Accommodation Rent',
        amount_eur: 1000,
        client_amount: 1000,
        display_group: 'income',
        display_label: 'Staff Accommodation Rent',
      })

      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({ account_type: 'rental', account_label: 'Rental', rows: [row] }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })
      const dtoRow = result.sections.find(s => s.type === 'rental')?.rows[0]

      expect(dtoRow).toBeDefined()
      expect(dtoRow!.description).toBe('Staff Accommodation Rent — Owner Entitlement')
    })

    it('does NOT apply Fabi label to non-Duplex properties', async () => {
      const row = makeRow({
        id: 'nonfabi-1',
        subcategory: 'Tenant Payment',
        description: 'שכירות הדירה למטה',
        amount_eur: 500,
        client_amount: 500,
        display_group: 'income',
        display_label: 'Tenant Payment',
      })

      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Villa Mazotos', [
          makeSection({ account_type: 'rental', account_label: 'Rental', rows: [row] }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
      const dtoRow = result.sections.find(s => s.type === 'rental')?.rows[0]

      expect(dtoRow!.description).toBe('שכירות הדירה למטה')
    })
  })

  // ── Hardening: isReference flag ───────────────────────────────────────────

  describe('isReference flag on rows', () => {
    it('sets isReference=true for reference display_group rows (shown but flagged)', async () => {
      // Reference rows ARE filtered out of visible sections (excluded in mapSectionToDTO).
      // But rows that pass through with other display_groups should have isReference=false.
      const incomeRow = makeRow({ id: 'inc-ref', display_group: 'income', description: 'Rent', amount_eur: 500, client_amount: 500 })
      const infoRow   = makeRow({ id: 'info-ref', display_group: 'info', description: 'Tracking', amount_eur: 0, client_amount: 0 })

      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Villa Mazotos', [makeSection({ rows: [incomeRow, infoRow] })]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
      const rows = result.sections[0]?.rows ?? []

      expect(rows).toHaveLength(2)
      expect(rows[0].isReference).toBe(false)
      expect(rows[1].isReference).toBe(false)
    })
  })

  // ── Hardening: openingBalanceEur on sections ─────────────────────────────

  describe('openingBalanceEur on sections', () => {
    it('includes openingBalanceEur when section has non-zero opening_balance', async () => {
      const section = makeSection({
        account_type: 'rental',
        account_label: 'Rental',
        total_income: 3000,
        total_expenses: 500,
        closing_balance: 2800,
      })
      // Manually set opening_balance on the section
      ;(section as { opening_balance: number }).opening_balance = 300

      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Villa Mazotos', [section]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
      const rentalSection = result.sections.find(s => s.type === 'rental')

      expect(rentalSection).toBeDefined()
      expect(rentalSection!.openingBalanceEur).toBe('300')
    })

    it('omits openingBalanceEur when opening_balance is zero', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Villa Mazotos', [
          makeSection({ account_type: 'rental', account_label: 'Rental' }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Villa Mazotos'] })
      const rentalSection = result.sections.find(s => s.type === 'rental')

      expect(rentalSection).toBeDefined()
      expect(rentalSection!.openingBalanceEur).toBeUndefined()
    })
  })

  // ── Hardening: ownerDirection = 'internal' ───────────────────────────────

  describe('ownerDirection for internal_settled Purchase', () => {
    it('sets ownerDirection to internal for internal_settled Purchase', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Uriel Duplex', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 130000,
            total_income: 0,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Uriel Duplex'] })
      const purchaseSection = result.sections.find(s => s.type === 'purchase')

      expect(purchaseSection).toBeDefined()
      expect(purchaseSection!.ownerDirection).toBe('internal')
      expect(purchaseSection!.label).toBe('JJ Internal Acquisition — Settled')
    })

    it('sets ownerDirection to due_to_jj/due_to_you for non-internal Purchase', async () => {
      mockFetchRC3Report.mockResolvedValueOnce(
        makeReport('Some Property', [
          makeSection({
            account_type: 'purchase',
            account_label: 'Property Purchase',
            balance_convention: 'client_debt',
            closing_balance: 80000,
            total_income: 0,
          }),
        ]),
      )

      const result = await fetchOwnerFinancial({ properties: ['Some Property'] })
      const purchaseSection = result.sections.find(s => s.type === 'purchase')

      expect(purchaseSection).toBeDefined()
      // client_debt with positive closing → normalized = -80000 → due_to_jj
      expect(purchaseSection!.ownerDirection).toBe('due_to_jj')
      expect(purchaseSection!.label).toBe('Property Purchase')
    })
  })
})
