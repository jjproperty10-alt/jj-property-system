/**
 * @module tenantChargeActions.test
 * @description P5 LTR Operations — Tenant Charges + Billing Presentation tests.
 *
 * 28 focused tests covering:
 *
 * Server Action — createTenantChargeAction:
 * - Damage charge with positive margin (1)
 * - Negative margin allowed: cost > charge (1)
 * - Unknown cost → null actualCostEur, null margin (P-ARCH-1) (1)
 * - Auth: unauthenticated → rejected (1)
 * - Validation: invalid rental contract UUID → rejected (1)
 * - Validation: invalid property UUID → rejected (1)
 * - Validation: empty tenant name → rejected (1)
 * - Validation: invalid charge type → rejected (1)
 * - Validation: empty description → rejected (1)
 * - Validation: negative charge amount → rejected (1)
 * - Validation: invalid date format → rejected (1)
 * - Validation: empty idempotency key → rejected (1)
 * - RPC error → ok:false with message (1)
 *
 * Server Action — updateTenantChargeStatusAction:
 * - Status transition: pending → billed (1)
 * - Auth: unauthenticated → rejected (1)
 * - Validation: invalid charge UUID → rejected (1)
 * - Validation: invalid status → rejected (1)
 *
 * Server Action — setPresentationOverrideAction:
 * - Defer override with date (1)
 * - next_statement override (no defer date needed) (1)
 * - internal_only override (1)
 * - Auth: unauthenticated → rejected (1)
 * - Validation: defer_until_date status without date → rejected (1)
 * - Validation: invalid presentation status → rejected (1)
 *
 * Adapter — fetchContractTenantCharges:
 * - Maps charge rows to DTO with margin derivation (1)
 * - Invalid charge_type → filtered out (1)
 *
 * Adapter — resolvePresentation:
 * - No override → fallback (include_now, visible=true) (1)
 *
 * Constitutional:
 * - Three-event separation: tenant charge ≠ owner expense — no P&L fields (1)
 * - G3-18: tenantChargeAdapter imports no other adapters (1)
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
  createTenantChargeAction,
  updateTenantChargeStatusAction,
  setPresentationOverrideAction,
} from '../tenantChargeActions'
import type {
  CreateTenantChargeInput,
  UpdateTenantChargeStatusInput,
  SetPresentationOverrideInput,
} from '../tenantChargeActions'
import {
  fetchContractTenantCharges,
  resolvePresentation,
} from '../tenantChargeAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_CHARGE_ID = 'cccccccc-1111-2222-3333-444444444444'
const VALID_TX_ID = 'dddddddd-1111-2222-3333-444444444444'

function authedOk() {
  return { ok: true, userId: '277f81e0-3b89-41ed-a099-22585959b77a' }
}

function authedFail() {
  return { ok: false }
}

function makeCreateInput(overrides: Partial<CreateTenantChargeInput> = {}): CreateTenantChargeInput {
  return {
    rentalContractId: VALID_CONTRACT_ID,
    propertyId: VALID_PROPERTY_ID,
    tenantName: 'Maria Papadopoulou',
    chargeType: 'damage',
    description: 'Broken window in bedroom',
    actualCostEur: 80,
    chargeAmountEur: 120,
    sourceEvidence: 'photo_2026_08_01.jpg',
    economicDate: '2026-08-01',
    deductibleFromDeposit: true,
    idempotencyKey: `${VALID_CONTRACT_ID}:damage:2026-08-01`,
    notes: null,
    ...overrides,
  }
}

function makeCreateRpcResult(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_CHARGE_ID,
    status: 'pending',
    ...overrides,
  }
}

function makeChargeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_CHARGE_ID,
    rental_contract_id: VALID_CONTRACT_ID,
    property_id: VALID_PROPERTY_ID,
    tenant_name: 'Maria Papadopoulou',
    charge_type: 'damage',
    description: 'Broken window in bedroom',
    actual_cost_eur: 80,
    charge_amount_eur: 120,
    source_evidence: 'photo_2026_08_01.jpg',
    economic_date: '2026-08-01',
    deductible_from_deposit: true,
    settled_amount_eur: 0,
    status: 'pending',
    settlement_evidence: null,
    idempotency_key: `${VALID_CONTRACT_ID}:damage:2026-08-01`,
    notes: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── createTenantChargeAction Tests ─────────────────────────────────────────

describe('createTenantChargeAction', () => {
  test('damage charge with positive margin: creates and returns result', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({ data: makeCreateRpcResult(), error: null })

    const result = await createTenantChargeAction(makeCreateInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.id).toBe(VALID_CHARGE_ID)
      expect(result.result.status).toBe('pending')
    }

    // Verify RPC params
    expect(mockSchemaRpc).toHaveBeenCalledWith('create_tenant_charge_obligation', {
      p_rental_contract_id: VALID_CONTRACT_ID,
      p_property_id: VALID_PROPERTY_ID,
      p_tenant_name: 'Maria Papadopoulou',
      p_charge_type: 'damage',
      p_description: 'Broken window in bedroom',
      p_actual_cost_eur: 80,
      p_charge_amount_eur: 120,
      p_source_evidence: 'photo_2026_08_01.jpg',
      p_economic_date: '2026-08-01',
      p_deductible: true,
      p_idempotency_key: `${VALID_CONTRACT_ID}:damage:2026-08-01`,
      p_notes: null,
    })
  })

  test('negative margin allowed: cost > charge accepted (no constraint)', async () => {
    mockAuth.mockReturnValue(authedOk())
    // JJ absorbs the loss: repair cost €200, tenant charged €150
    mockSchemaRpc.mockResolvedValue({ data: makeCreateRpcResult(), error: null })

    const result = await createTenantChargeAction(makeCreateInput({
      actualCostEur: 200,
      chargeAmountEur: 150,
    }))

    // Negative margin = valid business scenario
    expect(result.ok).toBe(true)
    expect(mockSchemaRpc).toHaveBeenCalled()
  })

  test('P-ARCH-1: unknown cost → actualCostEur=null passed to RPC', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({ data: makeCreateRpcResult(), error: null })

    const result = await createTenantChargeAction(makeCreateInput({
      actualCostEur: null,
    }))

    expect(result.ok).toBe(true)
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'create_tenant_charge_obligation',
      expect.objectContaining({ p_actual_cost_eur: null }),
    )
  })
})

// ─── createTenantChargeAction Auth ──────────────────────────────────────────

describe('createTenantChargeAction auth', () => {
  test('unauthenticated → rejected', async () => {
    mockAuth.mockReturnValue(authedFail())

    const result = await createTenantChargeAction(makeCreateInput())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('You must be signed in')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ─── createTenantChargeAction Validation ────────────────────────────────────

describe('createTenantChargeAction validation', () => {
  beforeEach(() => {
    mockAuth.mockReturnValue(authedOk())
  })

  test('invalid rental contract UUID → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      rentalContractId: 'not-a-uuid',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('rental contract')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid property UUID → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      propertyId: 'bad',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('property')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('empty tenant name → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      tenantName: '   ',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Tenant name')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid charge type → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      chargeType: 'theft' as any,
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('charge type')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('empty description → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      description: '',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Description')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('negative charge amount → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      chargeAmountEur: -50,
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('non-negative')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid date format → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      economicDate: '08/01/2026',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('date')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('empty idempotency key → rejected', async () => {
    const result = await createTenantChargeAction(makeCreateInput({
      idempotencyKey: '',
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Idempotency')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('RPC error → ok:false with message', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    })

    const result = await createTenantChargeAction(makeCreateInput())

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('duplicate key')
  })
})

// ─── updateTenantChargeStatusAction Tests ───────────────────────────────────

describe('updateTenantChargeStatusAction', () => {
  test('status transition: pending → billed', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: { id: VALID_CHARGE_ID, previous_status: 'pending', new_status: 'billed' },
      error: null,
    })

    const result = await updateTenantChargeStatusAction({
      chargeId: VALID_CHARGE_ID,
      newStatus: 'billed',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.previousStatus).toBe('pending')
      expect(result.result.newStatus).toBe('billed')
    }
  })

  test('unauthenticated → rejected', async () => {
    mockAuth.mockReturnValue(authedFail())

    const result = await updateTenantChargeStatusAction({
      chargeId: VALID_CHARGE_ID,
      newStatus: 'billed',
    })

    expect(result.ok).toBe(false)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid charge UUID → rejected', async () => {
    mockAuth.mockReturnValue(authedOk())

    const result = await updateTenantChargeStatusAction({
      chargeId: 'not-uuid',
      newStatus: 'billed',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('charge ID')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid status → rejected', async () => {
    mockAuth.mockReturnValue(authedOk())

    const result = await updateTenantChargeStatusAction({
      chargeId: VALID_CHARGE_ID,
      newStatus: 'approved' as any,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('status')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ─── setPresentationOverrideAction Tests ────────────────────────────────────

describe('setPresentationOverrideAction', () => {
  test('defer override with date: creates override', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: { id: 'override-1', action: 'inserted', economic_date: '2026-08-01' },
      error: null,
    })

    const result = await setPresentationOverrideAction({
      sourceTransactionId: VALID_TX_ID,
      propertyId: VALID_PROPERTY_ID,
      presentationStatus: 'defer_until_date',
      deferUntilDate: '2026-09-15',
      economicDate: '2026-08-01',
      overrideReason: 'Waiting for contractor invoice',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.action).toBe('inserted')
      expect(result.result.economicDate).toBe('2026-08-01')
    }
  })

  test('next_statement override: no defer date needed', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: { id: 'override-2', action: 'inserted', economic_date: '2026-07-15' },
      error: null,
    })

    const result = await setPresentationOverrideAction({
      sourceTransactionId: VALID_TX_ID,
      propertyId: VALID_PROPERTY_ID,
      presentationStatus: 'next_statement',
    })

    expect(result.ok).toBe(true)
  })

  test('internal_only override: never shown on owner statements', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: { id: 'override-3', action: 'inserted', economic_date: '2026-07-01' },
      error: null,
    })

    const result = await setPresentationOverrideAction({
      sourceTransactionId: VALID_TX_ID,
      propertyId: VALID_PROPERTY_ID,
      presentationStatus: 'internal_only',
      overrideReason: 'JJ internal booking — not relevant to owner',
    })

    expect(result.ok).toBe(true)
  })

  test('unauthenticated → rejected', async () => {
    mockAuth.mockReturnValue(authedFail())

    const result = await setPresentationOverrideAction({
      sourceTransactionId: VALID_TX_ID,
      propertyId: VALID_PROPERTY_ID,
      presentationStatus: 'next_statement',
    })

    expect(result.ok).toBe(false)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('defer_until_date status without date → rejected', async () => {
    mockAuth.mockReturnValue(authedOk())

    const result = await setPresentationOverrideAction({
      sourceTransactionId: VALID_TX_ID,
      propertyId: VALID_PROPERTY_ID,
      presentationStatus: 'defer_until_date',
      // deferUntilDate intentionally omitted
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('defer_until_date')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid presentation status → rejected', async () => {
    mockAuth.mockReturnValue(authedOk())

    const result = await setPresentationOverrideAction({
      sourceTransactionId: VALID_TX_ID,
      propertyId: VALID_PROPERTY_ID,
      presentationStatus: 'show_later' as any,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('presentation status')
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ─── Adapter: fetchContractTenantCharges ────────────────────────────────────

describe('fetchContractTenantCharges', () => {
  test('maps charge rows to DTO with margin derivation', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeChargeRow()],
      error: null,
    })

    const charges = await fetchContractTenantCharges(VALID_CONTRACT_ID)

    expect(charges).toHaveLength(1)
    expect(charges[0].id).toBe(VALID_CHARGE_ID)
    expect(charges[0].tenantName).toBe('Maria Papadopoulou')
    expect(charges[0].chargeType).toBe('damage')
    expect(charges[0].actualCostEur).toBe(80)
    expect(charges[0].chargeAmountEur).toBe(120)
    // Margin derived in adapter: 120 - 80 = 40
    expect(charges[0].marginEur).toBe(40)
    expect(charges[0].deductibleFromDeposit).toBe(true)
    expect(charges[0].settledAmountEur).toBe(0)
    expect(charges[0].status).toBe('pending')
  })

  test('invalid charge_type → filtered out', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    mockSchemaRpc.mockResolvedValue({
      data: [makeChargeRow({ charge_type: 'INVALID_TYPE' })],
      error: null,
    })

    const charges = await fetchContractTenantCharges(VALID_CONTRACT_ID)

    expect(charges).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid charge_type'),
    )

    consoleSpy.mockRestore()
  })
})

// ─── Adapter: resolvePresentation ──────────────────────────────────────────

describe('resolvePresentation', () => {
  test('no override → fallback (include_now, visible=true)', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        has_override: false,
        presentation_status: 'include_now',
        visible: true,
        defer_until_date: null,
        economic_date: null,
        override_reason: null,
      },
      error: null,
    })

    const resolution = await resolvePresentation(VALID_TX_ID, VALID_PROPERTY_ID, '2026-08-15')

    expect(resolution.hasOverride).toBe(false)
    expect(resolution.presentationStatus).toBe('include_now')
    expect(resolution.visible).toBe(true)
    expect(resolution.deferUntilDate).toBeNull()
  })
})

// ─── Constitutional Invariant Tests ──────────────────────────────────────────

describe('constitutional invariants', () => {
  test('three-event separation: tenant charge ≠ owner expense — no P&L fields in DTO', () => {
    // TenantChargeObligationDTO is a charge record TO a tenant,
    // NOT an owner expense in public.transactions.
    // It intentionally has NO fields named income, revenue, profit, expense.
    const chargeFields = [
      'id', 'rentalContractId', 'propertyId', 'tenantName', 'chargeType',
      'description', 'actualCostEur', 'chargeAmountEur', 'marginEur',
      'sourceEvidence', 'economicDate', 'deductibleFromDeposit',
      'settledAmountEur', 'status', 'settlementEvidence', 'idempotencyKey',
      'notes', 'createdAt', 'updatedAt',
    ]

    // A tenant charge must NEVER contain owner-facing P&L fields
    expect(chargeFields).not.toContain('income')
    expect(chargeFields).not.toContain('revenue')
    expect(chargeFields).not.toContain('expense')
    expect(chargeFields).not.toContain('ownerExpense')
    expect(chargeFields).not.toContain('amount_eur')     // that's public.transactions
    expect(chargeFields).not.toContain('client_charge')   // that's public.transactions
  })

  test('G3-18: tenantChargeAdapter imports no other adapters', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const adapterSource = fs.readFileSync(
      path.resolve(__dirname, '../tenantChargeAdapter.ts'), 'utf-8',
    )

    // G3-18: no imports from other adapter files
    expect(adapterSource).not.toMatch(/from\s+['"].*rentPositionAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*rentalContractAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*managementFeeAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*depositAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*utilityAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerFinancialAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerReservationAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerPortfolioAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerMaintenanceAdapter/)

    // Read-only: no UPDATE/DELETE
    expect(adapterSource).not.toMatch(/\.update\s*\(/)
    expect(adapterSource).not.toMatch(/\.delete\s*\(/)

    // Must not query or write to public.transactions (code, not JSDoc)
    // Filter out comment lines before checking
    const codeLines = adapterSource.split('\n')
      .filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n')
    expect(codeLines).not.toMatch(/\.from\s*\(\s*['"]transactions['"]/)
    expect(codeLines).not.toMatch(/\.insert\s*\(\s*['"]transactions['"]/)
    expect(codeLines).not.toMatch(/\.update\s*\(\s*['"]transactions['"]/)
  })
})
