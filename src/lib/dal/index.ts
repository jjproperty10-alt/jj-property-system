/**
 * @module dal
 * @description Decision Access Layer v0.1 — barrel exports.
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md
 */

// Types
export type {
  DecisionAccessDeclaration,
  DecisionEntityScope,
  PrincipalContext,
  PrincipalEntityScope,
  EffectiveDecisionAccess,
  DalReasonCode,
  GovernancePolicy,
  PrincipalResolutionResult,
  PrincipalResolutionError,
  DecisionClassification,
} from './types'

// Evaluation (pure function — no side effects)
export { evaluateDecisionAccess } from './evaluateAccess'

// Policies
export { findPolicy, POLICY_VERSION, JJ_COMPANY_ID, GOVERNANCE_POLICIES } from './policies'

// Principal resolution (server-only — requires Next.js request context)
// NOTE: resolvePrincipal is NOT re-exported from the barrel because it
// imports 'server-only'. Consumers that need it import directly:
//   import { resolvePrincipal } from '@/lib/dal/resolvePrincipal'
// This prevents accidental client-side import of the barrel.
