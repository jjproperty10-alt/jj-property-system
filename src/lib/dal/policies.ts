/**
 * @module dal/policies
 * @description DAL v0.1 Governance Policies — hardcoded.
 *
 * These encode the business governance decisions for JJ Property 10.
 * v0.1: hardcoded here. Future: database-driven policy store.
 *
 * DAL-8: Access decisions are business decisions, not technical decisions.
 * Each policy here was defined by a business governance decision, not
 * by engineering convenience.
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md — Section 14.1 (DAL v0.1 Scope)
 */

import type { GovernancePolicy } from './types'

/**
 * Policy version — bumped on every policy change.
 * Returned in every EffectiveDecisionAccess for auditability (DAL-7).
 */
export const POLICY_VERSION = 'dal-v0.1.1'

/**
 * The single company ID in v0.1.
 * JJ is a single-company system — no multi-tenancy.
 */
export const JJ_COMPANY_ID = 'jj'

/**
 * v0.1 Governance Policies.
 *
 * Business rules encoded:
 * 1. CEO (superadmin) sees everything — full awareness + view on all decisions.
 * 2. Partners see only their own property data — NOT the Executive Brief.
 * 3. The Executive Brief is an internal, restricted decision — CEO-only.
 */
export const GOVERNANCE_POLICIES: readonly GovernancePolicy[] = [
  {
    policyId: 'ceo-executive-brief',
    description: 'CEO has full awareness and view of the Executive Brief. Partners do not see internal operational data.',
    awarenessRoles: ['superadmin'],
    viewRoles: ['superadmin'],
    requireEntityScope: false,
    allowCompanyExecutiveView: true,
    companyId: JJ_COMPANY_ID,
  },
  {
    policyId: 'partner-own-statement',
    description: 'Partners can view their own property statements. Entity scope matching required.',
    awarenessRoles: ['superadmin', 'partner'],
    viewRoles: ['superadmin', 'partner'],
    requireEntityScope: true,
    allowCompanyExecutiveView: false,
    companyId: JJ_COMPANY_ID,
  },
  {
    policyId: 'admin-company-overview',
    description: 'Superadmin has awareness and view of all company-wide decisions.',
    awarenessRoles: ['superadmin'],
    viewRoles: ['superadmin'],
    requireEntityScope: false,
    allowCompanyExecutiveView: false,
    companyId: JJ_COMPANY_ID,
  },
]

/**
 * Look up a governance policy by ID.
 * Returns undefined if the policy is not found — caller must handle denial.
 */
export function findPolicy(policyId: string): GovernancePolicy | undefined {
  return GOVERNANCE_POLICIES.find(p => p.policyId === policyId)
}
