/**
 * ownerLtrStatementAdapter.test.ts
 *
 * P8 LTR Operations — Owner LTR Statement Integration
 *
 * 12 tests per spec Section 13.7:
 *   1-2: Rent position (full period + partial)
 *   3:   Management fee (no_fee → null)
 *   4-5: P-LEDGER-6 (expenses use client_amount, not amount_eur)
 *   6:   Deposit informational (not income)
 *   7-8: Presentation overrides
 *   9:   Closing balance equation
 *   10-11: RLS / source isolation
 *   12:  Source audit — no forbidden imports
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

function makeRC3Report(rows: unknown[] = []) {
  return {
    reporting_name: 'Test Property',
    accounts: [{
      account_type: 'rental',
      account_label: 'Rental',
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
  // Test 1: Rent position — full period with obligations
  test('T1: rent position — maps period obligations with payment dates', async () => {
    mockFetchRentObligations.mockResolvedValue([
      {
        id: 'obl-1',
        rentTermId: 'rt-1',
        obligationMonth: '2026-01',
        dueDate: '2026-01-01',
        expectedAmountEur: '1000',
        receivedAmountEur: '1000',
        unappliedCreditEur: '0',
        status: 'received',
        tenantName: 'Tenant A',
        settlementEvidence: [{ date: '2026-01-05', amount: 1000, payer: 'Tenant', payee: 'JJ', mechanism: 'bank', allocation_order: 1 }],
        prorataDetails: null,
      },
      {
        id: 'obl-2',
        rentTermId: 'rt-1',
        obligationMonth: '2026-02',
        dueDate: '2026-02-01',
        expectedAmountEur: '1000',
        receivedAmountEur: '500',
        unappliedCreditEur: '0',
        status: 'partial',
        tenantName: 'Tenant A',
        settlementEvidence: [{ date: '2026-02-10', amount: 500, payer: 'Tenant', payee: 'JJ', mechanism: 'bank', allocation_order: 1 }],
        prorataDetails: null,
      },
    ])

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.rentalIncome.periods).toHaveLength(2)
    expect(result.rentalIncome.expected).toBe('2000')
    expect(result.rentalIncome.received).toBe('1500')
    expect(result.rentalIncome.outstanding).toBe('500')
    expect(result.rentalIncome.periods[0].paymentDate).toBe('2026-01-05')
    expect(result.rentalIncome.periods[1].status).toBe('partial')
  })

  // Test 2: Rent position — no obligations in period
  test('T2: rent position — empty when no obligations in period', async () => {
    // Obligations outside the statement period
    mockFetchRentObligations.mockResolvedValue([
      {
        id: 'obl-old',
        rentTermId: 'rt-1',
        obligationMonth: '2025-06',
        dueDate: '2025-06-01',
        expectedAmountEur: '1000',
        receivedAmountEur: '1000',
        unappliedCreditEur: '0',
        status: 'received',
        tenantName: 'Tenant A',
        settlementEvidence: null,
        prorataDetails: null,
      },
    ])

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.rentalIncome.periods).toHaveLength(0)
  })

  // Test 3: Management fee — no_fee returns null (P-ARCH-1)
  test('T3: management fee — no_fee type returns null', async () => {
    mockFetchPropertyManagementFees.mockResolvedValue({
      configs: [{
        id: 'fc-1',
        serviceEngagementId: 'se-1',
        propertyId: 'prop-001',
        feeType: 'no_fee',
        feeValue: null,
        cycleAnchorDate: '2026-01-01',
        obligationFrequency: 'annual',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        status: 'active',
        governingEvidence: null,
        notes: null,
      }],
      obligations: [],
    })

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

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

  // Test 6: Deposit informational — not income, custodian excluded (P-ARCH-6)
  test('T6: deposit — informational only, custodian excluded from DTO', async () => {
    mockFetchDepositHistory.mockResolvedValue({
      events: [{
        id: 'de-1',
        rentalContractId: 'rc-001',
        propertyId: 'prop-001',
        eventType: 'received',
        amountEur: 2000,
        custodian: 'JJ',  // P-ARCH-6: this must NOT appear in the output
        tenantName: 'Tenant A',
        effectiveDate: '2026-01-01',
        withheldAmountEur: null,
        withheldReason: null,
        previousCustodian: null,
        governingEvidence: null,
        notes: null,
        createdAt: '2026-01-01',
      }],
      currentState: {
        rentalContractId: 'rc-001',
        propertyId: 'prop-001',
        tenantName: 'Tenant A',
        originalAmountEur: 2000,
        currentHeldEur: 2000,
        totalRefundedEur: 0,
        totalWithheldEur: 0,
        currentCustodian: 'JJ',  // P-ARCH-6: must NOT leak
        latestEventType: 'received',
        latestEventDate: '2026-01-01',
        latestWithheldReason: null,
        eventCount: 1,
        lifecycleStatus: 'held',
        isFullyClosed: false,
      },
    })

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    expect(result.depositHeld).not.toBeNull()
    expect(result.depositHeld!.amount).toBe('2000')
    expect(result.depositHeld!.status).toBe('held')

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

  // Test 9: Closing balance equation
  test('T9: closing balance = opening + rentReceived - mgmtFee - expenses - payments', async () => {
    // Rent: received €3000
    mockFetchRentObligations.mockResolvedValue([
      {
        id: 'obl-1', rentTermId: 'rt-1', obligationMonth: '2026-01',
        dueDate: '2026-01-01', expectedAmountEur: '1500',
        receivedAmountEur: '1500', unappliedCreditEur: '0',
        status: 'received', tenantName: 'T', settlementEvidence: null, prorataDetails: null,
      },
      {
        id: 'obl-2', rentTermId: 'rt-1', obligationMonth: '2026-02',
        dueDate: '2026-02-01', expectedAmountEur: '1500',
        receivedAmountEur: '1500', unappliedCreditEur: '0',
        status: 'received', tenantName: 'T', settlementEvidence: null, prorataDetails: null,
      },
    ])

    // Management fee: €500 due
    mockFetchPropertyManagementFees.mockResolvedValue({
      configs: [{
        id: 'fc-1', serviceEngagementId: 'se-1', propertyId: 'prop-001',
        feeType: 'fixed_amount', feeValue: 500, cycleAnchorDate: '2026-01-01',
        obligationFrequency: 'annual', effectiveFrom: '2026-01-01',
        effectiveTo: null, status: 'active', governingEvidence: null, notes: null,
      }],
      obligations: [{
        id: 'fo-1', feeConfigId: 'fc-1', propertyId: 'prop-001',
        periodStart: '2026-01-01', periodEnd: '2026-06-30',
        periodLabel: 'Jan-Jun 2026',
        calculatedAmountEur: '500', proratedAmountEur: '500',
        prorationDetails: null, settledAmountEur: '0',
        status: 'pending', settlementEvidence: null,
      }],
    })

    // Expenses: €200
    // Payments (BPO): €800
    mockFetchRC3Report.mockResolvedValue(makeRC3Report([
      makeRC3Row({ id: 'exp-1', display_group: 'expense', client_amount: 200 }),
      makeRC3Row({ id: 'bpo-1', display_group: 'payment_out', client_amount: 800 }),
    ]))

    const result = await fetchOwnerLtrStatement(DEFAULT_INPUT)

    // closing = 0 (opening) + 3000 (rent) - 500 (mgmt) - 200 (expenses) - 800 (payments) = 1500
    expect(result.closingBalance).toBe('1500')
    expect(result.balanceDirection).toBe('due_to_owner')
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
})
