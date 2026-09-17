/**
 * JWT-context gate for public client-settlement RPCs.
 * Matches finance.assert_client_settlement_authorized():
 *   public.require_jj_staff(['ceo','finance_admin'])
 * No service_role bypass. created_by / spoofed params are ignored.
 */

import { CLIENT_SETTLEMENT_STAFF_ROLES, type ClientSettlementStaffRole } from './clientSettlementTypes'

export class UnauthorizedClientSettlementError extends Error {
  constructor(role: string) {
    super(`client settlement mutations require ceo or finance_admin (got "${role}")`)
    this.name = 'UnauthorizedClientSettlementError'
  }
}

export type JwtDbRole = 'anon' | 'authenticated' | 'service_role' | null | undefined

export interface ClientSettlementRpcAuthInput {
  readonly jwtRole: JwtDbRole
  readonly staffRole?: string | null
  readonly spoofedRoleParam?: string | null
  readonly createdBy?: string | null
}

export function isClientSettlementStaffRole(
  role: string | null | undefined,
): role is ClientSettlementStaffRole {
  return (CLIENT_SETTLEMENT_STAFF_ROLES as readonly string[]).includes(role ?? '')
}

export function assertClientSettlementRpcAuthorized(input: ClientSettlementRpcAuthInput): void {
  void input.spoofedRoleParam
  void input.createdBy
  if (input.jwtRole === 'authenticated' && isClientSettlementStaffRole(input.staffRole)) return
  throw new UnauthorizedClientSettlementError(input.jwtRole ? String(input.jwtRole) : 'missing_jwt')
}
