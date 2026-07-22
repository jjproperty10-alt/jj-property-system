/**
 * @module dal/evaluateAccess
 * @description DAL v0.1 — Pure deterministic access evaluation.
 *
 * This function has NO side effects, NO database access, NO network calls.
 * It is a pure function: same inputs → same output → reproducible in tests.
 *
 * Constitutional laws enforced:
 *   DAL-1: Executives classify. DAL authorizes.
 *   DAL-2: Access is multi-dimensional (awareness + view evaluated separately).
 *   DAL-5: No Executive grants access to its own output.
 *   DAL-6: Enforcement at the lowest reliable layer (this is above DB RLS).
 *   DAL-7: Every result includes reasonCodes, policyVersion, evaluatedAt.
 *   DAL-8: Policies encode business rules, not technical convenience.
 *
 * Fail-closed on every path:
 *   - No principal → deny
 *   - No policy found → deny
 *   - Company mismatch → deny
 *   - Role not in policy → deny
 *   - Entity scope required but missing/mismatched → deny
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md
 */

import type {
  DecisionAccessDeclaration,
  PrincipalContext,
  EffectiveDecisionAccess,
  DalReasonCode,
} from './types'
import { findPolicy, POLICY_VERSION, JJ_COMPANY_ID } from './policies'

// ─── Deny helper ──────────────────────────────────────────────────────────

function deny(reasonCode: DalReasonCode): EffectiveDecisionAccess {
  return {
    awareness: false,
    view: false,
    evidence: false,
    approve: false,
    execute: false,
    policyVersion: POLICY_VERSION,
    evaluatedAt: new Date().toISOString(),
    reasonCodes: [reasonCode],
  }
}

// ─── Allow helper ─────────────────────────────────────────────────────────

function allow(
  awareness: boolean,
  view: boolean,
  reasonCodes: DalReasonCode[],
): EffectiveDecisionAccess {
  return {
    awareness,
    view,
    evidence: false,
    approve: false,
    execute: false,
    policyVersion: POLICY_VERSION,
    evaluatedAt: new Date().toISOString(),
    reasonCodes,
  }
}

// ─── Entity scope matching ────────────────────────────────────────────────

/**
 * Check if the principal has matching entity scope for all decision entity scopes.
 * If the decision has no entity scopes, this returns true (company-wide decision).
 */
function hasMatchingEntityScope(
  principal: PrincipalContext,
  declaration: DecisionAccessDeclaration,
): boolean {
  if (declaration.entityScopes.length === 0) return true

  return declaration.entityScopes.every(decisionScope =>
    principal.entityScopes.some(
      principalScope =>
        principalScope.entityType === decisionScope.entityType &&
        principalScope.entityId === decisionScope.entityId,
    ),
  )
}

// ─── Main evaluation ──────────────────────────────────────────────────────

/**
 * Evaluate decision access for a principal against a declaration.
 *
 * Pure function — no side effects, no database, no network.
 * Deterministic: same inputs → same output.
 *
 * @param principal - Server-resolved identity and scope (never from client input)
 * @param declaration - Decision classification from the producing Executive
 * @returns EffectiveDecisionAccess with awareness, view, and audit metadata
 */
export function evaluateDecisionAccess(
  principal: PrincipalContext,
  declaration: DecisionAccessDeclaration,
): EffectiveDecisionAccess {
  // ── Gate 1: Company scope ─────────────────────────────────────────────
  // The principal must be a member of the company the decision belongs to.
  if (!principal.companyIds.includes(declaration.companyId)) {
    return deny('DENY_COMPANY_MISMATCH')
  }

  // ── Gate 2: Policy lookup ─────────────────────────────────────────────
  // Every declaration references a policy. Unknown policy = deny.
  const policy = findPolicy(declaration.policyId)
  if (!policy) {
    return deny('DENY_UNKNOWN_POLICY')
  }

  // ── Gate 3: Policy company scope ──────────────────────────────────────
  // The policy must belong to the same company as the declaration.
  if (policy.companyId !== declaration.companyId) {
    return deny('DENY_COMPANY_MISMATCH')
  }

  // ── Gate 4: Role-based awareness ──────────────────────────────────────
  const hasAwarenessRole = principal.roles.some(role =>
    policy.awarenessRoles.includes(role),
  )

  if (!hasAwarenessRole) {
    return deny('DENY_ROLE_INSUFFICIENT')
  }

  // ── Gate 5: Role-based view ───────────────────────────────────────────
  const hasViewRole = principal.roles.some(role =>
    policy.viewRoles.includes(role),
  )

  // ── Gate 6: Entity scope (when required by policy) ────────────────────
  // Entity-scoped policies remain FAIL-CLOSED in v0.1.
  // No inheritance, no bypass, no company-executive override.
  // The only path is explicit entity scope matching.
  if (policy.requireEntityScope) {
    if (!hasMatchingEntityScope(principal, declaration)) {
      return deny('DENY_ENTITY_MISMATCH')
    }
    // Entity scope matched — grant based on role
    const reasonCodes: DalReasonCode[] = []
    if (hasAwarenessRole) reasonCodes.push('ALLOW_ENTITY_SCOPE')
    if (hasViewRole) reasonCodes.push('ALLOW_ENTITY_SCOPE')

    return allow(hasAwarenessRole, hasViewRole, reasonCodes)
  }

  // ── Gate 7: Company-wide decision (no entity scope required) ──────────
  //
  // Two sub-paths:
  //
  // 7a: Company Executive View — when the policy explicitly declares that
  //     a verified company executive may receive company-wide Awareness
  //     and View. This is the approved v0.1 mechanism for M0 Executive Brief.
  //
  //     Business rule (approved by Yossi, 22 July 2026):
  //       A verified company executive of Company A may receive Awareness
  //       + View for company-wide decisions belonging to Company A.
  //       Cross-company → denied (Gate 1). Role alone → never sufficient
  //       (Gate 4). Company membership alone → never sufficient (Gate 1+3).
  //
  //     v0.1: 'superadmin' serves as temporary proxy for "verified company
  //     executive" because jj_staff_config (which defines the explicit 'ceo'
  //     staff_role) is not yet in production. When jj_staff_config deploys,
  //     this check should require verified CEO authority, not just 'superadmin'.
  //     This is a TEMPORARY role mapping, documented as NEEDS_CEO_ROLE_CONTRACT.
  //
  // 7b: Standard company-wide access — role matched but no special
  //     executive declaration.
  //
  const reasonCodes: DalReasonCode[] = []

  if (
    policy.allowCompanyExecutiveView &&
    principal.roles.includes('superadmin')
  ) {
    // 7a: Company Executive View — explicit policy capability
    reasonCodes.push('ALLOW_COMPANY_EXECUTIVE_VIEW')
  } else if (principal.roles.includes('superadmin')) {
    // 7b: CEO/superadmin on company-wide policy without executive view flag
    reasonCodes.push('ALLOW_CEO_FULL_ACCESS')
  } else {
    // 7b: Non-CEO role with company-wide access
    reasonCodes.push('ALLOW_COMPANY_SCOPE')
  }

  return allow(hasAwarenessRole, hasViewRole, reasonCodes)
}
