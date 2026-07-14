/**
 * @module lifecycle/timelineProjection
 * @description Pure projection: raw lifecycle DB rows → InvestmentTimelineEventDTO[]
 *
 * No side effects. No DB calls. No inferred business facts.
 * Ordering, visibility, and running sums are computed here.
 *
 * Input rows are expected to be pre-filtered (status != 'void').
 * The caller (timelineService) is responsible for filtering void rows.
 *
 * @see TIMELINE_ORDERING_RULES in timelineTypes.ts
 * @see timelineVisibility.ts for partner visibility rules
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 */

import type {
  InvestmentTimelineEventDTO,
  InvestmentTimelineDTO,
  TimelineEventNature,
  TimelineDateConfidence,
} from './timelineTypes'

import {
  isCapitalEventVisible,
  isPartnerEntryVisible,
  isOwnershipPeriodVisible,
  toPartnerSourceLabel,
  toPartnerSourceReference,
  computeEventTitle,
} from './timelineVisibility'

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB row types (server-side only)
// These mirror the lifecycle table columns queried by timelineService.
// ─────────────────────────────────────────────────────────────────────────────

export interface RawPartnerEntryRow {
  id: string
  property_name: string
  entity_id: string
  event_type: string
  event_nature: string
  entry_date: string | null
  entry_date_note: string | null
  ownership_pct: number
  agreed_entry_valuation_eur: number | null
  required_entry_capital_eur: number | null
  status: string
  created_at: string
  business_source_type?: string | null
}

export interface RawCapitalEventRow {
  id: string
  property_name: string
  entity_id: string
  event_type: string
  event_subtype: string
  event_nature: string
  direction: string
  amount_eur: number
  effective_date: string | null
  effective_date_confidence: string | null
  description: string | null
  payer_name: string | null
  payee_name: string | null
  status: string
  created_at: string
  business_source_type?: string | null
}

export interface RawOwnershipPeriodRow {
  id: string
  property_name: string
  entity_id: string
  event_type: string
  event_nature: string
  ownership_pct: number
  effective_from: string | null
  effective_from_confidence: string | null
  effective_to: string | null
  status: string
  created_at: string
  business_source_type?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveConfidence(raw: string | null | undefined): TimelineDateConfidence {
  if (raw === 'confirmed') return 'confirmed'
  if (raw === 'estimated') return 'estimated'
  return 'pending_verification'
}

function resolveNature(raw: string | null | undefined): TimelineEventNature {
  if (raw === 'business_event') return 'business_event'
  if (raw === 'reporting_event') return 'reporting_event'
  return 'accounting_event'
}

// ─────────────────────────────────────────────────────────────────────────────
// Ordering comparator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two timeline events per TIMELINE_ORDERING_RULES:
 * 1. Dated events before null-date events
 * 2. effectiveDate ASC
 * 3. recordedAt ASC
 * 4. canonicalEventId ASC (deterministic UUID tie-breaker)
 */
function compareTimelineEvents(
  a: InvestmentTimelineEventDTO,
  b: InvestmentTimelineEventDTO,
): number {
  const aHasDate = a.effectiveDate !== null
  const bHasDate = b.effectiveDate !== null

  if (aHasDate && !bHasDate) return -1
  if (!aHasDate && bHasDate) return 1

  if (aHasDate && bHasDate) {
    if (a.effectiveDate! < b.effectiveDate!) return -1
    if (a.effectiveDate! > b.effectiveDate!) return 1
  }

  if (a.recordedAt < b.recordedAt) return -1
  if (a.recordedAt > b.recordedAt) return 1

  return a.canonicalEventId < b.canonicalEventId ? -1 : 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Capital inflow running sum
// ─────────────────────────────────────────────────────────────────────────────

type CapitalInflowSubtype = 'partner_entry_payment' | 'partner_acquisition_payment'

const CAPITAL_INFLOW_SUBTYPES = new Set<string>([
  'partner_entry_payment',
  'partner_acquisition_payment',
])

/**
 * Build a map from capital_event.id → running capital sum AFTER that event.
 *
 * Only inflow events (direction='inflow') with a capital-payment subtype are counted.
 * Events are sorted by (effective_date ASC, created_at ASC, id ASC) before accumulation,
 * matching the chronological story of capital being paid in.
 *
 * P-ARCH-1: we never replace a null effective_date with a synthetic date;
 * null-date payments sort last in the accumulation.
 */
function buildCapitalRunningMap(rows: RawCapitalEventRow[]): Map<string, number> {
  const inflowRows = rows
    .filter(r => CAPITAL_INFLOW_SUBTYPES.has(r.event_subtype) && r.direction === 'inflow')
    .sort((a, b) => {
      const aDate = a.effective_date ?? ''
      const bDate = b.effective_date ?? ''
      if (aDate < bDate) return -1
      if (aDate > bDate) return 1
      if (a.created_at < b.created_at) return -1
      if (a.created_at > b.created_at) return 1
      return a.id < b.id ? -1 : 1
    })

  let running = 0
  const map = new Map<string, number>()
  for (const r of inflowRows) {
    running += r.amount_eur
    map.set(r.id, running)
  }
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-event projection functions
// ─────────────────────────────────────────────────────────────────────────────

function projectPartnerEntryRow(
  row: RawPartnerEntryRow,
  entityId: string,
  investorName: string,
): InvestmentTimelineEventDTO {
  return {
    eventId:               row.id,
    canonicalEventId:      row.id,
    entityId,
    propertyName:          row.property_name,
    investorName,
    eventType:             'partner_entry',
    eventSubtype:          null,
    eventNature:           resolveNature(row.event_nature),
    effectiveDate:         row.entry_date,
    effectiveDateConfidence: row.entry_date ? 'pending_verification' : 'pending_verification',
    recordedAt:            row.created_at,
    title:                 computeEventTitle('partner_entry', null, null),
    description:           row.entry_date_note ?? null,
    amount:                row.required_entry_capital_eur ?? null,
    currency:              'EUR',
    ownershipPctBefore:    null,
    ownershipPctAfter:     row.ownership_pct,
    capitalPositionAfter:  null,
    settlementPositionAfter: null,
    status:                row.status,
    sourceLabel:           toPartnerSourceLabel(row.business_source_type ?? null),
    sourceReference:       toPartnerSourceReference(),
    partnerVisible:        isPartnerEntryVisible(),
  }
}

function projectCapitalEventRow(
  row: RawCapitalEventRow,
  entityId: string,
  investorName: string,
  capitalPositionAfter: number | null,
): InvestmentTimelineEventDTO {
  return {
    eventId:               row.id,
    canonicalEventId:      row.id,
    entityId,
    propertyName:          row.property_name,
    investorName,
    eventType:             'capital_event',
    eventSubtype:          row.event_subtype,
    eventNature:           resolveNature(row.event_nature),
    effectiveDate:         row.effective_date,
    effectiveDateConfidence: resolveConfidence(row.effective_date_confidence),
    recordedAt:            row.created_at,
    title:                 computeEventTitle('capital_event', row.event_subtype, row.direction),
    description:           row.description ?? null,
    amount:                row.amount_eur,
    currency:              'EUR',
    ownershipPctBefore:    null,
    ownershipPctAfter:     null,
    capitalPositionAfter,
    settlementPositionAfter: null,
    status:                row.status,
    sourceLabel:           toPartnerSourceLabel(row.business_source_type ?? null),
    sourceReference:       toPartnerSourceReference(),
    partnerVisible:        isCapitalEventVisible(row.event_subtype),
  }
}

function projectOwnershipPeriodRow(
  row: RawOwnershipPeriodRow,
  entityId: string,
  investorName: string,
  ownershipPctBefore: number | null,
): InvestmentTimelineEventDTO {
  return {
    eventId:               row.id,
    canonicalEventId:      row.id,
    entityId,
    propertyName:          row.property_name,
    investorName,
    eventType:             'ownership_period',
    eventSubtype:          null,
    eventNature:           resolveNature(row.event_nature),
    effectiveDate:         row.effective_from,
    effectiveDateConfidence: resolveConfidence(row.effective_from_confidence),
    recordedAt:            row.created_at,
    title:                 computeEventTitle('ownership_period', null, null),
    description:           null,
    amount:                null,
    currency:              null,
    ownershipPctBefore,
    ownershipPctAfter:     row.ownership_pct,
    capitalPositionAfter:  null,
    settlementPositionAfter: null,
    status:                row.status,
    sourceLabel:           toPartnerSourceLabel(row.business_source_type ?? null),
    sourceReference:       toPartnerSourceReference(),
    partnerVisible:        isOwnershipPeriodVisible(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main projection function
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectTimelineInput {
  entityId: string
  investorName: string
  /** Non-void partner_entry rows for this entity+property */
  partnerEntries: RawPartnerEntryRow[]
  /** Non-void capital_event rows for this entity+property */
  capitalEvents: RawCapitalEventRow[]
  /** Non-void ownership_period rows for this entity+property */
  ownershipPeriods: RawOwnershipPeriodRow[]
  /**
   * When false (default): only partnerVisible=true events are returned.
   * When true: all events (admin/internal view).
   */
  includeInternal?: boolean
}

/**
 * Project raw lifecycle DB rows into a sorted InvestmentTimelineEventDTO[].
 *
 * Guarantees:
 * - Only non-void rows are accepted (caller must pre-filter)
 * - Visibility rules applied per event type and subtype
 * - Events sorted per TIMELINE_ORDERING_RULES
 * - Running capital sum computed over inflow payments only
 * - ownershipPctBefore derived from chronological ordering of ownership_period rows
 * - null dates are preserved as-is (P-ARCH-1)
 */
export function projectTimeline(input: ProjectTimelineInput): InvestmentTimelineEventDTO[] {
  const { entityId, investorName, partnerEntries, capitalEvents, ownershipPeriods } = input
  const partnerOnly = !input.includeInternal

  const events: InvestmentTimelineEventDTO[] = []

  // ── partner_entry ──────────────────────────────────────────────────────────
  for (const row of partnerEntries) {
    const event = projectPartnerEntryRow(row, entityId, investorName)
    if (partnerOnly && !event.partnerVisible) continue
    events.push(event)
  }

  // ── capital_event ──────────────────────────────────────────────────────────
  const capitalRunningMap = buildCapitalRunningMap(capitalEvents)

  for (const row of capitalEvents) {
    const isInflowPayment =
      CAPITAL_INFLOW_SUBTYPES.has(row.event_subtype) && row.direction === 'inflow'
    const capitalAfter = isInflowPayment ? (capitalRunningMap.get(row.id) ?? null) : null
    const event = projectCapitalEventRow(row, entityId, investorName, capitalAfter)
    if (partnerOnly && !event.partnerVisible) continue
    events.push(event)
  }

  // ── ownership_period ───────────────────────────────────────────────────────
  // Sort periods chronologically to compute ownershipPctBefore correctly.
  const sortedOwnership = [...ownershipPeriods].sort((a, b) => {
    const aDate = a.effective_from ?? ''
    const bDate = b.effective_from ?? ''
    if (aDate < bDate) return -1
    if (aDate > bDate) return 1
    return a.created_at < b.created_at ? -1 : 1
  })

  let prevPct: number | null = null
  for (const row of sortedOwnership) {
    const event = projectOwnershipPeriodRow(row, entityId, investorName, prevPct)
    if (partnerOnly && !event.partnerVisible) continue
    events.push(event)
    prevPct = row.ownership_pct
  }

  // ── Sort and return ────────────────────────────────────────────────────────
  return events.sort(compareTimelineEvents)
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the evidence panel summary from projected events.
 *
 * @param events                 The projected (already-sorted) event list
 * @param openVerificationTasks  Count from lifecycle.verification_tasks (status=pending)
 */
export function computeEvidence(
  events: InvestmentTimelineEventDTO[],
  openVerificationTasks: number,
): InvestmentTimelineDTO['evidence'] {
  const hasPendingDates = events.some(
    e => e.effectiveDateConfidence === 'pending_verification',
  )
  return { openVerificationTasks, hasPendingDates }
}
