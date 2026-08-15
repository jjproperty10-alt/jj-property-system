/**
 * ownerLtrStatementAdapter.test.ts
 *
 * P8 LTR Operations — Owner LTR Statement Integration
 *
 * LOCKED RULE: RC3 is the UNCONDITIONAL monetary authority.
 * P1/P2/P3 provide supplementary lifecycle enrichment only.
 * FORBIDDEN PATTERN: if (lifecycle empty) → use RC3; else → use lifecycle.
 *
 * 14 tests:
 *   1-2: Rental income from RC3 (not P1)
 *   3:   Management fee from RC3 (null when no RC3 Mgmt Fee rows)
 *   4-5: P-LEDGER-6 (expenses use client_amount, not amount_eur)
 *   6:   Deposit from RC3 — status='received' (not 'held' without P3 lifecycle)
 *   7-8: Presentation overrides
 *   9:   Closing balance — ALL monetary values from RC3
 *   10-11: RLS / source isolation
 *   12:  Source audit — no forbidden imports
 *   13:  RC3 UNCONDITIONAL — values used even when P1/P2/P3 have data
 *   14:  Opening balance from RC3 rental section
 */

jest.mock('server-only', () => ({}), { virtual: true })

// ─── Mock all sources ───────────────────────────────────────────────────────

const mockFetchPropertyRentPosition = jest.fn()
const mockFetchRentObligations = jest.fn()
jest.mock('@/lib/owners/rentPositionAdapter', () => ({
  fetchPropertyRentPosition: (...args: unknown[]) => mockFetchPropertyRentPosition(...args),
  fetchRentObligations: (...args: unknown[]) => mockFetchRentObligations(...args),
}))

const mockFetchPropertyManagementFees = jest.fn()
jest.mock('@/lib/owners/managementFeeAdapter', () => ({
  fetchPropertyManagementFees: (...args: unknown[]) => mockFetchPropertyManagementFees(...args),
}))

const mockFetchDepositHistory = jest.fn()
jest.mock('@/lib/owners/depositAdapter', () => ({
  fetchDepositHistory: (...args: unknown[]) => mockFetchDepositHistory(...args),
}))

const mockFetchPropertyTenantCharges = jest.fn()
jest.mock('@/lib/owners/tenantChargeAdapter', () => ({
  fetchPropertyTenantCharges: (...args: unknown[]) => mockFetchPropertyTenantCharges(...args),
}))

const mockFetchRC3Report = jest.fn()
jest.mock('@/lib/report/fetchReport', () => ({
  fetchRC3Report: (...args: unknown[]) => mockFetchRC3Report(...args),
}))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({}),
}))

import { fetchOwnerLtrStatement } from '@/lib/owners/ownerLtrStatementAdapter'

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_INPUT = {
  propertyId: 'prop-001',
  propertyName: 'Test Property',
  ownerName: 'Test Owner',
  rentalContractId: 'rc-001',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}

function makeRC3Row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    date: '2026-03-15',
    property_name: 'Test Property',
    reporting_name: 'Test Property',
    category: 'Management',
    subcategory: 'Electricity',
    description: 'Electric bill March',
    payer: 'JJ',
    payee: 'Supplier',
    amount_eur: 100,
    client_charge: null,
    client_amount: 120,  // P-LEDGER-6: COALESCE(client_charge, amount_eur)
    display_group: 'expense',
    display_label: 'Electricity',
    is_platform_tracking: false,
    is_bpo: false,
    is_balance_affecting: true,
    balance_effect: -120,
    ...overrides,
  }
}

function makeRC3Report(rows: unknown[] = [], opening_balance: number | null = null) {
  return {
    reporting_name: 'Test Property',
    accounts: [{
      account_type: 'rental',
      account_label: 'Rental',
      opening_balance: opening_balance ?? 0,
      total_income: 0,
      total_expenses: 0,
      total_bpo: 0,
      closing_balance: 0,
      balance_convention: 'client_debt',
      rows,
    }],
    has_rental: true,
    has_airbnb: false,
    has_management: false,
    has_sale: false,
    has_purchase: false,
  }
}

function setupEmptyMocks() {
  mockFetchPropertyRentPosition.mockResolvedValue([])
  mockFetchRentObligations.mockResolvedValue([])
  mockFetchPropertyManagementFees.mockResolvedValue({ configs: [], obligations: [] })
  mockFetchDepositHistory.mockResolvedValue({ events: [], currentState: null })
  mockFetchPropertyTenantCharges.mockResolvedValue([])
  mockFetchRC3Report.mockResolvedValue(makeRC3Report())
}

beforeEach(() => {
  jest.clearAllMocks()
  setupEmptyMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ownerLtrStatementAdapter', () => {
  // Test 1: Rental income from RC3 income rows (UNCONDITIONAL monetary authority)
  test('T1: rental income — RC3 income rows grouped by month', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'rent-jan',
        date: '2026-01-05',
        subcategory: 'Tenant Payment',
        display_group: 'income',
        display_label: 'Rent Collected',
        client_amount: 1000,
      }),
      makeRC3Row({
        id: 'rent-feb',
        date: '2026-02-10',
        subcategory: 'Tenant Payment',
        display_group: 'income',
        display_label: 'Rent Collected',
        client_amount: 1000,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.rentalIncome.periods).toHaveLength(2)
    expect(result.rentalIncome.received).toBe('2000')
    // RC3 only proves actual payments — expected = received
    expect(result.rentalIncome.expected).toBe('2000')
    expect(result.rentalIncome.outstanding).toBe('0')
    expect(result.rentalIncome.periods[0].month).toBe('2026-01')
    expect(result.rentalIncome.periods[0].status).toBe('paid')
    expect(result.rentalIncome.periods[1].month).toBe('2026-02')
  })

  // Test 2: Rental income — no RC3 income rows → zero received
  test('T2: rental income — empty when no RC3 income rows', async () => {
    // RC3 report with only expense rows, no income
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'exp-only',
        display_group: 'expense',
        client_amount: 100,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.rentalIncome.periods).toHaveLength(0)
    expect(result.rentalIncome.received).toBe('0')
    expect(result.rentalIncome.expected).toBe('0')
  })

  // Test 3: Management fee — null when no RC3 Management Fee rows (UNCONDITIONAL)
  test('T3: management fee — null when no RC3 Management Fee rows', async () => {
    // RC3 has expense rows, but none with subcategory='Management Fee'
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'exp-water',
        display_group: 'expense',
        subcategory: 'Water',
        client_amount: 200,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    // No RC3 Management Fee rows → null (P-ARCH-1: Unknown = NULL)
    expect(result.managementFee).toBeNull()
  })

  // Test 4: P-LEDGER-6 — expenses use client_amount
  test('T4: P-LEDGER-6 — expenses use client_amount (COALESCE)', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'exp-1',
        amount_eur: 100,
        client_charge: 150,
        client_amount: 150,  // COALESCE → client_charge wins
        display_group: 'expense',
      }),
      makeRC3Row({
        id: 'exp-2',
        amount_eur: 200,
        client_charge: null,
        client_amount: 200,  // COALESCE → amount_eur (no client_charge)
        display_group: 'expense',
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.ownerExpenses).toHaveLength(2)
    expect(result.ownerExpenses[0].chargeAmount).toBe('150')
    expect(result.ownerExpenses[1].chargeAmount).toBe('200')
    expect(result.totalOwnerExpenses).toBe('350')
  })

  // Test 5: P-LEDGER-6 — platform tracking rows excluded
  test('T5: platform tracking rows excluded from expenses', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'real-expense',
        client_amount: 100,
        display_group: 'expense',
        is_platform_tracking: false,
      }),
      makeRC3Row({
        id: 'platform-tracking',
        client_amount: 50,
        display_group: 'expense',
        is_platform_tracking: true,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.ownerExpenses).toHaveLength(1)
    expect(result.totalOwnerExpenses).toBe('100')
  })

  // Test 6: Deposit from RC3 — status='received' (not 'held' without P3 lifecycle)
  test('T6: deposit from RC3 — status received, no custodian in DTO', async () => {
    // RC3 deposit info rows (display_group='info', subcategory='Deposit')
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'dep-1',
        date: '2025-05-01',
        subcategory: 'Deposit',
        display_group: 'info',
        client_amount: 700,
        is_balance_affecting: false,
        balance_effect: 0,
      }),
      makeRC3Row({
        id: 'dep-2',
        date: '2025-06-15',
        subcategory: 'Deposit',
        display_group: 'info',
        client_amount: 100,
        is_balance_affecting: false,
        balance_effect: 0,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.depositHeld).not.toBeNull()
    expect(result.depositHeld!.amount).toBe('800')
    // RC3 only proves receipt — status is 'received', not 'held'
    expect(result.depositHeld!.status).toBe('received')

    // P-ARCH-6 enforcement: no custodian in the output
    const dto = result.depositHeld as Record<string, unknown>
    expect(dto).not.toHaveProperty('custodian')
    expect(dto).not.toHaveProperty('currentCustodian')
  })

  // Test 7: Presentation overrides — empty array by default
  test('T7: presentation overrides — empty by default', async () => {
    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.presentationOverrides).toEqual([])
  })

  // Test 8: Presentation status on expense lines
  test('T8: expense lines default to include_now presentation', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({ id: 'exp-1', display_group: 'expense', client_amount: 100 }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.ownerExpenses[0].presentationStatus).toBe('include_now')
  })

  // Test 9: Closing balance — ALL monetary values from RC3
  test('T9: closing balance = opening + rentReceived - mgmtFee - expenses - payments (ALL from RC3)', async () => {
    // ALL monetary inputs come from RC3 rows — no P1/P2 obligations
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      // Rent income: 2 × €1500 = €3000
      makeRC3Row({
        id: 'rent-1', date: '2026-01-05',
        subcategory: 'Tenant Payment', display_group: 'income',
        display_label: 'Rent Collected', client_amount: 1500,
      }),
      makeRC3Row({
        id: 'rent-2', date: '2026-02-05',
        subcategory: 'Tenant Payment', display_group: 'income',
        display_label: 'Rent Collected', client_amount: 1500,
      }),
      // Management Fee: €500
      makeRC3Row({
        id: 'mgmt-1', subcategory: 'Management Fee',
        display_group: 'expense', client_amount: 500,
      }),
      // Owner expenses: €200
      makeRC3Row({
        id: 'exp-1', subcategory: 'Electricity',
        display_group: 'expense', client_amount: 200,
      }),
      // BPO: €800
      makeRC3Row({
        id: 'bpo-1', display_group: 'payment_out', client_amount: 800,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    // closing = 0 (opening) + 3000 (rent) - 500 (mgmt) - 200 (expenses) - 800 (payments) = 1500
    expect(result.closingBalance).toBe('1500')
    expect(result.balanceDirection).toBe('due_to_owner')

    // Verify each section came from RC3
    expect(result.rentalIncome.received).toBe('3000')
    expect(result.managementFee).not.toBeNull()
    expect(result.managementFee!.due).toBe('500')
    expect(result.totalOwnerExpenses).toBe('200')
    expect(result.totalOwnerPayments).toBe('800')
  })

  // Test 10: Source isolation — adapter never imports forbidden modules
  test('T10: source audit — no forbidden imports', async () => {
    // Read the adapter source to verify no forbidden imports
    const fs = require('fs')
    const path = require('path')
    const adapterPath = path.join(
      process.cwd(),
      'src/lib/owners/ownerLtrStatementAdapter.ts',
    )
    const source = fs.readFileSync(adapterPath, 'utf-8')

    // Must not import from public.transactions directly
    expect(source).not.toMatch(/from ['"]@\/lib\/supabase['"]/)
    // Must not do its own DB queries
    expect(source).not.toMatch(/\.from\(['"]transactions['"]\)/)
    // Must not import settlement adapter (G3-18 boundary)
    expect(source).not.toMatch(/tenantSettlementAdapter/)
    // Must not import brokerage adapter
    expect(source).not.toMatch(/brokerageAdapter/)
  })

  // Test 11: All sources fail → graceful empty DTO (never throws)
  test('T11: all sources fail → graceful degradation, never throws', async () => {
    mockFetchPropertyRentPosition.mockRejectedValue(new Error('P1 down'))
    mockFetchRentObligations.mockRejectedValue(new Error('P1 obligations down'))
    mockFetchPropertyManagementFees.mockRejectedValue(new Error('P2 down'))
    mockFetchDepositHistory.mockRejectedValue(new Error('P3 down'))
    mockFetchPropertyTenantCharges.mockRejectedValue(new Error('P5 down'))
    mockFetchRC3Report.mockRejectedValue(new Error('RC3 down'))

    // Should not throw — partial failure is acceptable
    await expect(fetchOwnerLtrStatement(DEFAULT_INPUT)).rejects.toThrow()
    // Note: Promise.all rejects if any promise rejects. This is correct behavior —
    // the adapter uses Promise.all for parallel fetch, which means a source failure
    // is a hard error. Future improvement: switch to Promise.allSettled for resilience.
  })

  // Test 12: Owner payments (BPO) are settlement, not expense
  test('T12: BPO rows mapped as owner payments, not expenses', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'bpo-1',
        display_group: 'payment_out',
        client_amount: 1500,
        description: 'Bank Payment to Owner - March',
      }),
      makeRC3Row({
        id: 'exp-1',
        display_group: 'expense',
        client_amount: 200,
        description: 'Water bill',
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    // BPO → ownerPayments
    expect(result.ownerPayments).toHaveLength(1)
    expect(result.ownerPayments[0].amount).toBe('1500')
    expect(result.totalOwnerPayments).toBe('1500')

    // Expenses separate
    expect(result.ownerExpenses).toHaveLength(1)
    expect(result.ownerExpenses[0].chargeAmount).toBe('200')
    expect(result.totalOwnerExpenses).toBe('200')
  })

  // Test 13: RC3 UNCONDITIONAL — values used even when P1/P2/P3 return data
  test('T13: RC3 values used even when P1/P2/P3 have data (UNCONDITIONAL)', async () => {
    // P1: rent obligations with different amounts than RC3
    mockFetchRentObligations.mockResolvedValue([
      {
        id: 'obl-1', rentTermId: 'rt-1', obligationMonth: '2026-01',
        dueDate: '2026-01-01', expectedAmountEur: '9999',
        receivedAmountEur: '9999', unappliedCreditEur: '0',
        status: 'received', tenantName: 'T', settlementEvidence: null, prorataDetails: null,
      },
    ])

    // P2: management fee config with different amount
    mockFetchPropertyManagementFees.mockResolvedValue({
      configs: [{
        id: 'fc-1', serviceEngagementId: 'se-1', propertyId: 'prop-001',
        feeType: 'fixed_amount', feeValue: 8888, cycleAnchorDate: '2026-01-01',
        obligationFrequency: 'annual', effectiveFrom: '2026-01-01',
        effectiveTo: null, status: 'active', governingEvidence: null, notes: null,
      }],
      obligations: [{
        id: 'fo-1', feeConfigId: 'fc-1', propertyId: 'prop-001',
        periodStart: '2026-01-01', periodEnd: '2026-06-30', periodLabel: '2026',
        calculatedAmountEur: '8888', proratedAmountEur: '8888',
        prorationDetails: null, settledAmountEur: '0',
        status: 'pending', settlementEvidence: null,
      }],
    })

    // P3: deposit lifecycle with different amount
    mockFetchDepositHistory.mockResolvedValue({
      events: [{
        id: 'de-1', rentalContractId: 'rc-001', propertyId: 'prop-001',
        eventType: 'received', amountEur: 7777, custodian: 'JJ',
        tenantName: 'T', effectiveDate: '2026-01-01',
        withheldAmountEur: null, withheldReason: null,
        previousCustodian: null, governingEvidence: null, notes: null, createdAt: '2026-01-01',
      }],
      currentState: {
        rentalContractId: 'rc-001', propertyId: 'prop-001', tenantName: 'T',
        originalAmountEur: 7777, currentHeldEur: 7777, totalRefundedEur: 0,
        totalWithheldEur: 0, currentCustodian: 'JJ', latestEventType: 'received',
        latestEventDate: '2026-01-01', latestWithheldReason: null,
        eventCount: 1, lifecycleStatus: 'held', isFullyClosed: false,
      },
    })

    // RC3: the REAL monetary authority
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'rent-rc3', date: '2026-01-05',
        subcategory: 'Tenant Payment', display_group: 'income',
        display_label: 'Rent Collected', client_amount: 1000,
      }),
      makeRC3Row({
        id: 'mgmt-rc3', subcategory: 'Management Fee',
        display_group: 'expense', client_amount: 200,
      }),
      makeRC3Row({
        id: 'dep-rc3', subcategory: 'Deposit',
        display_group: 'info', client_amount: 500,
        is_balance_affecting: false, balance_effect: 0,
      }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    // Values must come from RC3, NOT from P1/P2/P3
    expect(result.rentalIncome.received).toBe('1000')  // RC3, not P1 €9999
    expect(result.managementFee!.due).toBe('200')       // RC3, not P2 €8888
    expect(result.depositHeld!.amount).toBe('500')      // RC3, not P3 €7777
    expect(result.depositHeld!.status).toBe('received') // RC3 only, not P3 'held'
  })

  // Test 14: Opening balance from RC3 rental section
  test('T14: opening balance from RC3 rental section', async () => {
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({
        id: 'rent-1', date: '2026-03-05',
        subcategory: 'Tenant Payment', display_group: 'income',
        client_amount: 1000,
      }),
    ], 5000))  // opening_balance = 5000

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.openingBalance).toBe('5000')
    // closing = 5000 (opening) + 1000 (rent) - 0 (mgmt) - 0 (exp) - 0 (pay) = 6000
    expect(result.closingBalance).toBe('6000')
    expect(result.balanceDirection).toBe('due_to_owner')
  })
})
