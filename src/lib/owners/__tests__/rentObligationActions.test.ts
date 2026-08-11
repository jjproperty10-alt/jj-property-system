/**
 * @module rentObligationActions.test
 * @description P1 LTR Operations — Rent Terms + Expected Rent + FIFO Allocator tests.
 *
 * 39 focused tests covering:
 * - Create rent term validation (5)
 * - Generate obligations validation (3)
 * - Allocate rent payment validation (6)
 * - Reverse allocation validation (3)
 * - Auth boundary (4)
 * - Adapter: position mapper (5)
 * - Adapter: obligation mapper (4)
 * - Adapter: term mapper (3)
 * - Adapter: error/empty fallback (3)
 * - Invariants: FIFO + settlement evidence (3)
 *
 * Architecture:
 * - Mocks: server-only, statementAuthService, supabase, validation
 * - Pure unit tests — no DB, no network
 * - Three-authority separation preserved:
 *     Service Engagement ≠ Rental Contract ≠ Tenant Payment
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock server-only (no-op in test environment)
jest.mock('server-only', () => ({}), { virtual: true })

// Mock auth
const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

// Mock supabase client — supports schema().rpc() and schema().from().select().eq().order()
const mockSchemaRpc = jest.fn()
const mockOrder = jest.fn()
const mockEq = jest.fn()
const mockSelect = jest.fn()
const mockFrom = jest.fn()
const mockSupabaseClient = {
  schema: jest.fn(() => ({
    rpc: mockSchemaRpc,
    from: mockFrom,
  })),
}

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockSupabaseClient,
}))

// Mock validation
jest.mock('@/lib/owners/validation', () => ({
  isValidUUID: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}))

// Import after mocks
import {
  createRentTermAction,
  generateRentObligationsAction,
  allocateRentPaymentAction,
  reverseRentAllocationAction,
} from '../rentObligationActions'

import {
  fetchPropertyRentPosition,
  fetchRentObligations,
  fetchRentTermHistory,
} from '../rentPositionAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = 'dddddddd-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_TERM_ID = 'eeeeeeee-1111-2222-3333-444444444444'
const VALID_OBLIGATION_ID = 'ffffffff-1111-2222-3333-444444444444'
const VALID_TX_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const AUTH_USER_ID = '277f81e0-3b89-41ed-a099-22585959b77a'

function authedOk() {
  return { ok: true as const, userId: AUTH_USER_ID }
}

function authedFail() {
  return { ok: false as const, error: 'NO_SESSION' }
}

// ─── Position Row fixture (matches RentPositionRow in adapter) ────────────────

const POSITION_ROW = {
  rental_contract_id: VALID_CONTRACT_ID,
  property_id: VALID_PROPERTY_ID,
  tenant_name: 'Maria Georgiou',
  contract_start: '2026-01-01',
  contract_end: null,
  contract_status: 'active',
  current_monthly_rent: 800,
  total_obligations: 8,
  received_count: 6,
  outstanding_count: 2,
  overdue_count: 1,
  total_expected_eur: 6400,
  total_received_eur: 4800,
  outstanding_eur: 1600,
  latest_obligation_month: '2026-08-01',
  received_by_jj_eur: 3200,
  received_by_jacob_eur: 800,
  received_by_yossi_eur: 800,
  received_by_anastasia_eur: 0,
}

// ─── Obligation Row fixture (matches RentObligationRow in adapter) ────────────

const OBLIGATION_ROW = {
  id: VALID_OBLIGATION_ID,
  rent_term_id: VALID_TERM_ID,
  prorata_details: null,
  obligation_month: '2026-08-01',
  due_date: '2026-08-01',
  expected_amount_eur: 800,
  received_amount_eur: 0,
  unapplied_credit_eur: 0,
  status: 'due',
  tenant_name: 'Maria Georgiou',
  settlement_evidence: null,
}

// ─── Term Row fixture (matches RentTermRow in adapter) ────────────────────────

const TERM_ROW = {
  id: VALID_TERM_ID,
  rental_contract_id: VALID_CONTRACT_ID,
  monthly_rent_eur: 800,
  effective_from: '2026-01-01',
  effective_to: null,
  reason: 'initial',
  governing_evidence: null,
}

// ─── RPC return fixture for createRentTermAction ─────────────────────────────

const CREATED_TERM_ROW = {
  id: VALID_TERM_ID,
  rental_contract_id: VALID_CONTRACT_ID,
  monthly_rent_eur: 800,
  effective_from: '2026-01-01',
  effective_to: null,
  reason: 'initial',
  governing_evidence: null,
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockReturnValue(authedOk())
  mockSchemaRpc.mockResolvedValue({ data: CREATED_TERM_ROW, error: null })

  // Chain for adapter queries: from().select().eq().order()
  mockOrder.mockResolvedValue({ data: [], error: null })
  mockEq.mockReturnValue({ order: mockOrder })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ select: mockSelect })
})

// ═════════════════════════════════════════════════════════════════════════════
// Auth boundary (4 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Auth boundary', () => {
  it('rejects createRentTerm when unauthenticated', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await createRentTermAction(VALID_CONTRACT_ID, 800, '2026-01-01', 'initial')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/sign/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects generateObligations when unauthenticated', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await generateRentObligationsAction(VALID_CONTRACT_ID, '2026-12')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/sign/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects allocatePayment when unauthenticated', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await allocateRentPaymentAction(
      VALID_PROPERTY_ID, VALID_TX_ID, 'JJ', 'JJ', 800, '2026-08-15',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/sign/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects reverseAllocation when unauthenticated', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await reverseRentAllocationAction(VALID_TX_ID, VALID_PROPERTY_ID, 'Error correction')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/sign/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Create rent term validation (5 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Create rent term validation', () => {
  it('rejects invalid contract UUID', async () => {
    const result = await createRentTermAction('not-a-uuid', 800, '2026-01-01', 'initial')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/contract/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects negative monthly rent', async () => {
    const result = await createRentTermAction(VALID_CONTRACT_ID, -100, '2026-01-01', 'initial')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/rent/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('accepts zero monthly rent (valid — free period)', async () => {
    // monthlyRentEur < 0 is rejected; 0 is allowed per the implementation
    const result = await createRentTermAction(VALID_CONTRACT_ID, 0, '2026-01-01', 'correction')
    expect(result.ok).toBe(true)
    expect(mockSchemaRpc).toHaveBeenCalled()
  })

  it('rejects empty effectiveFrom date', async () => {
    const result = await createRentTermAction(VALID_CONTRACT_ID, 800, '', 'initial')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/date/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects invalid reason value', async () => {
    const result = await createRentTermAction(VALID_CONTRACT_ID, 800, '2026-01-01', 'random_reason')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/reason/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Generate obligations validation (3 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Generate obligations validation', () => {
  it('rejects invalid contract UUID', async () => {
    const result = await generateRentObligationsAction('bad', '2026-12')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/contract/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects invalid month format', async () => {
    const result = await generateRentObligationsAction(VALID_CONTRACT_ID, '2026-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/month/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('passes valid input to RPC with date conversion', async () => {
    mockSchemaRpc.mockResolvedValue({ data: 3, error: null })
    const result = await generateRentObligationsAction(VALID_CONTRACT_ID, '2026-12')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.count).toBe(3)
    // The code converts YYYY-MM to last day of month via new Date(year, month, 0).toISOString()
    // Compute expected the same way to avoid timezone-dependent failures
    const expectedDate = new Date(2026, 12, 0).toISOString().split('T')[0]
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'generate_rent_obligations',
      expect.objectContaining({
        p_rental_contract_id: VALID_CONTRACT_ID,
        p_through_month: expectedDate,
      }),
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Allocate rent payment validation (6 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Allocate rent payment validation', () => {
  it('rejects invalid property UUID', async () => {
    const result = await allocateRentPaymentAction(
      'bad', VALID_TX_ID, 'JJ', 'JJ', 800, '2026-08-15',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/property/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects invalid source transaction UUID', async () => {
    const result = await allocateRentPaymentAction(
      VALID_PROPERTY_ID, 'bad', 'JJ', 'JJ', 800, '2026-08-15',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/transaction/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects zero amount', async () => {
    const result = await allocateRentPaymentAction(
      VALID_PROPERTY_ID, VALID_TX_ID, 'JJ', 'JJ', 0, '2026-08-15',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/amount/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects invalid payer value', async () => {
    const result = await allocateRentPaymentAction(
      VALID_PROPERTY_ID, VALID_TX_ID, 'UnknownPerson', 'JJ', 800, '2026-08-15',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/payer/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects invalid payee value', async () => {
    const result = await allocateRentPaymentAction(
      VALID_PROPERTY_ID, VALID_TX_ID, 'JJ', 'SomeoneElse', 800, '2026-08-15',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/payee/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects empty payment date', async () => {
    const result = await allocateRentPaymentAction(
      VALID_PROPERTY_ID, VALID_TX_ID, 'JJ', 'JJ', 800, '',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/date/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Reverse allocation validation (3 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Reverse allocation validation', () => {
  it('rejects invalid source transaction UUID', async () => {
    const result = await reverseRentAllocationAction('not-uuid', VALID_PROPERTY_ID, 'Error correction')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/transaction/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects empty reason', async () => {
    const result = await reverseRentAllocationAction(VALID_TX_ID, VALID_PROPERTY_ID, '   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/reason/i)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('passes valid input to RPC', async () => {
    mockSchemaRpc.mockResolvedValue({ data: { reversed: true }, error: null })
    const result = await reverseRentAllocationAction(VALID_TX_ID, VALID_PROPERTY_ID, 'Error correction')
    expect(result.ok).toBe(true)
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'reverse_rent_allocation',
      expect.objectContaining({
        p_source_tx_id: VALID_TX_ID,
        p_property_id: VALID_PROPERTY_ID,
        p_reason: 'Error correction',
        p_created_by: AUTH_USER_ID,
      }),
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Adapter: position mapper (5 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Adapter: position mapper', () => {
  it('maps position row to DTO with correct field names', async () => {
    mockSchemaRpc.mockResolvedValue({ data: [POSITION_ROW], error: null })
    const result = await fetchPropertyRentPosition(VALID_PROPERTY_ID)
    expect(result).toHaveLength(1)
    const pos = result[0]
    expect(pos.rentalContractId).toBe(VALID_CONTRACT_ID)
    expect(pos.propertyId).toBe(VALID_PROPERTY_ID)
    expect(pos.tenantName).toBe('Maria Georgiou')
    expect(pos.contractStatus).toBe('active')
  })

  it('converts numeric fields to proper types', async () => {
    mockSchemaRpc.mockResolvedValue({ data: [POSITION_ROW], error: null })
    const [pos] = await fetchPropertyRentPosition(VALID_PROPERTY_ID)
    expect(pos.currentMonthlyRent).toBe(800)
    expect(pos.totalObligations).toBe(8)
    expect(pos.receivedCount).toBe(6)
    expect(pos.outstandingCount).toBe(2)
    expect(pos.overdueCount).toBe(1)
  })

  it('formats money fields as strings', async () => {
    mockSchemaRpc.mockResolvedValue({ data: [POSITION_ROW], error: null })
    const [pos] = await fetchPropertyRentPosition(VALID_PROPERTY_ID)
    expect(typeof pos.totalExpectedEur).toBe('string')
    expect(typeof pos.totalReceivedEur).toBe('string')
    expect(typeof pos.outstandingEur).toBe('string')
    expect(typeof pos.receivedByJjEur).toBe('string')
  })

  it('handles null currentMonthlyRent (P-ARCH-1)', async () => {
    const row = { ...POSITION_ROW, current_monthly_rent: null }
    mockSchemaRpc.mockResolvedValue({ data: [row], error: null })
    const [pos] = await fetchPropertyRentPosition(VALID_PROPERTY_ID)
    expect(pos.currentMonthlyRent).toBeNull()
  })

  it('filters out rows with invalid contract_status', async () => {
    const badRow = { ...POSITION_ROW, contract_status: 'bogus' }
    mockSchemaRpc.mockResolvedValue({ data: [badRow], error: null })
    const result = await fetchPropertyRentPosition(VALID_PROPERTY_ID)
    expect(result).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Adapter: obligation mapper (4 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Adapter: obligation mapper', () => {
  beforeEach(() => {
    mockOrder.mockResolvedValue({ data: [OBLIGATION_ROW], error: null })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('maps obligation row to DTO with correct field names', async () => {
    const result = await fetchRentObligations(VALID_CONTRACT_ID)
    expect(result).toHaveLength(1)
    const obl = result[0]
    expect(obl.id).toBe(VALID_OBLIGATION_ID)
    expect(obl.rentTermId).toBe(VALID_TERM_ID)
    expect(obl.obligationMonth).toBe('2026-08-01')
    expect(obl.status).toBe('due')
    expect(obl.tenantName).toBe('Maria Georgiou')
  })

  it('formats money fields as strings', async () => {
    const result = await fetchRentObligations(VALID_CONTRACT_ID)
    const obl = result[0]
    expect(typeof obl.expectedAmountEur).toBe('string')
    expect(typeof obl.receivedAmountEur).toBe('string')
    expect(typeof obl.unappliedCreditEur).toBe('string')
  })

  it('parses prorata details when present', async () => {
    const rowWithProrata = {
      ...OBLIGATION_ROW,
      prorata_details: [
        { rent_term_id: VALID_TERM_ID, monthly_rent_eur: 800, segment_start: '2026-08-01', segment_end: '2026-08-15', segment_days: 15, segment_amount_eur: 387.10 },
        { rent_term_id: 'cccccccc-9999-2222-3333-444444444444', monthly_rent_eur: 900, segment_start: '2026-08-16', segment_end: '2026-08-31', segment_days: 16, segment_amount_eur: 464.52 },
      ],
    }
    mockOrder.mockResolvedValue({ data: [rowWithProrata], error: null })
    const [obl] = await fetchRentObligations(VALID_CONTRACT_ID)
    expect(obl.prorataDetails).not.toBeNull()
    expect(obl.prorataDetails).toHaveLength(2)
    expect(obl.prorataDetails![0].segmentDays).toBe(15)
    expect(obl.prorataDetails![1].monthlyRentEur).toBe(900)
  })

  it('filters out rows with invalid status', async () => {
    const badRow = { ...OBLIGATION_ROW, status: 'invalid_status' }
    mockOrder.mockResolvedValue({ data: [badRow], error: null })
    const result = await fetchRentObligations(VALID_CONTRACT_ID)
    expect(result).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Adapter: term mapper (3 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Adapter: term mapper', () => {
  beforeEach(() => {
    mockOrder.mockResolvedValue({ data: [TERM_ROW], error: null })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('maps term row to DTO with correct types', async () => {
    const result = await fetchRentTermHistory(VALID_CONTRACT_ID)
    expect(result).toHaveLength(1)
    const term = result[0]
    expect(term.id).toBe(VALID_TERM_ID)
    expect(term.rentalContractId).toBe(VALID_CONTRACT_ID)
    expect(term.monthlyRentEur).toBe(800)
    expect(term.effectiveFrom).toBe('2026-01-01')
    expect(term.effectiveTo).toBeNull()
    expect(term.reason).toBe('initial')
    expect(term.governingEvidence).toBeNull()
  })

  it('handles all valid reason values', async () => {
    const reasons = ['initial', 'annual_increase', 'renegotiation', 'correction', 'market_adjustment']
    for (const reason of reasons) {
      const row = { ...TERM_ROW, reason }
      mockOrder.mockResolvedValue({ data: [row], error: null })
      const result = await fetchRentTermHistory(VALID_CONTRACT_ID)
      expect(result).toHaveLength(1)
      expect(result[0].reason).toBe(reason)
    }
  })

  it('filters out rows with invalid reason', async () => {
    const badRow = { ...TERM_ROW, reason: 'unknown_reason' }
    mockOrder.mockResolvedValue({ data: [badRow], error: null })
    const result = await fetchRentTermHistory(VALID_CONTRACT_ID)
    expect(result).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Adapter: error/empty fallback (3 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Adapter: error/empty fallback', () => {
  it('returns empty array when position RPC returns error', async () => {
    mockSchemaRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const result = await fetchPropertyRentPosition(VALID_PROPERTY_ID)
    expect(result).toEqual([])
  })

  it('returns empty array when obligations query returns null data', async () => {
    mockOrder.mockResolvedValue({ data: null, error: null })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    const result = await fetchRentObligations(VALID_CONTRACT_ID)
    expect(result).toEqual([])
  })

  it('returns empty array when terms query returns error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Query failed' } })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })
    const result = await fetchRentTermHistory(VALID_CONTRACT_ID)
    expect(result).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Invariants: FIFO + settlement evidence (3 tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Invariants: FIFO + settlement evidence', () => {
  it('settlement evidence preserves payer identity (P-ARCH-2)', async () => {
    const rowWithEvidence = {
      ...OBLIGATION_ROW,
      status: 'received',
      received_amount_eur: 800,
      settlement_evidence: [
        { source_transaction_id: VALID_TX_ID, payer: 'Yossi', payee: 'JJ', amount: 800, date: '2026-08-15', mechanism: 'bank_transfer', allocation_order: 1 },
      ],
    }
    mockOrder.mockResolvedValue({ data: [rowWithEvidence], error: null })
    mockEq.mockReturnValue({ order: mockOrder })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const [obl] = await fetchRentObligations(VALID_CONTRACT_ID)
    expect(obl.settlementEvidence).not.toBeNull()
    expect(obl.settlementEvidence![0].payer).toBe('Yossi')
    expect(obl.settlementEvidence![0].payee).toBe('JJ')
    expect(obl.settlementEvidence![0].source_transaction_id).toBe(VALID_TX_ID)
    // P-ARCH-2: Yossi ≠ Jacob ≠ JJ — identity preserved in evidence
  })

  it('allocate passes payer/payee identity to RPC unchanged (P-ARCH-2)', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        allocations: [{ obligation_id: VALID_OBLIGATION_ID, obligation_month: '2026-08-01', allocated: 800, new_status: 'received' }],
        total_allocated: 800,
        unapplied_credit: 0,
        source_transaction_id: VALID_TX_ID,
        needs_review: false,
        review_reason: null,
      },
      error: null,
    })
    await allocateRentPaymentAction(
      VALID_PROPERTY_ID, VALID_TX_ID, 'Jacob', 'JJ', 800, '2026-08-15',
    )
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'allocate_rent_payment',
      expect.objectContaining({
        p_payer: 'Jacob',
        p_payee: 'JJ',
      }),
    )
  })

  it('all valid obligation statuses are accepted by the mapper', async () => {
    const validStatuses = ['expected', 'due', 'partial', 'received', 'overdue', 'waived', 'reversed']
    for (const status of validStatuses) {
      const row = { ...OBLIGATION_ROW, status }
      mockOrder.mockResolvedValue({ data: [row], error: null })
      mockEq.mockReturnValue({ order: mockOrder })
      mockSelect.mockReturnValue({ eq: mockEq })
      mockFrom.mockReturnValue({ select: mockSelect })
      const result = await fetchRentObligations(VALID_CONTRACT_ID)
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe(status)
    }
  })
})
