/**
 * JWT-context gate for public opening-certification RPCs.
 * Matches finance.assert_client_settlement_certification_authorized():
 *   public.require_jj_staff(['ceo','finance_admin'])
 * No service_role bypass. created_by / spoofed params are ignored.
 */

import {
  CLIENT_SETTLEMENT_CERTIFICATION_STAFF_ROLES,
  type ClientSettlementCertificationStaffRole,
} from './clientSettlementCertificationTypes'

export class UnauthorizedClientSettlementCertificationError extends Error {
  constructor(role: string) {
    super(`opening-obligation certifications require ceo or finance_admin (got "${role}")`)
    this.name = 'UnauthorizedClientSettlementCertificationError'
  }
}

export type JwtDbRole = 'anon' | 'authenticated' | 'service_role' | null | undefined

export interface ClientSettlementCertificationRpcAuthInput {
  readonly jwtRole: JwtDbRole
  readonly staffRole?: string | null
  readonly spoofedRoleParam?: string | null
  readonly createdBy?: string | null
}

export function isClientSettlementCertificationStaffRole(
  role: string | null | undefined,
): role is ClientSettlementCertificationStaffRole {
  return (CLIENT_SETTLEMENT_CERTIFICATION_STAFF_ROLES as readonly string[]).includes(role ?? '')
}

export function assertClientSettlementCertificationRpcAuthorized(
  input: ClientSettlementCertificationRpcAuthInput,
): void {
  void input.spoofedRoleParam
  void input.createdBy
  if (input.jwtRole === 'authenticated' && isClientSettlementCertificationStaffRole(input.staffRole)) {
    return
  }
  throw new UnauthorizedClientSettlementCertificationError(
    input.jwtRole ? String(input.jwtRole) : 'missing_jwt',
  )
}
