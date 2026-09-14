/**
 * JWT-context gate for finance owner-link RPCs.
 * Mirrors finance.assert_owner_link_authorized():
 *   IF auth.role() = 'service_role' THEN trusted server
 *   ELSE public.require_jj_staff(['ceo','finance_admin'])
 *
 * Authorization reads JWT database context only.
 * created_by / notes / spoofed RPC parameters are ignored.
 */

import { UnauthorizedClientWriteError } from './ownerLevelPaymentTypes'

export type JwtDbRole = 'anon' | 'authenticated' | 'service_role' | null | undefined

export const OWNER_LINK_STAFF_ROLES = ['ceo', 'finance_admin'] as const
export type OwnerLinkStaffRole = (typeof OWNER_LINK_STAFF_ROLES)[number]

export interface OwnerLinkRpcAuthInput {
  readonly jwtRole: JwtDbRole
  readonly staffRole?: string | null
  /** Ignored — must never grant access. */
  readonly spoofedRoleParam?: string | null
  readonly createdBy?: string | null
}

export function isOwnerLinkStaffRole(role: string | null | undefined): role is OwnerLinkStaffRole {
  return role === 'ceo' || role === 'finance_admin'
}

export function assertOwnerLinkRpcAuthorized(input: OwnerLinkRpcAuthInput): void {
  void input.spoofedRoleParam
  void input.createdBy
  if (input.jwtRole === 'service_role') return
  if (input.jwtRole === 'authenticated' && isOwnerLinkStaffRole(input.staffRole)) return
  throw new UnauthorizedClientWriteError(input.jwtRole ? String(input.jwtRole) : 'missing_jwt')
}
