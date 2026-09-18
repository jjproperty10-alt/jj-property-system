/**
 * JWT-context gate for public.apply_managed_property_identity_reassignment.
 * Matches lifecycle.assert_identity_reassignment_authorized():
 *   public.require_jj_staff(['ceo','finance_admin'])
 * No service_role bypass.
 */

import {
  IDENTITY_REASSIGNMENT_STAFF_ROLES,
  type IdentityReassignmentStaffRole,
} from './identityReassignmentTypes'

export class UnauthorizedIdentityReassignmentError extends Error {
  constructor(role: string) {
    super(`identity reassignment mutations require ceo or finance_admin (got "${role}")`)
    this.name = 'UnauthorizedIdentityReassignmentError'
  }
}

export type JwtDbRole = 'anon' | 'authenticated' | 'service_role' | null | undefined

export interface IdentityReassignmentRpcAuthInput {
  readonly jwtRole: JwtDbRole
  readonly staffRole?: string | null
  readonly spoofedRoleParam?: string | null
  readonly createdBy?: string | null
}

export function isIdentityReassignmentStaffRole(
  role: string | null | undefined,
): role is IdentityReassignmentStaffRole {
  return (IDENTITY_REASSIGNMENT_STAFF_ROLES as readonly string[]).includes(role ?? '')
}

export function assertIdentityReassignmentRpcAuthorized(input: IdentityReassignmentRpcAuthInput): void {
  void input.spoofedRoleParam
  void input.createdBy
  if (input.jwtRole === 'authenticated' && isIdentityReassignmentStaffRole(input.staffRole)) return
  throw new UnauthorizedIdentityReassignmentError(input.jwtRole ? String(input.jwtRole) : 'missing_jwt')
}
