/**
 * @module lifecycle
 * @description Public API for the Investment Lifecycle domain layer.
 *
 * Import from here, not from individual files:
 *   import { PartnerEntry, createPartnerEntry, ... } from '@/lib/lifecycle'
 *
 * This module is PURE — no DB, no HTTP, no side effects.
 * All functions are deterministic given their inputs.
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — M8-A: Pure Domain Layer
 */

// ── Core Types ───────────────────────────────────────────────────────────────
export type {
  ISODate,
  ISODateTime,
  Currency,
  BusinessFactStatus,
  EventNature,
  CapitalEventType,
  CapitalDirection,
  DispositionType,
  BusinessSource,
  LifecycleEventBase,
  Immutable,
  ConfirmedEvent,
  VoidedEvent,
  ValidationError,
  NeverInferInvariant,
  ValidationResult,
} from './types'

// ── Business Source / Provenance ─────────────────────────────────────────────
export {
  createBusinessSource,
  validateBusinessSource,
  isStrongEvidence,
  describeSource,
  buildDirectProvenance,
  buildComputedProvenance,
  pendingBusinessSource,
} from './provenance'

export type { ProvenanceChain } from './provenance'

// ── Base Lifecycle Event ──────────────────────────────────────────────────────
export {
  isConfirmedEvent,
  isVoidedEvent,
  isDraftEvent,
  isPendingVerification,
  isActiveEvent,
  isBusinessEvent,
  isAccountingEvent,
  isReplacementEvent,
  getActiveEvents,
  getEventsByType,
  getConfirmedEvents,
  sortByEffectiveDate,
  getEventsAsOf,
  createLifecycleEventBase,
  validateLifecycleEventBase,
  voidLifecycleEvent,
} from './lifecycleEvent'

export type { CreateLifecycleEventParams } from './lifecycleEvent'

// ── Property Acquisition ─────────────────────────────────────────────────────
export {
  createAcquisition,
  computeTotalJJCost,
  computeJJMarginFromEntry,
  computeJJNetCapitalAtRisk,
  validateAcquisition,
  getPartnerFacingFields,
} from './acquisition'

export type {
  PropertyAcquisition,
  CreateAcquisitionParams,
} from './acquisition'

// ── Partner Entry ─────────────────────────────────────────────────────────────
export {
  createPartnerEntry,
  computeRequiredEntryCapital,
  computeCapitalRemaining,
  isEntryFullyPaid,
  getPartnerView,
  validatePartnerEntry,
} from './partnerEntry'

export type {
  PartnerEntry,
  CreatePartnerEntryParams,
  PartnerEntryPartnerView,
} from './partnerEntry'

// ── Capital Events (Immutable Ledger) ─────────────────────────────────────────
export {
  createCapitalEvent,
  voidCapitalEvent,
  createReplacementCapitalEvent,
  getActiveLedger,
  sumCapitalPaid,
  sumCapitalContributions,
  sumDistributionsPaid,
  getEventsForPartnerEntry,
  computePartnerNetCapital,
  validateCapitalEvent,
} from './capitalEvent'

export type {
  CapitalEvent,
  CreateCapitalEventParams,
} from './capitalEvent'

// ── Ownership Periods ─────────────────────────────────────────────────────────
export {
  deriveJJSolePeriod,
  deriveOwnershipPeriodsFromSnapshots,
  getOwnershipAtDate,
  getCurrentOwnership,
  getPartnersInPeriod,
  getOwnershipSnapshot,
  closeOwnershipPeriod,
  validateNoGapsOrOverlaps,
  validateOwnershipPeriod,
} from './ownershipPeriod'

export type { OwnershipPeriod } from './ownershipPeriod'

// ── Property Disposition ──────────────────────────────────────────────────────
export {
  createDisposition,
  computeDispositionAllocations,
  verifyAllocationTotal,
  validateDisposition,
} from './disposition'

export type {
  PropertyDisposition,
  CreateDispositionParams,
  DispositionAllocation,
} from './disposition'

// ── Validation — "Never Infer" Invariants ─────────────────────────────────────
export {
  assertEntryValuationHasIndependentSource,
  assertCapitalPaidNotAssumedComplete,
  assertOwnershipPctFromAgreement,
  assertEntryDateFromLegalSource,
  assertEffectiveDateExplicit,
  assertProfitParticipationExplicit,
  validateNeverInferInvariants,
  validatePartnerEntryFull,
  validateOwnershipPeriodFull,
  NEVER_INFER_INVARIANTS,
} from './validation'

// ── Projections — Investment Summaries ───────────────────────────────────────
export {
  computeInvestmentSummary,
  buildPartnerFacingReport,
  buildJJInternalReport,
  computePartnerPortfolio,
} from './projections'

export type {
  OperationsInput,
  InvestmentLifecycleSummary,
  JJInternalFields,
  JJInternalInvestmentReport,
  PartnerInvestmentReport,
  PartnerPortfolioSummary,
} from './projections'
