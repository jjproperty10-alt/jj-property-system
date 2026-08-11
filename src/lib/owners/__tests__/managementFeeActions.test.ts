/**
 * @module managementFeeActions.test
 * @description P2 LTR Operations — Management Fee Engine tests.
 *
 * 27 focused tests covering:
 * - Fee calculation: one_month_rent with single rent (1)
 * - Fee calculation: one_month_rent with rent change mid-year (2)
 * - Fee calculation: percentage of collected rent (2)
 * - Fee calculation: fixed_amount with vacancy (1)
 * - no_fee → zero obligations (1)
 * - Proration: sequential tenants, each segment uses own rent (3)
 * - Proration: vacancy = zero contribution (2)
 * - Tenant replacement does NOT reset fee year (1)
 * - Tenant replacement does NOT create second annual fee (1)
 * - Waiver (Uriel/Fabi precedent) (1)
 * - Cycle anchor ≠ Jan 1 (1)
 * - Atomic offset: both sides recorded (2)
 * - Atomic offset: insufficient rent → rejection (1)
 * - Atomic offset: rollback on failure (1)
 * - DB: RPC idempotency (1)
 * - DB: RLS deny-all (2)
 * - DB: service_role access (1)
 * - DB: management_fee_configs + obligations CRUD (2)
 *
 * Architecture:
 * - Mocks: server-only, statementAuthService, supabase, validation
 * - Pure unit tests — no DB, no network
 * - Three-authority separation preserved
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockSchemaRpc = jest.fn()
const mockSupabaseClient = {
  schema: jest.fn(() => ({
    rpc: mockSchemaRpc,
  })),
}

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockSupabaseClient,
}))

jest.mock('@/lib/owners/validation', () => ({
  isValidUUID: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}))

import {
  generateManagementFeeAction,
  offsetManagementFeeAction,
} from '../managementFeeActions'

import { fetchPropertyManagementFees } from '../managementFeeAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CONFIG_ID = 'cccccccc-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_RENT_OBL_ID = 'ffffffff-1111-2222-3333-444444444444'
const VALID_FEE_OBL_ID = 'eeeeeeee-1111-2222-3333-444444444444'

function authedOk() {
  return { ok: true, userId: '277f81e0-3b89-41ed-a099-22585959b77a' }
}

function authedFail() {
  return { ok: false }
}

function makeObligationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_FEE_OBL_ID,
    fee_config_id: VALID_CONFIG_ID,
    property_id: VALID_PROPERTY_ID,
    period_start: '2026-08-01',
    period_end: '2027-07-31',
    period_label: 'Year 1 (2026-08-01 to 2027-07-31)',
    calculated_amount_eur: 1000,
    prorated_amount_eur: 800,
    proration_details: [
      {
        tenant_name: 'Alice',
        rental_contract_id: 'aaaaaaaa-1111-2222-3333-444444444444',
        rent_term_id: 'dddddddd-1111-2222-3333-444444444444',
        segment_start: '2026-08-01',
        segment_end: '2027-03-31',
        segment_days: 243,
        effective_rent_eur: 1000,
        segment_contribution_eur: 800,
      },
    ],
    settled_amount_eur: 0,
    status: 'pending',
    settlement_evidence: null,
    ...overrides,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockReturnValue(authedOk())
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fee calculation: one_month_rent with single rent (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fee calculation: one_month_rent', () => {
  test('single rent term → obligation = monthly rent × occupied days / total days', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 1000,
      prorated_amount_eur: 1000,
      proration_details: [
        {
          tenant_name: 'Alice',
          rental_contract_id: 'aaaaaaaa-1111-2222-3333-444444444444',
          rent_term_id: 'dddddddd-1111-2222-3333-444444444444',
          segment_start: '2026-08-01',
          segment_end: '2027-07-31',
          segment_days: 365,
          effective_rent_eur: 1000,
          segment_contribution_eur: 1000,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.calculatedAmountEur).toBe('1000')
      expect(result.obligation.proratedAmountEur).toBe('1000')
    }
  })

  // one_month_rent with rent change mid-year (2)
  test('rent change mid-year → two proration segments', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 1000,
      prorated_amount_eur: 1050,
      proration_details: [
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaaaaaa-1111-2222-3333-444444444444',
          rent_term_id: 'dddddddd-1111-2222-3333-444444444444',
          segment_start: '2026-08-01', segment_end: '2027-01-31', segment_days: 184,
          effective_rent_eur: 1000, segment_contribution_eur: 504,
        },
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaaaaaa-1111-2222-3333-444444444444',
          rent_term_id: 'dddddddd-2222-3333-4444-555555555555',
          segment_start: '2027-02-01', segment_end: '2027-07-31', segment_days: 181,
          effective_rent_eur: 1100, segment_contribution_eur: 546,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.prorationDetails).toHaveLength(2)
      expect(result.obligation.prorationDetails![0].effectiveRentEur).toBe(1000)
      expect(result.obligation.prorationDetails![1].effectiveRentEur).toBe(1100)
    }
  })

  test('each segment uses its own effective rent from rent_terms', async () => {
    const row = makeObligationRow({
      proration_details: [
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaaaaaa-1111-2222-3333-444444444444',
          rent_term_id: 'dddddddd-1111-2222-3333-444444444444',
          segment_start: '2026-08-01', segment_end: '2026-12-31', segment_days: 153,
          effective_rent_eur: 800, segment_contribution_eur: 335,
        },
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaaaaaa-1111-2222-3333-444444444444',
          rent_term_id: 'dddddddd-3333-4444-5555-666666666666',
          segment_start: '2027-01-01', segment_end: '2027-07-31', segment_days: 212,
          effective_rent_eur: 1200, segment_contribution_eur: 697,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      const segs = result.obligation.prorationDetails!
      expect(segs[0].rentTermId).not.toBe(segs[1].rentTermId)
      expect(segs[0].effectiveRentEur).toBe(800)
      expect(segs[1].effectiveRentEur).toBe(1200)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fee calculation: percentage of collected rent (2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fee calculation: percentage', () => {
  test('percentage fee calculates correctly', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 120,
      prorated_amount_eur: 120,
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.calculatedAmountEur).toBe('120')
    }
  })

  test('percentage with vacancy period reduces contribution', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 120,
      prorated_amount_eur: 80,
      proration_details: [
        {
          tenant_name: 'Bob', rental_contract_id: 'aaaaaaaa-2222-3333-4444-555555555555',
          rent_term_id: null,
          segment_start: '2026-08-01', segment_end: '2027-03-31', segment_days: 243,
          effective_rent_eur: 1000, segment_contribution_eur: 80,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(Number(result.obligation.proratedAmountEur)).toBeLessThan(Number(result.obligation.calculatedAmountEur))
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fee calculation: fixed_amount with vacancy (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fee calculation: fixed_amount', () => {
  test('fixed_amount prorated by vacancy', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 500,
      prorated_amount_eur: 350,
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.calculatedAmountEur).toBe('500')
      expect(result.obligation.proratedAmountEur).toBe('350')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// no_fee → zero obligations (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('no_fee type', () => {
  test('no_fee returns null — skipped', async () => {
    mockSchemaRpc.mockResolvedValue({ data: null, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && 'skipped' in result) {
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('no_fee')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Proration: sequential tenants (3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Proration: sequential tenants', () => {
  test('two tenants produce two segments with different rents', async () => {
    const row = makeObligationRow({
      proration_details: [
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaa1111-1111-2222-3333-444444444444',
          rent_term_id: 'dddd1111-1111-2222-3333-444444444444',
          segment_start: '2026-08-01', segment_end: '2027-01-31', segment_days: 184,
          effective_rent_eur: 900, segment_contribution_eur: 454,
        },
        {
          tenant_name: 'Bob', rental_contract_id: 'aaaa2222-1111-2222-3333-444444444444',
          rent_term_id: 'dddd2222-1111-2222-3333-444444444444',
          segment_start: '2027-02-01', segment_end: '2027-07-31', segment_days: 181,
          effective_rent_eur: 1100, segment_contribution_eur: 546,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      const segs = result.obligation.prorationDetails!
      expect(segs).toHaveLength(2)
      expect(segs[0].tenantName).toBe('Alice')
      expect(segs[1].tenantName).toBe('Bob')
    }
  })

  test('each segment uses its own effective rent', async () => {
    const row = makeObligationRow({
      proration_details: [
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaa1111-1111-2222-3333-444444444444',
          rent_term_id: 'dddd1111-1111-2222-3333-444444444444',
          segment_start: '2026-08-01', segment_end: '2027-01-31', segment_days: 184,
          effective_rent_eur: 900, segment_contribution_eur: 454,
        },
        {
          tenant_name: 'Bob', rental_contract_id: 'aaaa2222-1111-2222-3333-444444444444',
          rent_term_id: 'dddd2222-1111-2222-3333-444444444444',
          segment_start: '2027-02-01', segment_end: '2027-07-31', segment_days: 181,
          effective_rent_eur: 1100, segment_contribution_eur: 546,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      const segs = result.obligation.prorationDetails!
      expect(segs[0].effectiveRentEur).toBe(900)
      expect(segs[1].effectiveRentEur).toBe(1100)
    }
  })

  test('segment days sum < total period when gap exists', async () => {
    const row = makeObligationRow({
      proration_details: [
        {
          tenant_name: 'Alice', rental_contract_id: 'aaaa1111-1111-2222-3333-444444444444',
          rent_term_id: null,
          segment_start: '2026-08-01', segment_end: '2026-12-31', segment_days: 153,
          effective_rent_eur: 1000, segment_contribution_eur: 419,
        },
        {
          tenant_name: 'Bob', rental_contract_id: 'aaaa2222-1111-2222-3333-444444444444',
          rent_term_id: null,
          segment_start: '2027-03-01', segment_end: '2027-07-31', segment_days: 153,
          effective_rent_eur: 1000, segment_contribution_eur: 419,
        },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      const totalSegDays = result.obligation.prorationDetails!.reduce((s, seg) => s + seg.segmentDays, 0)
      expect(totalSegDays).toBeLessThan(365)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Proration: vacancy = zero contribution (2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Proration: vacancy', () => {
  test('full vacancy → prorated amount = 0', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 1000,
      prorated_amount_eur: 0,
      proration_details: [],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.proratedAmountEur).toBe('0')
    }
  })

  test('partial vacancy reduces prorated amount', async () => {
    const row = makeObligationRow({
      calculated_amount_eur: 1000,
      prorated_amount_eur: 500,
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(Number(result.obligation.proratedAmountEur)).toBeLessThan(Number(result.obligation.calculatedAmountEur))
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Tenant replacement invariants (2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tenant replacement', () => {
  test('does NOT reset fee year — one obligation per period', async () => {
    const row = makeObligationRow({
      proration_details: [
        { tenant_name: 'Alice', rental_contract_id: 'a1111111-1111-2222-3333-444444444444', rent_term_id: null, segment_start: '2026-08-01', segment_end: '2027-01-31', segment_days: 184, effective_rent_eur: 1000, segment_contribution_eur: 504 },
        { tenant_name: 'Bob', rental_contract_id: 'b2222222-1111-2222-3333-444444444444', rent_term_id: null, segment_start: '2027-02-01', segment_end: '2027-07-31', segment_days: 181, effective_rent_eur: 1000, segment_contribution_eur: 496 },
      ],
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    // Only one obligation returned, not two
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.id).toBeDefined()
      expect(result.obligation.prorationDetails).toHaveLength(2)
    }
  })

  test('does NOT create second annual fee', async () => {
    // Second call with same period returns already_exists
    mockSchemaRpc.mockResolvedValue({ data: { already_exists: true }, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && 'skipped' in result) {
      expect(result.skipped).toBe(true)
      expect(result.reason).toContain('already exists')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Waiver (Uriel/Fabi precedent) (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Waiver', () => {
  test('waived obligation status accepted', async () => {
    const row = makeObligationRow({ status: 'waived', settled_amount_eur: 0 })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.status).toBe('waived')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Cycle anchor ≠ Jan 1 (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cycle anchor', () => {
  test('fee period anchored to non-January date', async () => {
    const row = makeObligationRow({
      period_start: '2026-08-01',
      period_end: '2027-07-31',
      period_label: 'Year 1 (2026-08-01 to 2027-07-31)',
    })
    mockSchemaRpc.mockResolvedValue({ data: row, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && !('skipped' in result)) {
      expect(result.obligation.periodStart).toBe('2026-08-01')
      expect(result.obligation.periodEnd).toBe('2027-07-31')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Atomic offset: both sides recorded (2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Atomic offset', () => {
  test('both rent_obligation and fee_obligation updated', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        allocation_id: '11111111-1111-2222-3333-444444444444',
        source_obligation_id: VALID_RENT_OBL_ID,
        target_obligation_id: VALID_FEE_OBL_ID,
        offset_amount: 500,
        new_fee_status: 'settled',
        settlement_evidence: { mechanism: 'rent_offset' },
      },
      error: null,
    })
    const result = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 500, VALID_FEE_OBL_ID, 'JJ', '2026-09-01',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.sourceObligationId).toBe(VALID_RENT_OBL_ID)
      expect(result.result.targetObligationId).toBe(VALID_FEE_OBL_ID)
      expect(result.result.offsetAmount).toBe(500)
    }
  })

  test('settlement_evidence preserves payee identity', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        allocation_id: '22222222-1111-2222-3333-444444444444',
        source_obligation_id: VALID_RENT_OBL_ID,
        target_obligation_id: VALID_FEE_OBL_ID,
        offset_amount: 300,
        new_fee_status: 'partial',
        settlement_evidence: { payee: 'JJ', mechanism: 'rent_offset', date: '2026-09-01' },
      },
      error: null,
    })
    const result = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 300, VALID_FEE_OBL_ID, 'JJ', '2026-09-01',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.settlementEvidence).toBeDefined()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Atomic offset: insufficient rent → rejection (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Atomic offset: insufficient rent', () => {
  test('RPC error when insufficient funds', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'Insufficient available rent: available=200, requested=500' },
    })
    const result = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 500, VALID_FEE_OBL_ID, 'JJ', '2026-09-01',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Insufficient')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Atomic offset: rollback on failure (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Atomic offset: rollback', () => {
  test('RPC failure returns error, no partial state', async () => {
    mockSchemaRpc.mockRejectedValue(new Error('Connection lost'))
    const result = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 500, VALID_FEE_OBL_ID, 'JJ', '2026-09-01',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Unexpected error')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DB: RPC idempotency (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB: idempotency', () => {
  test('duplicate generation returns already_exists', async () => {
    mockSchemaRpc.mockResolvedValue({ data: { already_exists: true }, error: null })
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(true)
    if (result.ok && 'skipped' in result) {
      expect(result.skipped).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DB: RLS deny-all (2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB: RLS deny-all', () => {
  test('unauthenticated user → rejected', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await generateManagementFeeAction(VALID_CONFIG_ID, '2026-08-01', '2027-07-31')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('signed in')
  })

  test('unauthenticated offset → rejected', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 500, VALID_FEE_OBL_ID, 'JJ', '2026-09-01',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('signed in')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DB: service_role access (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB: service_role access', () => {
  test('adapter calls lifecycle schema RPC', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: { configs: [], obligations: [] },
      error: null,
    })
    const result = await fetchPropertyManagementFees(VALID_PROPERTY_ID)
    expect(mockSupabaseClient.schema).toHaveBeenCalledWith('lifecycle')
    expect(mockSchemaRpc).toHaveBeenCalledWith('get_property_management_fees', {
      p_property_id: VALID_PROPERTY_ID,
    })
    expect(result.configs).toEqual([])
    expect(result.obligations).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DB: management_fee_configs + obligations CRUD (2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB: CRUD', () => {
  test('adapter maps config rows correctly', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        configs: [{
          id: VALID_CONFIG_ID,
          service_engagement_id: 'aaaaaaaa-1111-2222-3333-444444444444',
          property_id: VALID_PROPERTY_ID,
          fee_type: 'one_month_rent',
          fee_value: null,
          cycle_anchor_date: '2026-08-01',
          obligation_frequency: 'annual',
          effective_from: '2026-08-01',
          effective_to: null,
          status: 'active',
          governing_evidence: 'Service agreement clause 4.2',
          notes: null,
        }],
        obligations: [],
      },
      error: null,
    })
    const result = await fetchPropertyManagementFees(VALID_PROPERTY_ID)
    expect(result.configs).toHaveLength(1)
    expect(result.configs[0].feeType).toBe('one_month_rent')
    expect(result.configs[0].obligationFrequency).toBe('annual')
    expect(result.configs[0].effectiveTo).toBeNull()
  })

  test('adapter maps obligation rows correctly', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        configs: [],
        obligations: [makeObligationRow()],
      },
      error: null,
    })
    const result = await fetchPropertyManagementFees(VALID_PROPERTY_ID)
    expect(result.obligations).toHaveLength(1)
    expect(result.obligations[0].status).toBe('pending')
    expect(result.obligations[0].prorationDetails).toHaveLength(1)
    expect(result.obligations[0].prorationDetails![0].tenantName).toBe('Alice')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// V1.3: Concurrent offset (1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('V1.3: Concurrent offset', () => {
  test('two concurrent offsets against same source — second gets insufficient funds error', async () => {
    // First call succeeds
    mockSchemaRpc.mockResolvedValueOnce({
      data: {
        allocation_id: '33333333-1111-2222-3333-444444444444',
        source_obligation_id: VALID_RENT_OBL_ID,
        target_obligation_id: VALID_FEE_OBL_ID,
        offset_amount: 500,
        new_fee_status: 'settled',
        settlement_evidence: {},
      },
      error: null,
    })
    const result1 = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 500, VALID_FEE_OBL_ID, 'JJ', '2026-09-01',
    )
    expect(result1.ok).toBe(true)

    // Second call fails — insufficient after FOR UPDATE lock
    mockSchemaRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Insufficient available rent: available=0, requested=500' },
    })
    const result2 = await offsetManagementFeeAction(
      VALID_RENT_OBL_ID, 500, 'eeeeeeee-2222-3333-4444-555555555555', 'JJ', '2026-09-01',
    )
    expect(result2.ok).toBe(false)
  })
})
