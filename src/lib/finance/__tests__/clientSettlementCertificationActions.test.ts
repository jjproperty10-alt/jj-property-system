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
  applyClientSettlementOpeningCertificationAction,
  voidClientSettlementOpeningCertificationAction,
} from '../clientSettlementCertificationActions'
import {
  assertClientSettlementCertificationRpcAuthorized,
  UnauthorizedClientSettlementCertificationError,
} from '../clientSettlementCertificationRpcAuth'
import { CLIENT_SETTLEMENT_CERTIFICATION_RPC } from '../clientSettlementCertificationTypes'

const ENTITY = '11111111-1111-4111-8111-111111111111'
const CERT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const validLines = [
  {
    line_order: 1,
    property_key: 'alpha-a',
    property_name: 'Alpha A',
    component_code: 'opening_balance',
    amount_due_to_jj: 10.01,
    reason: 'fixture a',
    evidence_ref: 'ev-a',
  },
  {
    line_order: 2,
    property_key: 'alpha-b',
    property_name: 'Alpha B',
    component_code: 'opening_balance',
    amount_due_to_jj: 20.02,
    reason: 'fixture b',
    evidence_ref: 'ev-b',
  },
  {
    line_order: 3,
    property_key: 'alpha-c',
    property_name: 'Alpha C',
    component_code: 'opening_balance',
    amount_due_to_jj: -3.53,
    reason: 'fixture c',
    evidence_ref: 'ev-c',
  },
]

const validInput = {
  entityId: ENTITY,
  asOf: '2026-08-31',
  reason: 'alpha opening',
  evidenceRef: 'ev',
  idempotencyKey: 'k1',
  version: 1,
  supersedesId: null,
  totalDueToJj: 26.5,
  lines: validLines,
}

describe('opening-obligation certification RPC auth', () => {
  test('ceo and finance_admin on authenticated JWT succeed', () => {
    expect(() =>
      assertClientSettlementCertificationRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'ceo' }),
    ).not.toThrow()
    expect(() =>
      assertClientSettlementCertificationRpcAuthorized({
        jwtRole: 'authenticated',
        staffRole: 'finance_admin',
      }),
    ).not.toThrow()
  })

  test('service_role, anon, operations, and spoofed createdBy fail', () => {
    expect(() =>
      assertClientSettlementCertificationRpcAuthorized({ jwtRole: 'service_role', staffRole: 'ceo' }),
    ).toThrow(UnauthorizedClientSettlementCertificationError)
    expect(() => assertClientSettlementCertificationRpcAuthorized({ jwtRole: 'anon' })).toThrow(
      UnauthorizedClientSettlementCertificationError,
    )
    expect(() =>
      assertClientSettlementCertificationRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'operations' }),
    ).toThrow(UnauthorizedClientSettlementCertificationError)
    expect(() =>
      assertClientSettlementCertificationRpcAuthorized({
        jwtRole: 'anon',
        spoofedRoleParam: 'ceo',
        createdBy: 'ceo',
      }),
    ).toThrow(UnauthorizedClientSettlementCertificationError)
  })
})

describe('opening-obligation session-JWT actions', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRpc.mockReset()
    mockAuth.mockResolvedValue({
      ok: true,
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      staffRole: 'ceo',
      isActive: true,
    })
    mockRpc.mockResolvedValue({
      data: { id: CERT, status: 'applied', replay: false, inserted_count: 3 },
      error: null,
    })
  })

  test('unsigned and non-staff callers are rejected before RPC', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const noSession = await applyClientSettlementOpeningCertificationAction(validInput)
    expect(noSession.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()

    mockAuth.mockResolvedValue({ ok: true, userId: 'x', staffRole: 'operations', isActive: true })
    const ops = await voidClientSettlementOpeningCertificationAction(CERT, 'void', 'ev')
    expect(ops.ok).toBe(false)
    if (!ops.ok) expect(ops.error).toMatch(/finance_admin/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('client-side sum mismatch and duplicate keys never reach RPC', async () => {
    const mismatch = await applyClientSettlementOpeningCertificationAction({
      ...validInput,
      totalDueToJj: 99.99,
    })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.error).toMatch(/sum of lines/)
    expect(mockRpc).not.toHaveBeenCalled()

    const dup = await applyClientSettlementOpeningCertificationAction({
      ...validInput,
      totalDueToJj: 20.02,
      lines: [validLines[0], { ...validLines[0], line_order: 2 }],
    })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error).toMatch(/duplicate line key/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('ceo apply/void call public RPCs via session client', async () => {
    const applied = await applyClientSettlementOpeningCertificationAction(validInput)
    expect(applied.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(
      CLIENT_SETTLEMENT_CERTIFICATION_RPC.apply,
      expect.objectContaining({
        p_entity_id: ENTITY,
        p_as_of: '2026-08-31',
        p_total_due_to_jj: 26.5,
        p_version: 1,
      }),
    )

    mockRpc.mockResolvedValue({
      data: { id: CERT, status: 'void', replay: false, inserted_count: 0 },
      error: null,
    })
    const voided = await voidClientSettlementOpeningCertificationAction(CERT, 'void it', 'ev')
    expect(voided.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(CLIENT_SETTLEMENT_CERTIFICATION_RPC.void, {
      p_id: CERT,
      p_reason: 'void it',
      p_evidence_ref: 'ev',
    })
  })

  test('source audit: actions use session JWT and never service-role writes or report wiring', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'clientSettlementCertificationActions.ts'), 'utf8')
    expect(src).toMatch(/createSupabaseServerClient/)
    expect(src).not.toMatch(/createServiceClient/)
    expect(src).toMatch(/authenticateStatementUser/)
    expect(src).not.toMatch(/from\('transactions'\)/)
    expect(src).not.toMatch(/ownerWorkspaceService/)
    expect(src).not.toMatch(/fetchRC3Report/)
  })
})
