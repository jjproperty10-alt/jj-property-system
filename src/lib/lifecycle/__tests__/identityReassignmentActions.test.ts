jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockRpc = jest.fn()
jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({ rpc: mockRpc }),
}))

import { applyManagedPropertyIdentityReassignmentAction } from '../identityReassignmentActions'
import {
  assertIdentityReassignmentRpcAuthorized,
  UnauthorizedIdentityReassignmentError,
} from '../identityReassignmentRpcAuth'
import { IDENTITY_REASSIGNMENT_RPC } from '../identityReassignmentTypes'

const MR = '81818181-8181-4818-8818-818181818181'
const EPA = '91919191-9191-4919-8919-919191919191'
const SE = 'a1a1a1a1-a1a1-4aa1-8aa1-a1a1a1a1a1a1'
const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
const PROP = 'b1b1b1b1-b1b1-4bb1-8bb1-b1b1b1b1b1b1'
const OP = '0c0c0c0c-0c0c-40c0-80c0-0c0c0c0c0c0c'

const validInput = {
  managementRelationshipId: MR,
  entityPropertyAssociationId: EPA,
  serviceEngagementId: SE,
  expectedOldEntityId: OLD,
  newEntityId: NEW,
  expectedPropertyName: 'Test Managed Property',
  expectedCanonicalPropertyId: PROP,
  expectedServiceType: 'airbnb_str',
  reason: 'reassign',
  evidenceRef: 'ev',
  idempotencyKey: 'k1',
}

describe('identity reassignment RPC auth', () => {
  test('ceo and finance_admin on authenticated JWT succeed', () => {
    expect(() => assertIdentityReassignmentRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'ceo' })).not.toThrow()
    expect(() =>
      assertIdentityReassignmentRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'finance_admin' }),
    ).not.toThrow()
  })

  test('service_role, anon, operations, and spoofed createdBy fail', () => {
    expect(() =>
      assertIdentityReassignmentRpcAuthorized({ jwtRole: 'service_role', staffRole: 'ceo' }),
    ).toThrow(UnauthorizedIdentityReassignmentError)
    expect(() => assertIdentityReassignmentRpcAuthorized({ jwtRole: 'anon' })).toThrow(
      UnauthorizedIdentityReassignmentError,
    )
    expect(() =>
      assertIdentityReassignmentRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'operations' }),
    ).toThrow(UnauthorizedIdentityReassignmentError)
    expect(() =>
      assertIdentityReassignmentRpcAuthorized({
        jwtRole: 'anon',
        spoofedRoleParam: 'ceo',
        createdBy: 'ceo',
      }),
    ).toThrow(UnauthorizedIdentityReassignmentError)
  })
})

describe('identity reassignment session-JWT action', () => {
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
      data: {
        operation_id: OP,
        replay: false,
        idempotent: false,
        updated_count: 3,
        audit_count: 3,
        affected: {
          management_relationship_id: MR,
          entity_property_association_id: EPA,
          service_engagement_id: SE,
        },
        old_entity_id: OLD,
        new_entity_id: NEW,
        actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      error: null,
    })
  })

  test('unsigned and non-staff callers are rejected before RPC', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const noSession = await applyManagedPropertyIdentityReassignmentAction(validInput)
    expect(noSession.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()

    mockAuth.mockResolvedValue({ ok: true, userId: 'x', staffRole: 'operations', isActive: true })
    const ops = await applyManagedPropertyIdentityReassignmentAction(validInput)
    expect(ops.ok).toBe(false)
    if (!ops.ok) expect(ops.error).toMatch(/finance_admin/)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('ceo calls the public RPC via session client', async () => {
    const res = await applyManagedPropertyIdentityReassignmentAction(validInput)
    expect(res.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(IDENTITY_REASSIGNMENT_RPC, {
      p_management_relationship_id: MR,
      p_entity_property_association_id: EPA,
      p_service_engagement_id: SE,
      p_expected_old_entity_id: OLD,
      p_new_entity_id: NEW,
      p_expected_property_name: 'Test Managed Property',
      p_expected_canonical_property_id: PROP,
      p_expected_service_type: 'airbnb_str',
      p_reason: 'reassign',
      p_evidence_ref: 'ev',
      p_idempotency_key: 'k1',
    })
  })
})
