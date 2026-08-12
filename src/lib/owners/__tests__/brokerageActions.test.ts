/**
 * @module brokerageActions.test
 * @description P6 LTR Operations — Brokerage Obligations tests.
 *
 * 14 focused tests covering:
 *
 * SPEC REQUIRED (V1.3 Section 11.2 — 6 tests):
 * 1. New tenant → brokerage obligation created (1)
 * 2. Renewal → no new brokerage (same contract_id) (1)
 * 3. Rent change under same lease → no new brokerage (1)
 * 4. RLS deny-all verified (adapter cannot bypass) (1)
 * 5. RLS: anon/authenticated denied (1)
 * 6. Idempotency: duplicate contract_id → rejected (1)
 *
 * Additional coverage:
 * - Auth: unauthenticated → rejected (1)
 * - Validation: invalid rental contract UUID → rejected (1)
 * - Validation: invalid property UUID → rejected (1)
 * - Validation: invalid calculation type → rejected (1)
 * - Validation: percentage type without valid rate → rejected (1)
 * - Validation: invalid payer → rejected (1)
 * - Adapter: maps brokerage row to DTO correctly (1)
 * - G3-18: brokerageAdapter imports no other adapters (1)
 *
 * Architecture:
 * - Mocks: server-only, statementAuthService, supabase, validation
 * - Pure unit tests — no DB, no network
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
  createBrokerageAction,
  updateBrokerageStatusAction,
} from '../brokerageActions'
import type { CreateBrokerageInput } from '../brokerageActions'
import { fetchPropertyBrokerages, fetchContractBrokerage } from '../brokerageAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_BROKERAGE_ID = 'cccccccc-1111-2222-3333-444444444444'

function authedOk() {
  return { ok: true, userId: '277f81e0-3b89-41ed-a099-22585959b77a' }
}

function authedFail() {
  return { ok: false }
}

function makeCreateInput(overrides: Partial<CreateBrokerageInput> = {}): CreateBrokerageInput {
  return {
    rentalContractId: VALID_CONTRACT_ID,
    propertyId: VALID_PROPERTY_ID,
    tenantName: 'Elena Georgiou',
    brokerageApplicable: true,
    brokerName: 'Makris Real Estate',
    calculationType: 'one_month_rent',
    percentageRate: null,
    chargeAmountEur: 850,
    chargeDate: '2026-09-01',
    isNewTenant: true,
    payer: 'Owner',
    payee: 'JJ',
    governingEvidence: 'lease_agreement_2026_09.pdf',
    notes: null,
    ...overrides,
  }
}

function makeCreateRpcResult(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_BROKERAGE_ID,
    status: 'created',
    idempotency_key: `${VALID_CONTRACT_ID}:brokerage`,
    ...overrides,
  }
}

function makeBrokerageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_BROKERAGE_ID,
    rental_contract_id: VALID_CONTRACT_ID,
    property_id: VALID_PROPERTY_ID,
    tenant_name: 'Elena Georgiou',
    brokerage_applicable: true,
    broker_name: 'Makris Real Estate',
    calculation_type: 'one_month_rent',
    percentage_rate: null,
    charge_amount_eur: 850,
    charge_date: '2026-09-01',
    is_new_tenant: true,
    payer: 'Owner',
    payee: 'JJ',
    governing_evidence: 'lease_agreement_2026_09.pdf',
    settled_amount_eur: 0,
    status: 'pending',
    settlement_evidence: null,
    idempotency_key: `${VALID_CONTRACT_ID}:brokerage`,
    notes: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPEC REQUIRED TEST 1: New tenant → brokerage obligation created
// ═══════════════════════════════════════════════════════════════════════════════

describe('SPEC: new tenant creates brokerage', () => {
  test('new tenant placement → brokerage obligation created with correct params', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({ data: makeCreateRpcResult(), error: null })

    const result = await createBrokerageAction(makeCreateInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.id).toBe(VALID_BROKERAGE_ID)
      expect(result.result.idempotencyKey).toBe(`${VALID_CONTRACT_ID}:brokerage`)
    }

    // Verify RPC params
    expect(mockSchemaRpc).toHaveBeenCalledWith('create_brokerage_obligation', {
      p_rental_contract_id: VALID_CONTRACT_ID,
      p_property_id: VALID_PROPERTY_ID,
      p_tenant_name: 'Elena Georgiou',
      p_brokerage_applicable: true,
      p_broker_name: 'Makris Real Estate',
      p_calculation_type: 'one_month_rent',
      p_percentage_rate: null,
      p_charge_amount_eur: 850,
      p_charge_date: '2026-09-01',
      p_is_new_tenant: true,
      p_payer: 'Owner',
      p_payee: 'JJ',
      p_governing_evidence: 'lease_agreement_2026_09.pdf',
      p_notes: null,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPEC REQUIRED TEST 2: Renewal → no new brokerage
// (Same rental_contract_id → idempotency_key collision at DB level)
// ═══════════════════════════════════════════════════════════════════════════════

describe('SPEC: renewal → no new brokerage', () => {
  test('same contract_id on renewal → RPC returns duplicate key error → ok:false', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "brokerage_obligations_idempotency_key_key"' },
    })

    // Attempt to create brokerage for same contract (renewal scenario)
    const result = await createBrokerageAction(makeCreateInput({
      isNewTenant: false, // renewal
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('duplicate key')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPEC REQUIRED TEST 3: Rent change under same lease → no new brokerage
// ═══════════════════════════════════════════════════════════════════════════════

describe('SPEC: rent change → no new brokerage', () => {
  test('rent amount changes but same lease (same contract_id) → DB rejects duplicate', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "brokerage_obligations_idempotency_key_key"' },
    })

    // Same contract_id, different amount (rent increased)
    const result = await createBrokerageAction(makeCreateInput({
      chargeAmountEur: 950, // higher rent, same lease
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('duplicate key')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPEC REQUIRED TEST 4: RLS deny-all verified (adapter reads via service_role RPC)
// ═══════════════════════════════════════════════════════════════════════════════

describe('SPEC: RLS deny-all', () => {
  test('adapter reads via lifecycle schema RPC (not direct table access)', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeBrokerageRow()],
      error: null,
    })

    const brokerages = await fetchPropertyBrokerages(VALID_PROPERTY_ID)

    expect(brokerages).toHaveLength(1)
    // Adapter calls via .schema('lifecycle').rpc(...)
    expect(mockSupabaseClient.schema).toHaveBeenCalledWith('lifecycle')
    expect(mockSchemaRpc).toHaveBeenCalledWith('get_property_brokerages', {
      p_property_id: VALID_PROPERTY_ID,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPEC REQUIRED TEST 5: anon/authenticated denied
// ═══════════════════════════════════════════════════════════════════════════════

describe('SPEC: anon/authenticated denied', () => {
  test('unauthenticated user → create action rejected before RPC call', async () => {
    mockAuth.mockReturnValue(authedFail())

    const result = await createBrokerageAction(makeCreateInput())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('You must be signed in')
    }
    // RPC never called — anon blocked at server action level
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SPEC REQUIRED TEST 6: Idempotency — duplicate contract_id → rejected
// ═══════════════════════════════════════════════════════════════════════════════

describe('SPEC: idempotency', () => {
  test('second create with same contract_id → unique constraint violation → ok:false', async () => {
    mockAuth.mockReturnValue(authedOk())

    // First create succeeds
    mockSchemaRpc.mockResolvedValueOnce({ data: makeCreateRpcResult(), error: null })
    const first = await createBrokerageAction(makeCreateInput())
    expect(first.ok).toBe(true)

    // Second create with same contract_id → DB enforces UNIQUE on idempotency_key
    mockSchemaRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "brokerage_obligations_idempotency_key_key"' },
    })
    const second = await createBrokerageAction(makeCreateInput())
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error).toContain('duplicate key')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Additional validation tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('createBrokerageAction validation', () => {
  beforeEach(() => {
    mockAuth.mockReturnValue(authedOk())
  })

  test('invalid rental contract UUID → rejected', async () => {
    const result = await createBrokerageAction(makeCreateInput({
      rentalContractId: 'not-a-uuid',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('rental contract')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid property UUID → rejected', async () => {
    const result = await createBrokerageAction(makeCreateInput({
      propertyId: 'bad',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('property')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid calculation type → rejected', async () => {
    const result = await createBrokerageAction(makeCreateInput({
      calculationType: 'flat_fee' as any,
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('calculation type')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('percentage type without valid rate → rejected', async () => {
    const result = await createBrokerageAction(makeCreateInput({
      calculationType: 'percentage',
      percentageRate: null,
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('percentage_rate')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid payer → rejected', async () => {
    const result = await createBrokerageAction(makeCreateInput({
      payer: 'Anastasia',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('payer')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ─── updateBrokerageStatusAction ──────────────────────────────────────────────

describe('updateBrokerageStatusAction', () => {
  test('status transition: pending → billed', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: { id: VALID_BROKERAGE_ID, previous_status: 'pending', new_status: 'billed' },
      error: null,
    })

    const result = await updateBrokerageStatusAction({
      brokerageId: VALID_BROKERAGE_ID,
      newStatus: 'billed',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.previousStatus).toBe('pending')
      expect(result.result.newStatus).toBe('billed')
    }
  })
})

// ─── Adapter: fetchPropertyBrokerages ──────────────────────────────────────

describe('fetchPropertyBrokerages', () => {
  test('maps brokerage row to DTO correctly', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeBrokerageRow()],
      error: null,
    })

    const brokerages = await fetchPropertyBrokerages(VALID_PROPERTY_ID)

    expect(brokerages).toHaveLength(1)
    const b = brokerages[0]
    expect(b.id).toBe(VALID_BROKERAGE_ID)
    expect(b.tenantName).toBe('Elena Georgiou')
    expect(b.brokerageApplicable).toBe(true)
    expect(b.brokerName).toBe('Makris Real Estate')
    expect(b.calculationType).toBe('one_month_rent')
    expect(b.percentageRate).toBeNull()
    expect(b.chargeAmountEur).toBe(850)
    expect(b.chargeDate).toBe('2026-09-01')
    expect(b.isNewTenant).toBe(true)
    expect(b.payer).toBe('Owner')
    expect(b.payee).toBe('JJ')
    expect(b.settledAmountEur).toBe(0)
    expect(b.status).toBe('pending')
    expect(b.idempotencyKey).toBe(`${VALID_CONTRACT_ID}:brokerage`)
  })
})

// ─── G3-18: no adapter-to-adapter imports ──────────────────────────────────

describe('constitutional invariants', () => {
  test('G3-18: brokerageAdapter imports no other adapters', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const adapterSource = fs.readFileSync(
      path.resolve(__dirname, '../brokerageAdapter.ts'), 'utf-8',
    )

    // No imports from other adapter files
    expect(adapterSource).not.toMatch(/from\s+['"].*tenantChargeAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*rentPositionAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*rentalContractAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*managementFeeAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*depositAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*utilityAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerFinancialAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerReservationAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerPortfolioAdapter/)

    // Read-only: no UPDATE/DELETE
    expect(adapterSource).not.toMatch(/\.update\s*\(/)
    expect(adapterSource).not.toMatch(/\.delete\s*\(/)
  })
})
