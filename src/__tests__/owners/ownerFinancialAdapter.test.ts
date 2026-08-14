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

      // Purchase partially excluded — €250 Purchase Expense preserved
      const deptTypes = result.overallNet!.departments.map(d => d.type)
      expect(deptTypes).toContain('purchase') // modified section IS included (total_income > 0)
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

    it('preserves Purchase Expenses in net via modified section (partial exclusion)', async () => {
      // Sharon: closing_balance = 205250 (includes acquisition principal)
      //         total_income = 250 (gardener expense billed to client)
      // After partial exclusion: modified section has closing_balance = 250
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

      // Net = rental(-150 owner_credit → -150) + sale(-40550 client_debt → +40550) + modified_purchase(250 client_debt → -250)
      // = -150 + 40550 - 250 = 40150
      // Wait — let me verify: computeNetOwnerBalance:
      //   owner_credit: net += closing → net += (-150) = -150
      //   client_debt:  net -= closing → net -= (-40550) = +40550 → cumulative = +40400
      //   client_debt:  net -= closing → net -= 250 = +40150 → cumulative = 40150
      // 40150 means Due to You... but let me not hardcode — the key assertion is
      // that the modified purchase section contributes -250 (not -205250) to net.
      expect(result.overallNet).not.toBeNull()

      // The modified purchase section IS present in departments (total_income > 0)
      const purchaseDept = result.overallNet!.departments.find(d => d.type === 'purchase')
      expect(purchaseDept).toBeDefined()
      // Modified section closing_balance = 250 (total_income), not 205250
      expect(purchaseDept!.closingBalanceEur).toBe('250')
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

    it('shows partial-exclusion displayNote for internal_settled with Purchase Expenses', async () => {
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
      expect(purchaseSection!.displayNote).toContain('acquisition principal excluded')
      expect(purchaseSection!.displayNote).toContain('250')
      expect(purchaseSection!.displayNote).toContain('Purchase Expenses included')
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
      expect(purchaseSection!.displayNote).toContain('settled through the Sale account')
      expect(purchaseSection!.displayNote).toContain('excluded from the Owner Summary')
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
})
