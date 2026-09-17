jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockRpc = jest.fn()
jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({ rpc: mockRpc }),
}))

import {
  applyClientSettlementEventAction,
  approveClientSettlementEventAction,
  openClientSettlementEventAction,
  voidClientSettlementEventAction,
} from '../clientSettlementActions'
import { assertClientSettlementRpcAuthorized, UnauthorizedClientSettlementError } from '../clientSettlementRpcAuth'
import { CLIENT_SETTLEMENT_RPC } from '../clientSettlementTypes'

const ENTITY = '11111111-1111-4111-8111-111111111111'
const TX = '33333333-3333-4333-8333-333333333333'
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

describe('client settlement RPC auth', () => {
  test('ceo and finance_admin on authenticated JWT succeed', () => {
    expect(() => assertClientSettlementRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'ceo' })).not.toThrow()
    expect(() => assertClientSettlementRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'finance_admin' })).not.toThrow()
  })

  test('service_role, anon, operations, and spoofed createdBy fail', () => {
    expect(() => assertClientSettlementRpcAuthorized({ jwtRole: 'service_role', staffRole: 'ceo' })).toThrow(UnauthorizedClientSettlementError)
    expect(() => assertClientSettlementRpcAuthorized({ jwtRole: 'anon' })).toThrow(UnauthorizedClientSettlementError)
    expect(() => assertClientSettlementRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'operations' })).toThrow(UnauthorizedClientSettlementError)
    expect(() =>
      assertClientSettlementRpcAuthorized({
        jwtRole: 'anon',
        spoofedRoleParam: 'ceo',
        createdBy: 'ceo',
      }),
    ).toThrow(UnauthorizedClientSettlementError)
  })
})

describe('client settlement session-JWT actions', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRpc.mockReset()
    mockAuth.mockResolvedValue({ ok: true, userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', staffRole: 'ceo', isActive: true })
    mockRpc.mockResolvedValue({
      data: { id: EVENT, status: 'open', replay: false, inserted_count: 1 },
      error: null,
    })
  })

  test('unsigned and non-staff callers are rejected before RPC', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const noSession = await openClientSettlementEventAction({
      entityId: ENTITY,
      counterpartyEntityId: null,
      effectiveDate: '2026-08-05',
      eventType: 'include_transaction_in_settlement',
      settlementAmount: 100,
      sourceTransactionId: TX,
      reason: 'include',
      evidenceRef: 'ev',
      idempotencyKey: 'k1',
    })
    expect(noSession.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()

    mockAuth.mockResolvedValue({ ok: true, userId: 'x', staffRole: 'operations', isActive: true })
    const ops = await applyClientSettlementEventAction(EVENT)
    expect(ops.ok).toBe(false)
    if (!ops.ok) expect(ops.error).toMatch(/finance_admin/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('ceo open/approve/apply/void call public RPCs via session client', async () => {
    const opened = await openClientSettlementEventAction({
      entityId: ENTITY,
      counterpartyEntityId: null,
      effectiveDate: '2026-08-05',
      eventType: 'include_transaction_in_settlement',
      settlementAmount: 100,
      sourceTransactionId: TX,
      reason: 'include',
      evidenceRef: 'ev',
      idempotencyKey: 'k1',
    })
    expect(opened.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(CLIENT_SETTLEMENT_RPC.open, expect.objectContaining({
      p_entity_id: ENTITY,
      p_source_transaction_id: TX,
      p_event_type: 'include_transaction_in_settlement',
    }))

    mockRpc.mockResolvedValue({ data: { id: EVENT, status: 'approved', replay: false, inserted_count: 0 }, error: null })
    const approved = await approveClientSettlementEventAction(EVENT, 'ok')
    expect(approved.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(CLIENT_SETTLEMENT_RPC.approve, { p_id: EVENT, p_reason: 'ok' })

    mockRpc.mockResolvedValue({ data: { id: EVENT, status: 'applied', replay: false, inserted_count: 0 }, error: null })
    const applied = await applyClientSettlementEventAction(EVENT)
    expect(applied.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(CLIENT_SETTLEMENT_RPC.apply, { p_id: EVENT })

    mockRpc.mockResolvedValue({ data: { id: EVENT, status: 'void', replay: false, inserted_count: 0 }, error: null })
    const voided = await voidClientSettlementEventAction(EVENT, 'void it')
    expect(voided.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(CLIENT_SETTLEMENT_RPC.void, { p_id: EVENT, p_reason: 'void it' })
  })

  test('source audit: actions use session JWT and never service-role writes', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'clientSettlementActions.ts'), 'utf8')
    expect(src).toMatch(/createSupabaseServerClient/)
    expect(src).not.toMatch(/createServiceClient/)
    expect(src).toMatch(/authenticateStatementUser/)
    expect(src).not.toMatch(/from\('transactions'\)/)
    expect(src).not.toMatch(/ownerWorkspaceService/)
  })
})
