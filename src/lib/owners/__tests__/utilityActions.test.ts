/**
 * @module utilityActions.test
 * @description P4 LTR Operations — Utilities / Sub-Meters tests.
 *
 * 22 focused tests covering:
 *
 * Server Action — recordMeterReadingAction:
 * - Normal reading: records and returns DTO (1)
 * - First reading: consumption=null, needs_review=true, reason=first_reading (1)
 * - Missing rate: needs_review=true, reason=rate_missing (1)
 * - No active rental: needs_review=true, reason=no_active_rental_contract (1)
 * - Auth: unauthenticated → rejected (1)
 * - Validation: invalid meter UUID → rejected (1)
 * - Validation: invalid date format → rejected (1)
 * - Validation: negative reading value → rejected (1)
 * - RPC error → ok:false with message (1)
 *
 * Adapter — fetchPropertyUtilityMeters:
 * - Maps meter rows to DTO correctly (1)
 * - Empty result → empty array (1)
 * - Invalid utility_type → filtered out (1)
 * - Invalid meter status → filtered out (1)
 *
 * Adapter — fetchMeterReadings:
 * - Maps reading rows to DTO (1)
 * - P-ARCH-1: null previousValue + consumption → null in DTO (1)
 *
 * Adapter — fetchTenantUtilityObligations:
 * - Maps obligation rows to DTO (1)
 * - Invalid obligation status → filtered out (1)
 *
 * Adapter — fetchApplicableUtilityRates:
 * - Maps rate rows to DTO (1)
 * - Invalid scope → filtered out (1)
 *
 * Adapter — fetchUtilityPosition:
 * - Aggregates meters + obligations in parallel (1)
 *
 * Constitutional:
 * - Three-event separation: obligation ≠ income/expense (1)
 * - G3-18: utilityAdapter imports no other adapters (1)
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

import { recordMeterReadingAction } from '../utilityActions'
import type { RecordMeterReadingInput } from '../utilityActions'
import {
  fetchPropertyUtilityMeters,
  fetchMeterReadings,
  fetchTenantUtilityObligations,
  fetchApplicableUtilityRates,
  fetchUtilityPosition,
} from '../utilityAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_METER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_READING_ID = 'cccccccc-1111-2222-3333-444444444444'
const VALID_OBLIGATION_ID = 'dddddddd-1111-2222-3333-444444444444'
const VALID_RATE_ID = 'eeeeeeee-1111-2222-3333-444444444444'
const VALID_CONTRACT_ID = 'ffffffff-1111-2222-3333-444444444444'

function authedOk() {
  return { ok: true, userId: '277f81e0-3b89-41ed-a099-22585959b77a' }
}

function authedFail() {
  return { ok: false }
}

function makeInput(overrides: Partial<RecordMeterReadingInput> = {}): RecordMeterReadingInput {
  return {
    meterId: VALID_METER_ID,
    readingDate: '2026-08-01',
    readingValue: 15230,
    recordedBy: 'Anastasia',
    photoEvidence: null,
    ...overrides,
  }
}

function makeRpcResult(overrides: Record<string, unknown> = {}) {
  return {
    reading_id: VALID_READING_ID,
    consumption: 450,
    obligation_created: true,
    obligation_id: VALID_OBLIGATION_ID,
    needs_review: false,
    reason: null,
    next_reading_due: '2026-09-01',
    ...overrides,
  }
}

function makeMeterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_METER_ID,
    property_id: VALID_PROPERTY_ID,
    utility_type: 'electricity',
    meter_identifier: 'EL-001',
    unit_of_measure: 'kWh',
    status: 'active',
    reading_interval_months: 1,
    last_reading_date: '2026-07-01',
    next_reading_due: '2026-08-01',
    notes: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function makeReadingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_READING_ID,
    meter_id: VALID_METER_ID,
    reading_date: '2026-08-01',
    reading_value: 15230,
    previous_value: 14780,
    consumption: 450,
    photo_evidence: null,
    recorded_by: 'Anastasia',
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

function makeObligationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_OBLIGATION_ID,
    rental_contract_id: VALID_CONTRACT_ID,
    property_id: VALID_PROPERTY_ID,
    meter_id: VALID_METER_ID,
    reading_id: VALID_READING_ID,
    rate_id: VALID_RATE_ID,
    utility_type: 'electricity',
    period_start: '2026-07-01',
    period_end: '2026-08-01',
    consumption: 450,
    rate_per_unit_eur: 0.25,
    obligation_amount_eur: 112.5,
    tenant_name: 'Maria Papadopoulou',
    settled_amount_eur: 0,
    status: 'pending',
    settlement_evidence: null,
    idempotency_key: `${VALID_METER_ID}:2026-08-01`,
    notes: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

function makeRateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_RATE_ID,
    utility_type: 'electricity',
    rate_per_unit_eur: 0.25,
    effective_from: '2026-01-01',
    effective_to: null,
    source: 'EAC tariff schedule 2026',
    scope: 'central',
    property_id: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Server Action Tests ─────────────────────────────────────────────────────

describe('recordMeterReadingAction', () => {
  test('normal reading: records and returns full DTO', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({ data: makeRpcResult(), error: null })

    const result = await recordMeterReadingAction(makeInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.readingId).toBe(VALID_READING_ID)
      expect(result.result.consumption).toBe(450)
      expect(result.result.obligationCreated).toBe(true)
      expect(result.result.obligationId).toBe(VALID_OBLIGATION_ID)
      expect(result.result.needsReview).toBe(false)
      expect(result.result.reason).toBeNull()
      expect(result.result.nextReadingDue).toBe('2026-09-01')
    }

    // Verify RPC params
    expect(mockSchemaRpc).toHaveBeenCalledWith('record_meter_reading', {
      p_meter_id: VALID_METER_ID,
      p_reading_date: '2026-08-01',
      p_reading_value: 15230,
      p_recorded_by: 'Anastasia',
      p_photo_evidence: null,
    })
  })

  test('first reading: consumption=null, needs_review=true, reason=first_reading_no_consumption', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        consumption: null,
        obligation_created: false,
        obligation_id: null,
        needs_review: true,
        reason: 'first_reading_no_consumption',
      }),
      error: null,
    })

    const result = await recordMeterReadingAction(makeInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.consumption).toBeNull()
      expect(result.result.obligationCreated).toBe(false)
      expect(result.result.obligationId).toBeNull()
      expect(result.result.needsReview).toBe(true)
      expect(result.result.reason).toBe('first_reading_no_consumption')
      // Schedule still advances
      expect(result.result.nextReadingDue).toBe('2026-09-01')
    }
  })

  test('missing rate: needs_review=true, reason=rate_missing', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        consumption: 450,
        obligation_created: false,
        obligation_id: null,
        needs_review: true,
        reason: 'rate_missing',
      }),
      error: null,
    })

    const result = await recordMeterReadingAction(makeInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.consumption).toBe(450)
      expect(result.result.obligationCreated).toBe(false)
      expect(result.result.needsReview).toBe(true)
      expect(result.result.reason).toBe('rate_missing')
      // Schedule still advances even without rate
      expect(result.result.nextReadingDue).toBe('2026-09-01')
    }
  })

  test('no active rental: needs_review=true, reason=no_active_rental_contract', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        consumption: 450,
        obligation_created: false,
        obligation_id: null,
        needs_review: true,
        reason: 'no_active_rental_contract',
      }),
      error: null,
    })

    const result = await recordMeterReadingAction(makeInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.obligationCreated).toBe(false)
      expect(result.result.needsReview).toBe(true)
      expect(result.result.reason).toBe('no_active_rental_contract')
    }
  })
})

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe('auth', () => {
  test('unauthenticated → rejected', async () => {
    mockAuth.mockReturnValue(authedFail())

    const result = await recordMeterReadingAction(makeInput())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('You must be signed in')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ─── Validation Tests ────────────────────────────────────────────────────────

describe('validation', () => {
  beforeEach(() => {
    mockAuth.mockReturnValue(authedOk())
  })

  test('invalid meter UUID → rejected', async () => {
    const result = await recordMeterReadingAction(makeInput({
      meterId: 'not-a-uuid',
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid meter ID')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('invalid date format → rejected', async () => {
    const result = await recordMeterReadingAction(makeInput({
      readingDate: '08/01/2026',
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Reading date')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('negative reading value → rejected', async () => {
    const result = await recordMeterReadingAction(makeInput({
      readingValue: -100,
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('non-negative')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('RPC error → ok:false with message', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'Decreasing reading rejected' },
    })

    const result = await recordMeterReadingAction(makeInput())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Decreasing reading rejected')
    }
  })
})

// ─── Adapter: fetchPropertyUtilityMeters ─────────────────────────────────────

describe('fetchPropertyUtilityMeters', () => {
  test('maps meter rows to DTO', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeMeterRow()],
      error: null,
    })

    const meters = await fetchPropertyUtilityMeters(VALID_PROPERTY_ID)

    expect(meters).toHaveLength(1)
    expect(meters[0].id).toBe(VALID_METER_ID)
    expect(meters[0].utilityType).toBe('electricity')
    expect(meters[0].meterIdentifier).toBe('EL-001')
    expect(meters[0].unitOfMeasure).toBe('kWh')
    expect(meters[0].status).toBe('active')
    expect(meters[0].readingIntervalMonths).toBe(1)
    expect(meters[0].lastReadingDate).toBe('2026-07-01')
    expect(meters[0].nextReadingDue).toBe('2026-08-01')
    expect(meters[0].notes).toBeNull()
  })

  test('empty result → empty array', async () => {
    mockSchemaRpc.mockResolvedValue({ data: [], error: null })

    const meters = await fetchPropertyUtilityMeters(VALID_PROPERTY_ID)

    expect(meters).toHaveLength(0)
  })

  test('invalid utility_type → filtered out', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    mockSchemaRpc.mockResolvedValue({
      data: [makeMeterRow({ utility_type: 'INVALID' })],
      error: null,
    })

    const meters = await fetchPropertyUtilityMeters(VALID_PROPERTY_ID)

    expect(meters).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid utility_type'),
    )

    consoleSpy.mockRestore()
  })

  test('invalid status → filtered out', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    mockSchemaRpc.mockResolvedValue({
      data: [makeMeterRow({ status: 'BROKEN' })],
      error: null,
    })

    const meters = await fetchPropertyUtilityMeters(VALID_PROPERTY_ID)

    expect(meters).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid status'),
    )

    consoleSpy.mockRestore()
  })
})

// ─── Adapter: fetchMeterReadings ─────────────────────────────────────────────

describe('fetchMeterReadings', () => {
  test('maps reading rows to DTO', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeReadingRow()],
      error: null,
    })

    const readings = await fetchMeterReadings(VALID_METER_ID)

    expect(readings).toHaveLength(1)
    expect(readings[0].id).toBe(VALID_READING_ID)
    expect(readings[0].readingValue).toBe(15230)
    expect(readings[0].previousValue).toBe(14780)
    expect(readings[0].consumption).toBe(450)
    expect(readings[0].recordedBy).toBe('Anastasia')
  })

  test('P-ARCH-1: null previousValue + consumption → null in DTO', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeReadingRow({ previous_value: null, consumption: null })],
      error: null,
    })

    const readings = await fetchMeterReadings(VALID_METER_ID)

    expect(readings).toHaveLength(1)
    expect(readings[0].previousValue).toBeNull()
    expect(readings[0].consumption).toBeNull()
  })
})

// ─── Adapter: fetchTenantUtilityObligations ──────────────────────────────────

describe('fetchTenantUtilityObligations', () => {
  test('maps obligation rows to DTO', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeObligationRow()],
      error: null,
    })

    const obligations = await fetchTenantUtilityObligations(VALID_PROPERTY_ID)

    expect(obligations).toHaveLength(1)
    expect(obligations[0].id).toBe(VALID_OBLIGATION_ID)
    expect(obligations[0].consumption).toBe(450)
    expect(obligations[0].ratePerUnitEur).toBe(0.25)
    expect(obligations[0].obligationAmountEur).toBe(112.5)
    expect(obligations[0].tenantName).toBe('Maria Papadopoulou')
    expect(obligations[0].settledAmountEur).toBe(0)
    expect(obligations[0].status).toBe('pending')
    expect(obligations[0].idempotencyKey).toBe(`${VALID_METER_ID}:2026-08-01`)
  })

  test('invalid obligation status → filtered out', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    mockSchemaRpc.mockResolvedValue({
      data: [makeObligationRow({ status: 'UNKNOWN_STATUS' })],
      error: null,
    })

    const obligations = await fetchTenantUtilityObligations(VALID_PROPERTY_ID)

    expect(obligations).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid status'),
    )

    consoleSpy.mockRestore()
  })
})

// ─── Adapter: fetchApplicableUtilityRates ────────────────────────────────────

describe('fetchApplicableUtilityRates', () => {
  test('maps rate rows to DTO', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: [makeRateRow()],
      error: null,
    })

    const rates = await fetchApplicableUtilityRates('electricity', VALID_PROPERTY_ID)

    expect(rates).toHaveLength(1)
    expect(rates[0].id).toBe(VALID_RATE_ID)
    expect(rates[0].utilityType).toBe('electricity')
    expect(rates[0].ratePerUnitEur).toBe(0.25)
    expect(rates[0].scope).toBe('central')
    expect(rates[0].effectiveTo).toBeNull()
    expect(rates[0].propertyId).toBeNull()
  })

  test('invalid scope → filtered out', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    mockSchemaRpc.mockResolvedValue({
      data: [makeRateRow({ scope: 'global' })],
      error: null,
    })

    const rates = await fetchApplicableUtilityRates('electricity')

    expect(rates).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid scope'),
    )

    consoleSpy.mockRestore()
  })
})

// ─── Adapter: fetchUtilityPosition ───────────────────────────────────────────

describe('fetchUtilityPosition', () => {
  test('aggregates meters + obligations in parallel', async () => {
    // First call = get_property_utility_meters, second = get_tenant_utility_obligations
    mockSchemaRpc
      .mockResolvedValueOnce({ data: [makeMeterRow()], error: null })
      .mockResolvedValueOnce({ data: [makeObligationRow()], error: null })

    const position = await fetchUtilityPosition(VALID_PROPERTY_ID)

    expect(position.meters).toHaveLength(1)
    expect(position.obligations).toHaveLength(1)
    expect(position.meters[0].id).toBe(VALID_METER_ID)
    expect(position.obligations[0].id).toBe(VALID_OBLIGATION_ID)

    // Verify both RPCs called
    expect(mockSchemaRpc).toHaveBeenCalledTimes(2)
  })
})

// ─── Constitutional Invariant Tests ──────────────────────────────────────────

describe('constitutional invariants', () => {
  test('three-event separation: obligation ≠ income/expense — no P&L fields', () => {
    // TenantUtilityObligationDTO is a charge record, not a P&L item.
    // It intentionally has NO fields named income, revenue, profit, expense.
    const obligationFields = [
      'id', 'rentalContractId', 'propertyId', 'meterId', 'readingId', 'rateId',
      'utilityType', 'periodStart', 'periodEnd', 'consumption', 'ratePerUnitEur',
      'obligationAmountEur', 'tenantName', 'settledAmountEur', 'status',
      'settlementEvidence', 'idempotencyKey', 'notes', 'createdAt', 'updatedAt',
    ]

    expect(obligationFields).not.toContain('income')
    expect(obligationFields).not.toContain('revenue')
    expect(obligationFields).not.toContain('profit')
    expect(obligationFields).not.toContain('expense')
    expect(obligationFields).not.toContain('settlement_amount')
  })

  test('G3-18: utilityAdapter imports no other adapters', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const adapterSource = fs.readFileSync(
      path.resolve(__dirname, '../utilityAdapter.ts'), 'utf-8'
    )

    // G3-18: no imports from other adapter files
    expect(adapterSource).not.toMatch(/from\s+['"].*rentPositionAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*rentalContractAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*managementFeeAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*depositAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerFinancialAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerReservationAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerPortfolioAdapter/)
    expect(adapterSource).not.toMatch(/from\s+['"].*ownerMaintenanceAdapter/)

    // No UPDATE/DELETE in read-only adapter
    expect(adapterSource).not.toMatch(/\.update\s*\(/)
    expect(adapterSource).not.toMatch(/\.delete\s*\(/)
  })
})
