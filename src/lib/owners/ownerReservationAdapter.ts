/**
 * ownerReservationAdapter — Hostaway Audit consumer for Owner Reservations tab.
 *
 * G3-B: Owner Workspace Reservations Hostaway Alignment (2026-07-25).
 * Architecture: OwnerReservationService → OwnerReservationAdapter → Hostaway Audit
 *
 * Responsibility:
 * - Creates PropertyAuditService via createServiceClient()
 * - Calls auditProperty() per verified owner property
 * - Maps ReservationAuditDTO[] → ReservationRowDTO[] with guest masking
 * - Aggregates OwnerReservationSummaryDTO from engine-computed audit summaries
 *
 * Constraints:
 * - Never reads pms.* schemas directly (G3-2)
 * - Never performs local payout/revenue arithmetic (G3-5)
 * - Never fabricates values — unavailable data is null (G3-9, G3-10)
 * - Does not import from ownerFinancialAdapter / ownerMaintenanceAdapter (G3-18)
 *
 * Guest masking (G3-19, locked decision 2026-07-25):
 * - active/upcoming reservation (checkOut >= today): full guest name
 * - historical reservation (checkOut < today): "[Guest]"
 * - null guest name: remains null (P-ARCH-1)
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { PropertyAuditService, isRevenueEligible } from '@/lib/hostaway-audit'
import type {
  IPropertyAuditService,
  ReservationAuditDTO,
  ReservationStatus,
  BookingChannel,
  HostawayPropertyAuditDTO,
  PropertyAuditResult,
} from '@/lib/hostaway-audit'
import type {
  OwnerReservationSummaryDTO,
  ReservationRowDTO,
  ReservationChannelDTO,
} from './ownerWorkspaceTypes'

// ─── Adapter input ────────────────────────────────────────────────────────────

export interface OwnerReservationAdapterInput {
  /** Verified property names from identity resolver (management_relationship) */
  readonly properties: readonly string[]
  readonly startDate: string  // ISO date
  readonly endDate: string    // ISO date
  /**
   * Represents "today" for guest masking. Injectable for deterministic tests.
   * Defaults to the current date when not provided.
   */
  readonly today?: string     // ISO date e.g. "2026-07-25"
}

// ─── Guest masking (G3-19) ────────────────────────────────────────────────────

/**
 * Apply deterministic guest masking rule.
 *
 * Locked decision (G3-B, 2026-07-25):
 *   active/upcoming (checkOut >= today) → full guest name
 *   historical     (checkOut <  today) → "[Guest]"
 *   null                               → null (P-ARCH-1: null is not fabricated)
 *
 * @param guestName  Raw guest name from Hostaway (may be null)
 * @param checkOut   ISO date of reservation checkout (e.g. "2026-07-25")
 * @param today      ISO date representing "today" — injected by callers for testability
 */
export function maskGuestName(
  guestName: string | null,
  checkOut: string,
  today: string,
): string | null {
  if (guestName === null) return null
  return checkOut < today ? '[Guest]' : guestName
}

// ─── Status mapping ──────────────────────────────────────────────────────────

type OwnerResStatus = ReservationRowDTO['status']

/**
 * Map Hostaway audit status to owner-facing display status.
 *
 * Mapping rationale (documented — not fabricated):
 *   confirmed  → confirmed (direct)
 *   modified   → confirmed (modification of an active booking)
 *   cancelled  → cancelled (direct)
 *   inquiry    → confirmed (pending inquiry, not yet cancelled)
 *   owner_stay → confirmed (occupied night — shown in owner calendar)
 *   unknown    → confirmed (safest non-cancelled default)
 */
function mapStatus(status: ReservationStatus): OwnerResStatus {
  switch (status) {
    case 'confirmed':  return 'confirmed'
    case 'modified':   return 'confirmed'
    case 'cancelled':  return 'cancelled'
    case 'inquiry':    return 'confirmed'
    case 'owner_stay': return 'confirmed'
    default:           return 'confirmed'
  }
}

// ─── Channel label ────────────────────────────────────────────────────────────

function channelLabel(channel: BookingChannel): string {
  switch (channel) {
    case 'airbnb':   return 'Airbnb'
    case 'booking':  return 'Booking.com'
    case 'direct':   return 'Direct'
    case 'homeaway': return 'HomeAway'
    case 'other':    return 'Other'
    default:         return String(channel)
  }
}

// ─── Single reservation mapping ───────────────────────────────────────────────

function mapReservationToRow(
  res: ReservationAuditDTO,
  jjPropertyName: string,
  today: string,
): ReservationRowDTO {
  return {
    id:          res.hostawayReservationId,
    // Apply guest masking — historical reservations anonymised (G3-19)
    guestName:   maskGuestName(res.guestName, res.checkOut, today),
    propertyName: jjPropertyName,
    channel:     channelLabel(res.channel),
    checkIn:     res.checkIn,
    checkOut:    res.checkOut,
    nights:      res.nights,
    // Preserve authoritative payout — String conversion only, no arithmetic (G3-5)
    revenueEur:  res.financials.payout.amount != null
                   ? String(res.financials.payout.amount)
                   : null,
    status:      mapStatus(res.status),
    source:      'hostaway',
    evidenceRef: null,
  }
}

// ─── Channel mix from audit engine ───────────────────────────────────────────

/**
 * Build channel mix from audit engine's channelBreakdown (authoritative).
 * Uses engine-computed totalPayout per channel — no local revenue arithmetic (G3-5).
 * Null propagation: if any property has unknown payout, that channel total is null.
 */
function buildChannelMixFromAudit(
  audits: readonly HostawayPropertyAuditDTO[],
): ReservationChannelDTO[] {
  const channelMap = new Map<string, { count: number; payout: number | null }>()

  for (const audit of audits) {
    for (const cb of audit.summary.channelBreakdown) {
      const label = channelLabel(cb.channel)
      const existing = channelMap.get(label) ?? { count: 0, payout: 0 }
      channelMap.set(label, {
        count:  existing.count + cb.reservationCount,
        // Null propagation: any null makes the total unknown
        payout: (existing.payout !== null && cb.totalPayout !== null)
                  ? existing.payout + cb.totalPayout
                  : null,
      })
    }
  }

  const totalCount = Array.from(channelMap.values()).reduce((s, e) => s + e.count, 0) || 1

  return Array.from(channelMap.entries()).map(([channel, { count, payout }]): ReservationChannelDTO => ({
    channel,
    count,
    revenueEur: payout != null ? String(Math.round(payout * 100) / 100) : null,
    pct:        Math.round((count / totalCount) * 100),
  }))
}

// ─── Empty fallback ──────────────────────────────────────────────────────────

function emptyReservationSummary(
  startDate: string,
  endDate: string,
): OwnerReservationSummaryDTO {
  return {
    period: { startDate, endDate },
    portfolio: {
      totalReservations: 0,
      occupancyPct:      null,
      revenueEur:        null,
      adr:               null,
      revPar:            null,
      cancellations:     0,
    },
    channelMix:   [],
    reservations: [],
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch reservation summary for owner's properties from Hostaway Audit.
 *
 * Calls auditProperty() per property in parallel (Promise.allSettled).
 * Failed audits (including unmapped properties) are skipped gracefully —
 * partial data is preferred over total failure.
 *
 * Financial aggregation uses engine-computed summary totals only.
 * No per-reservation payout arithmetic is performed (G3-5).
 */
export async function fetchOwnerReservations(
  input: OwnerReservationAdapterInput,
): Promise<OwnerReservationSummaryDTO> {
  const { properties, startDate, endDate } = input
  const today = input.today ?? new Date().toISOString().slice(0, 10)

  if (properties.length === 0) {
    return emptyReservationSummary(startDate, endDate)
  }

  const sb = createServiceClient()
  const auditService: IPropertyAuditService = new PropertyAuditService(sb)

  // Run audits in parallel — one per verified owner property
  const settled = await Promise.allSettled(
    properties.map(async (jjPropertyName) => {
      const result: PropertyAuditResult = await auditService.auditProperty({
        jjPropertyName,
        dateFrom: startDate,
        dateTo:   endDate,
      })
      return { jjPropertyName, result }
    }),
  )

  // Collect successful audits — failed/unmapped properties are silently skipped
  const successfulAudits = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ jjPropertyName: string; result: PropertyAuditResult }> =>
        r.status === 'fulfilled',
    )
    .map(r => r.value)
    .filter(({ result }) => result.success && result.audit != null)
    .map(({ jjPropertyName, result }) => ({ jjPropertyName, audit: result.audit! }))

  if (successfulAudits.length === 0) {
    return emptyReservationSummary(startDate, endDate)
  }

  // Aggregate from engine-computed summaries (not per-reservation arithmetic)
  const allReservations: ReservationRowDTO[] = []
  let totalRevEligible = 0
  let cancellations    = 0
  let payoutSum        = 0
  let payoutKnown      = true

  for (const { jjPropertyName, audit } of successfulAudits) {
    const { summary, reservations } = audit
    totalRevEligible += summary.revenueEligibleReservations
    cancellations    += summary.cancelledReservations

    // Use engine-computed property total — not per-reservation sum (G3-5)
    if (summary.hostawayTotalPayout.amount != null) {
      payoutSum += summary.hostawayTotalPayout.amount
    } else {
      payoutKnown = false  // propagate null: any unknown makes total unknown
    }

    for (const res of reservations) {
      allReservations.push(mapReservationToRow(res, jjPropertyName, today))
    }
  }

  const channelMix = buildChannelMixFromAudit(successfulAudits.map(a => a.audit))

  return {
    period: { startDate, endDate },
    portfolio: {
      totalReservations: totalRevEligible,
      occupancyPct:      null,   // requires room count — RC2 scope
      revenueEur:        payoutKnown
                           ? String(Math.round(payoutSum * 100) / 100)
                           : null,
      adr:               null,   // requires room count — RC2 scope
      revPar:            null,   // requires room count — RC2 scope
      cancellations,
    },
    channelMix,
    reservations: allReservations,
  }
}


// ─── Reservation activity probe (month navigation) ────────────────────────────

export interface ReservationActivityDTO {
  /** Sorted unique YYYY-MM months that have >=1 revenue-eligible Hostaway reservation (by check-in). */
  readonly activeMonths: readonly string[]
  /** Latest active YYYY-MM, or null when the owner has no revenue-eligible reservations at all. */
  readonly latestActiveMonth: string | null
}

/**
 * Probe which months have revenue-eligible Hostaway activity for an owner's properties.
 * Read-only. Counting only — no revenue arithmetic (G3-5). Wide window so month navigation
 * and the "latest active period" hint reflect the full booking history (past + future).
 * Failed/unmapped properties are skipped gracefully (partial data preferred over total failure).
 */
export async function fetchReservationActivity(
  input: OwnerReservationAdapterInput,
): Promise<ReservationActivityDTO> {
  const { properties } = input
  if (properties.length === 0) return { activeMonths: [], latestActiveMonth: null }

  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const y = Number(today.slice(0, 4))
  const wideStart = `${y - 3}-01-01`
  const wideEnd = `${y + 2}-12-31`

  const sb = createServiceClient()
  const auditService: IPropertyAuditService = new PropertyAuditService(sb)

  const settled = await Promise.allSettled(
    properties.map((jjPropertyName) =>
      auditService.auditProperty({ jjPropertyName, dateFrom: wideStart, dateTo: wideEnd }),
    ),
  )

  const months = new Set<string>()
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    const audit = r.value.audit
    if (!r.value.success || audit == null) continue
    for (const res of audit.reservations) {
      // Revenue-eligible only (confirmed/modified) — cancelled/inquiry excluded from "activity".
      if (!isRevenueEligible(res.status)) continue
      if (typeof res.checkIn === 'string' && res.checkIn.length >= 7) {
        months.add(res.checkIn.slice(0, 7))
      }
    }
  }

  const activeMonths = Array.from(months).sort()
  return {
    activeMonths,
    latestActiveMonth: activeMonths.length > 0 ? activeMonths[activeMonths.length - 1] : null,
  }
}
