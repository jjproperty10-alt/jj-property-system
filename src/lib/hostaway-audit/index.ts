/**
 * Hostaway Property Audit — Public API barrel export.
 *
 * Sprint 2 Contract Hardening: DTOs + pure logic + read-only service.
 * Consumed by: CFO, Chief of Staff, Owner Workspace, PR #3 UI (future).
 */

// ── Types ──
export type {
  // Enums / unions
  ReservationStatus,
  BookingChannel,
  DateFilterMode,
  AuditMatchState,
  DifferenceDirection,
  FinancialLineType,
  AuditHealth,
  FinancialSource,
  // Core DTOs
  AuthoritativeAmount,
  ReservationFinancials,
  ReservationAuditDTO,
  AuditDifferenceDTO,
  PropertyAuditSummaryDTO,
  ChannelBreakdown,
  HostawayPropertyAuditDTO,
  DataSourceRef,
  // Comparison model (Sprint 2)
  JjPeriodAggregate,
  PeriodComparison,
  AuditLimitations,
  EvidenceQuality,
  // Service contract
  PropertyAuditRequest,
  PropertyAuditResult,
  IPropertyAuditService,
  AuditableProperty,
} from './types';

// ── Status rules ──
export { isRevenueEligible, REVENUE_ELIGIBLE_STATUSES } from './types';

// ── Pure functions ──
export {
  parseAmount,
  normalizeChannel,
  computePayout,
  computePayoutWithAuthority,
  buildReservationFinancials,
} from './computeFinancials';
export type { RawReservationFinancials } from './computeFinancials';

export {
  matchReservations,
  findUnmatchedJjTransactions,
  // Sprint 2 granular API
  parsePeriodFromDescription,
  stayOverlapsPeriod,
  buildJjPeriodAggregates,
  buildPeriodComparisons,
  assignAuditStates,
} from './matchReservations';
export type {
  JjAirbnbTransaction,
  CanonicalReservationRow,
} from './matchReservations';

// ── Service ──
export { PropertyAuditService } from './propertyAuditService';
