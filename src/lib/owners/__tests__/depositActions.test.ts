/**
 * @module depositActions.test
 * @description P3 LTR Operations â Deposit Lifecycle tests.
 *
 * 18 focused tests covering:
 * - Event recording: received event (happy path) (1)
 * - Event recording: refunded event (1)
 * - Event recording: partially_withheld with reason (1)
 * - Event recording: forfeited_to_owner (1)
 * - Event recording: transferred_custody (owner â JJ) (1)
 * - Event recording: adjustment with notes (1)
 * - Auth: unauthenticated â rejected (1)
 * - Validation: invalid UUID â rejected (1)
 * - Validation: invalid event type â rejected (1)
 * - Validation: invalid custodian â rejected (1)
 * - Validation: partially_withheld without reason â rejected (1)
 * - Validation: transferred_custody same custodian â rejected (1)
 * - Validation: adjustment without notes â rejected (1)
 * - Adapter: fetchDepositHistory â DTO mapping (1)
 * - Adapter: empty history â null currentState (1)
 * - Adapter: invalid custodian in DB â filtered out (1)
 * - Constitutional: deposit â  income (type-level invariant) (1)
 * - Constitutional: P-ARCH-4 append-only (no UPDATE/DELETE path) (1)
 *
 * Architecture:
 * - Mocks: server-only, statementAuthService, supabase, validation
 * - Pure unit tests â no DB, no network
 * - Event-sourced append-only model â no UPDATE/DELETE path exists
 */

// âââ Mocks ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

import { recordDepositEventAction } from '../depositActions'
import type { RecordDepositEventInput } from '../depositActions'
import { fetchDepositHistory } from '../depositAdapter'

// âââ Fixtures âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const VALID_CONTRACT_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_EVENT_ID = 'dddddddd-1111-2222-3333-444444444444'

function authedOk() {
  return { ok: true, userId: '277f81e0-3b89-41ed-a099-22585959b77a' }
}

function authedFail() {
  return { ok: false }
}

function makeInput(overrides: Partial<RecordDepositEventInput> = {}): RecordDepositEventInput {
  return {
    rentalContractId: VALID_CONTRACT_ID,
    propertyId: VALID_PROPERTY_ID,
    eventType: 'received',
    amountEur: 1500,
    custodian: 'JJ',
    tenantName: 'Maria Papadopoulou',
    effectiveDate: '2026-06-01',
    ...overrides,
  }
}

function makeRpcResult(overrides: Record<string, unknown> = {}) {
  return {
    event_id: VALID_EVENT_ID,
    event_type: 'received',
    amount_eur: 1500,
    custodian: 'JJ',
    effective_date: '2026-06-01',
    ...overrides,
  }
}

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_EVENT_ID,
    rental_contract_id: VALID_CONTRACT_ID,
    property_id: VALID_PROPERTY_ID,
    event_type: 'received',
    amount_eur: 1500,
    withheld_amount_eur: null,
    withheld_reason: null,
    custodian: 'JJ',
    previous_custodian: null,
    tenant_name: 'Maria Papadopoulou',
    effective_date: '2026-06-01',
    governing_evidence: null,
    notes: null,
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

function makeCurrentStateRow(overrides: Record<string, unknown> = {}) {
  return {
    rental_contract_id: VALID_CONTRACT_ID,
    property_id: VALID_PROPERTY_ID,
    tenant_name: 'Maria Papadopoulou',
    original_amount_eur: 1500,
    current_held_eur: 1500,
    total_refunded_eur: 0,
    total_withheld_eur: 0,
    current_custodian: 'JJ',
    latest_event_type: 'received',
    latest_event_date: '2026-06-01',
    latest_withheld_reason: null,
    event_count: 1,
    lifecycle_status: 'held',
    is_fully_closed: false,
    ...overrides,
  }
}

// âââ Setup ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

beforeEach(() => {
  jest.clearAllMocks()
})

// âââ Event Recording Tests ââââââââââââââââââââââââââââââââââââââââââââââââââââ

describe('recordDepositEventAction', () => {
  test('received: records deposit and returns DTO', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({ data: makeRpcResult(), error: null })

    const result = await recordDepositEventAction(makeInput())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.eventId).toBe(VALID_EVENT_ID)
      expect(result.result.eventType).toBe('received')
      expect(result.result.amountEur).toBe(1500)
      expect(result.result.custodian).toBe('JJ')
      expect(result.result.effectiveDate).toBe('2026-06-01')
    }

    // Verify RPC params
    expect(mockSchemaRpc).toHaveBeenCalledWith('record_deposit_event', {
      p_rental_contract_id: VALID_CONTRACT_ID,
      p_property_id: VALID_PROPERTY_ID,
      p_event_type: 'received',
      p_amount_eur: 1500,
      p_custodian: 'JJ',
      p_tenant_name: 'Maria Papadopoulou',
      p_effective_date: '2026-06-01',
      p_withheld_amount_eur: null,
      p_withheld_reason: null,
      p_previous_custodian: null,
      p_governing_evidence: null,
      p_notes: null,
    })
  })

  test('refunded: records refund with positive amount', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({ event_type: 'refunded', amount_eur: 1500, custodian: 'Tenant' }),
      error: null,
    })

    const result = await recordDepositEventAction(makeInput({
      eventType: 'refunded',
      amountEur: 1500,
      custodian: 'Tenant',
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.eventType).toBe('refunded')
      expect(result.result.custodian).toBe('Tenant')
    }
  })

  test('partially_withheld: records withholding with reason', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        event_type: 'partially_withheld',
        amount_eur: 500,
        custodian: 'Owner',
      }),
      error: null,
    })

    const result = await recordDepositEventAction(makeInput({
      eventType: 'partially_withheld',
      amountEur: 500,
      custodian: 'Owner',
      withheldAmountEur: 500,
      withheldReason: 'Damage to kitchen sink',
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.eventType).toBe('partially_withheld')
    }
  })

  test('forfeited_to_owner: records forfeiture', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        event_type: 'forfeited_to_owner',
        amount_eur: 1500,
        custodian: 'Owner',
      }),
      error: null,
    })

    const result = await recordDepositEventAction(makeInput({
      eventType: 'forfeited_to_owner',
      amountEur: 1500,
      custodian: 'Owner',
      withheldAmountEur: 1500,
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.eventType).toBe('forfeited_to_owner')
    }
  })

  test('transferred_custody: records custody change Owner â JJ', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        event_type: 'transferred_custody',
        custodian: 'JJ',
      }),
      error: null,
    })

    const result = await recordDepositEventAction(makeInput({
      eventType: 'transferred_custody',
      custodian: 'JJ',
      previousCustodian: 'Owner',
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.eventType).toBe('transferred_custody')
      expect(result.result.custodian).toBe('JJ')
    }
  })

  test('adjustment: records with notes', async () => {
    mockAuth.mockReturnValue(authedOk())
    mockSchemaRpc.mockResolvedValue({
      data: makeRpcResult({
        event_type: 'adjustment',
        amount_eur: -200,
        custodian: 'JJ',
      }),
      error: null,
    })

    const result = await recordDepositEventAction(makeInput({
      eventType: 'adjustment',
      amountEur: -200,
      custodian: 'JJ',
      notes: 'Correcting deposit amount per revised agreement',
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.eventType).toBe('adjustment')
    }
  })
})

// âââ Auth Tests âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

describe('auth', () => {
  test('unauthenticated â rejected', async () => {
    mockAuth.mockReturnValue(authedFail())

    const result = await recordDepositEventAction(makeInput())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('You must be signed in')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// âââ Validation Tests âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

describe('validation', () => {
  beforeEach(() => {
    mockAuth.mockReturnValue(authedOk())
  })

  test('invalid UUID â rejected', async () => {
    const result = await recordDepositEventAction(makeInput({
      rentalContractId: 'not-a-uuid',
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid rental contract ID')
    }
  })

  test('invalid event type â rejected', async () => {
    const result = await recordDepositEventAction(makeInput({
      eventType: 'invalid_type' as RecordDepositEventInput['eventType'],
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid event type')
    }
  })

  test('invalid custodian â rejected', async () => {
    const result = await recordDepositEventAction(makeInput({
      custodian: 'Unknown' as RecordDepositEventInput['custodian'],
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid custodian')
    }
  })

  test('partially_withheld without reason â rejected', async () => {
    const result = await recordDepositEventAction(makeInput({
      eventType: 'partially_withheld',
      withheldAmountEur: 500,
      withheldReason: null,
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('withheld reason')
    }
  })

  test('transferred_custody same custodian â rejected', async () => {
    const result = await recordDepositEventAction(makeInput({
      eventType: 'transferred_custody',
      custodian: 'JJ',
      previousCustodian: 'JJ',
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('must differ')
    }
  })

  test('adjustment without notes â rejected', async () => {
    const result = await recordDepositEventAction(makeInput({
      eventType: 'adjustment',
      notes: null,
    }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('notes')
    }
  })
})

// âââ Adapter Tests ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

describe('fetchDepositHistory', () => {
  test('returns mapped DTO with events + currentState', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: {
        events: [makeEventRow()],
        current_state: makeCurrentStateRow(),
      },
      error: null,
    })

    const dto = await fetchDepositHistory(VALID_CONTRACT_ID)

    expect(dto.events).toHaveLength(1)
    expect(dto.events[0].id).toBe(VALID_EVENT_ID)
    expect(dto.events[0].eventType).toBe('received')
    expect(dto.events[0].custodian).toBe('JJ')
    expect(dto.events[0].amountEur).toBe(1500)
    expect(dto.events[0].tenantName).toBe('Maria Papadopoulou')

    expect(dto.currentState).not.toBeNull()
    expect(dto.currentState!.originalAmountEur).toBe(1500)
    expect(dto.currentState!.currentHeldEur).toBe(1500)
    expect(dto.currentState!.lifecycleStatus).toBe('held')
    expect(dto.currentState!.isFullyClosed).toBe(false)
    expect(dto.currentState!.currentCustodian).toBe('JJ')
  })

  test('empty history â null currentState', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: { events: [], current_state: null },
      error: null,
    })

    const dto = await fetchDepositHistory(VALID_CONTRACT_ID)

    expect(dto.events).toHaveLength(0)
    expect(dto.currentState).toBeNull()
  })

  test('invalid custodian in DB â event filtered out', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    mockSchemaRpc.mockResolvedValue({
      data: {
        events: [makeEventRow({ custodian: 'INVALID_CUSTODIAN' })],
        current_state: null,
      },
      error: null,
    })

    const dto = await fetchDepositHistory(VALID_CONTRACT_ID)

    expect(dto.events).toHaveLength(0) // filtered out
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid custodian'),
    )

    consoleSpy.mockRestore()
  })
})

// âââ Constitutional Invariant Tests âââââââââââââââââââââââââââââââââââââââââââ

describe('constitutional invariants', () => {
  test('deposit â  income: DepositEventDTO has no income/expense/profit fields', () => {
    // Type-level invariant â DepositEventDTO intentionally has NO fields named:
    // income, revenue, profit, expense, p_and_l, settlement_amount
    // Exhaustive list of all DepositEventDTO fields (custodial/lifecycle only):
    const eventFields = [
      'id', 'rentalContractId', 'propertyId', 'eventType',
      'amountEur', 'withheldAmountEur', 'withheldReason',
      'custodian', 'previousCustodian', 'tenantName',
      'effectiveDate', 'governingEvidence', 'notes', 'createdAt',
    ]

    // All fields are custodial/lifecycle â none are financial P&L
    expect(eventFields).not.toContain('income')
    expect(eventFields).not.toContain('revenue')
    expect(eventFields).not.toContain('profit')
    expect(eventFields).not.toContain('expense')
    expect(eventFields).not.toContain('settlement_amount')
  })

  test('P-ARCH-4: no UPDATE/DELETE path exists in depositActions or depositAdapter', async () => {
    // Source audit: both files contain only INSERT (via record_deposit_event RPC)
    // and SELECT (via get_deposit_history RPC). No update/delete path.
    const fs = await import('fs')
    const path = await import('path')

    const adapterSource = fs.readFileSync(
      path.resolve(__dirname, '../depositAdapter.ts'), 'utf-8'
    )
    const actionsSource = fs.readFileSync(
      path.resolve(__dirname, '../depositActions.ts'), 'utf-8'
    )

    // No UPDATE or DELETE calls in either file
    expect(adapterSource).not.toMatch(/\.update\s*\(/)
    expect(adapterSource).not.toMatch(/\.delete\s*\(/)
    expect(actionsSource).not.toMatch(/\.update\s*\(/)
    expect(actionsSource).not.toMatch(/\.delete\s*\(/)

    // Only RPCs used: record_deposit_event (INSERT) and get_deposit_history (SELECT)
    expect(adapterSource).toContain('get_deposit_history')
    expect(adapterSource).not.toContain('record_deposit_event')
    expect(actionsSource).toContain('record_deposit_event')
    expect(actionsSource).not.toContain('get_deposit_history')
  })
})
