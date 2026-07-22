/**
 * @module dal/types
 * @description Decision Access Layer v0.1 — Type Contracts.
 *
 * Constitutional foundation: ADR-003 Decision Access Layer.
 *
 * v0.1 scope: Awareness + View dimensions only.
 * Evidence, Approve, Execute dimensions are NOT implemented.
 *
 * DAL-1: Executives classify. DAL authorizes.
 * DAL-8: Access decisions are business decisions, not technical decisions.
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md
 */

import type { DigitalExecutive } from '../executive/executiveBriefTypes'

// ─── Decision Classification ──────────────────────────────────────────────

/**
 * Classification level of a decision.
 *
 * - internal: visible to all authenticated company members with matching scope
 * - confidential: visible only to roles with explicit policy grant
 * - restricted: visible only to the CEO or explicitly delegated roles
 */
export type DecisionClassification =
  | 'internal'
  | 'confidential'
  | 'restricted'

// ─── Decision Access Declaration ──────────────────────────────────────────

/**
 * Declares what a decision is and who it belongs to.
 * Produced by Digital Executives. Consumed by DAL.
 *
 * DAL-1: The Executive classifies. DAL authorizes.
 * DAL-5: No Executive may grant access to its own output.
 */
export interface DecisionAccessDeclaration {
  /** Identifies the type of decision (e.g., 'executive-brief', 'partner-statement') */
  readonly decisionType: string

  /** Which Digital Executive produced this decision */
  readonly executiveOwner: DigitalExecutive

  /** Sensitivity classification */
  readonly classification: DecisionClassification

  /** Company scope — 'jj' for single-company v0.1 */
  readonly companyId: string

  /** Entity-level scope. Empty = company-wide decision */
  readonly entityScopes: readonly DecisionEntityScope[]

  /** Which governance policy to evaluate */
  readonly policyId: string
}

/**
 * Entity-level scope for a decision.
 * v0.1 supports property-level and entity-level scoping.
 */
export interface DecisionEntityScope {
  readonly entityType: 'property' | 'entity' | 'company'
  readonly entityId: string
}

// ─── Principal Context ────────────────────────────────────────────────────

/**
 * Resolved identity and scope of the requesting user.
 * Produced by the principal resolver. Consumed by DAL.
 *
 * Never constructed from client input — always server-derived.
 */
export interface PrincipalContext {
  /** Supabase auth.users.id — server-verified via auth.getUser() */
  readonly userId: string

  /** Company membership — ['jj'] for single-company v0.1 */
  readonly companyIds: readonly string[]

  /** Roles from user_roles table */
  readonly roles: readonly string[]

  /** Entity-level scope the principal has access to */
  readonly entityScopes: readonly PrincipalEntityScope[]
}

/**
 * An entity the principal has access to.
 */
export interface PrincipalEntityScope {
  readonly entityType: 'property' | 'entity' | 'company'
  readonly entityId: string
  readonly accessLevel: 'owner' | 'admin' | 'viewer'
}

// ─── Effective Decision Access ────────────────────────────────────────────

/**
 * The result of DAL evaluation.
 *
 * v0.1: Only awareness and view are evaluated.
 * evidence, approve, execute are always false.
 *
 * DAL-7: Every access decision must be explainable and auditable.
 */
export interface EffectiveDecisionAccess {
  /** Can the principal know this decision exists? */
  readonly awareness: boolean

  /** Can the principal see the decision content? */
  readonly view: boolean

  /** v0.1: always false — not implemented */
  readonly evidence: false

  /** v0.1: always false — not implemented */
  readonly approve: false

  /** v0.1: always false — not implemented */
  readonly execute: false

  /** Which policy version was used for evaluation */
  readonly policyVersion: string

  /** When the evaluation occurred */
  readonly evaluatedAt: string

  /** Machine-readable explanation of each grant/deny */
  readonly reasonCodes: readonly string[]
}

// ─── Reason Codes ─────────────────────────────────────────────────────────

/**
 * Stable, machine-readable reason codes.
 * Keep this vocabulary small and stable (DAL-7).
 */
export type DalReasonCode =
  | 'ALLOW_CEO_FULL_ACCESS'
  | 'ALLOW_COMPANY_SCOPE'
  | 'ALLOW_ENTITY_SCOPE'
  | 'ALLOW_COMPANY_EXECUTIVE_VIEW'
  | 'DENY_UNAUTHENTICATED'
  | 'DENY_SCOPE_UNRESOLVED'
  | 'DENY_COMPANY_MISMATCH'
  | 'DENY_ENTITY_MISMATCH'
  | 'DENY_UNKNOWN_POLICY'
  | 'DENY_CLASSIFICATION_UNSUPPORTED'
  | 'DENY_ROLE_INSUFFICIENT'
  | 'DENY_V01_NOT_IMPLEMENTED'

// ─── Policy Definition ────────────────────────────────────────────────────

/**
 * A governance policy definition.
 * v0.1: hardcoded in dalPolicies.ts. Future: database-driven.
 *
 * DAL-8: Access decisions are business decisions, not technical decisions.
 * These policies encode business governance rules, not technical middleware.
 */
export interface GovernancePolicy {
  /** Unique policy identifier */
  readonly policyId: string

  /** Human-readable description */
  readonly description: string

  /** Which roles are granted awareness */
  readonly awarenessRoles: readonly string[]

  /** Which roles are granted view */
  readonly viewRoles: readonly string[]

  /** Whether entity-scope matching is required for non-CEO roles */
  readonly requireEntityScope: boolean

  /**
   * Whether a verified company executive may receive company-wide
   * Awareness + View on this policy.
   *
   * Semantic: "A verified company executive may view this company-wide
   * decision." This is company-level authorization, NOT entity-scope bypass.
   *
   * Business rule (approved 22 July 2026):
   *   Verified company executive of Company A → Awareness + View for
   *   company-wide decisions in Company A.
   *   Cross-company → denied. Role alone → never sufficient.
   *
   * v0.1: enabled ONLY for M0 company-wide Executive Brief.
   * Entity-scoped policies MUST keep this false — entity scope matching
   * is the only authorized path for entity-level decisions.
   *
   * v0.1 role mapping: 'superadmin' serves as temporary proxy for
   * "verified company executive" (NEEDS_CEO_ROLE_CONTRACT — jj_staff_config
   * not yet in production).
   */
  readonly allowCompanyExecutiveView: boolean

  /** The company this policy belongs to */
  readonly companyId: string
}

// ─── Principal Resolution ─────────────────────────────────────────────────

/**
 * Result of resolving an authenticated user to a PrincipalContext.
 */
export type PrincipalResolutionResult =
  | { readonly ok: true; readonly principal: PrincipalContext }
  | { readonly ok: false; readonly error: PrincipalResolutionError }

export type PrincipalResolutionError =
  | 'NO_SESSION'
  | 'NO_ROLE'
  | 'ROLE_INACTIVE'
