/**
 * JWT-context gate for public monthly STR certification RPCs.
 * Matches finance.assert_str_monthly_settlement_authorized():
 *   public.require_jj_staff(['ceo','finance_admin'])
 * No service_role bypass.
 */

import {
  STR_MONTHLY_SETTLEMENT_STAFF_ROLES,
  type StrMonthlySettlementStaffRole,
} from './strMonthlySettlementCertificationTypes'

export class UnauthorizedStrMonthlySettlementError extends Error {
  constructor(role: string) {
    super(`monthly STR certifications require ceo or finance_admin (got "${role}")`)
    this.name = 'UnauthorizedStrMonthlySettlementError'
  }
}

export type JwtDbRole = 'anon' | 'authenticated' | 'service_role' | null | undefined

export interface StrMonthlySettlementRpcAuthInput {
  readonly jwtRole: JwtDbRole
  readonly staffRole?: string | null
}

export function isStrMonthlySettlementStaffRole(
  role: string | null | undefined,
): role is StrMonthlySettlementStaffRole {
  return (STR_MONTHLY_SETTLEMENT_STAFF_ROLES as readonly string[]).includes(role ?? '')
}

export function assertStrMonthlySettlementRpcAuthorized(
  input: StrMonthlySettlementRpcAuthInput,
): void {
  if (input.jwtRole === 'authenticated' && isStrMonthlySettlementStaffRole(input.staffRole)) {
    return
  }
  throw new UnauthorizedStrMonthlySettlementError(input.jwtRole ? String(input.jwtRole) : 'missing_jwt')
}
