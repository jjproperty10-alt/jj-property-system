/**
 * ownerStrCockpit — server-only read composition for the Reservations "management cockpit".
 *
 * Reuses the certified PropertyAuditService (per-property Hostaway evidence) and the existing STR
 * reconciliation helper. Produces a per-canonical-property breakdown + a compact reconciliation row
 * per property + rollup totals. READ-ONLY. No writes, no new financial authority, aggregates never split.
 */
import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { PropertyAuditService, isRevenueEligible } from '@/lib/hostaway-audit'
import { getStrReconciliationByName } from './ownerStrAuditAdapter'
import { buildStrStatementLine, type StrLineEvidence } from '@/lib/report/str/strStatementLine'

export interface StrPropertyBreakdown {
  readonly propertyId: string
  readonly propertyName: string
  readonly confirmed: number
  readonly cancelled: number
  readonly nights: number
  readonly revenueEur: number | null   // Hostaway payout evidence (engine)
  /** Derived Net Owner Payout (certified statement line logic). null = Needs Review (never 0). */
  readonly netOwnerPayoutEur: number | null
  readonly nextCheckIn: string | null
  readonly status: 'active' | 'idle'   // has an upcoming check-in in range vs none
}

export interface StrReconRow {
  readonly propertyName: string
  readonly hostawayEvidenceEur: number | null
  readonly jjLedgerEur: number | null
  readonly varianceEur: number | null
  readonly confidence: string
  readonly status: string          // match | variance | missing_in_jj | insufficient_evidence | no_activity | ...
  readonly reviewReason: string | null
  readonly hasEngagement: boolean
}

export interface OwnerStrCockpit {
  readonly breakdown: readonly StrPropertyBreakdown[]
  readonly reconciliation: readonly StrReconRow[]
  readonly totals: { confirmed: number; cancelled: number; nights: number; revenueEur: number | null; netOwnerPayoutEur: number | null }
}

export interface OwnerStrCockpitInput {
  readonly properties: readonly { id: string; name: string }[]
  readonly startDate: string
  readonly endDate: string
  readonly today?: string
}

export async function buildOwnerStrCockpit(input: OwnerStrCockpitInput): Promise<OwnerStrCockpit> {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const sb = createServiceClient()
  const audit = new PropertyAuditService(sb)

  const breakdown: StrPropertyBreakdown[] = []
  const reconciliation: StrReconRow[] = []

  for (const p of input.properties) {
    // ── Per-property operational breakdown (engine evidence) ──
    let confirmed = 0, cancelled = 0, nights = 0
    let revenueEur: number | null = null
    let netOwnerPayoutEur: number | null = null
    let nextCheckIn: string | null = null
    const res = await audit.auditProperty({ jjPropertyName: p.name, dateFrom: input.startDate, dateTo: input.endDate })
    if (res.success && res.audit) {
      const s = res.audit.summary
      confirmed = s.confirmedReservations + s.modifiedReservations
      cancelled = s.cancelledReservations
      revenueEur = s.hostawayTotalPayout.amount
      for (const r of res.audit.reservations) {
        if (!isRevenueEligible(r.status)) continue
        nights += r.nights ?? 0
        if (r.checkIn >= today && (nextCheckIn === null || r.checkIn < nextCheckIn)) nextCheckIn = r.checkIn
      }
      // Derived Net Owner Payout — certified statement line logic. Any unknown input (e.g. Booking
      // tax) => property net is Needs Review (null), never fabricated.
      let netSum = 0, netKnown = true, anyEligible = false
      for (const r of res.audit.reservations) {
        if (!isRevenueEligible(r.status)) continue
        anyEligible = true
        const f: any = r.financials
        const hostFee = f.hostServiceFee as number | null
        const commission = f.channelCommission as number | null
        const ev: StrLineEvidence = {
          reservationId: r.hostawayReservationId,
          channel: String(r.channel),
          grossEur: f.totalPrice ?? null,
          platformFeesEur: hostFee ?? commission ?? (r.channel === 'direct' ? 0 : null),
          platformFeesSource: hostFee != null ? 'hostaway:airbnbListingHostFee' : commission != null ? 'hostaway:channelCommissionAmount' : 'hostaway:none',
          cleaningEur: f.cleaningFee ?? null,
          taxesEur: f.taxAmount ?? null,
          platformPayoutEvidenceEur: f.payout?.amount ?? null,
        }
        const v = buildStrStatementLine(ev).netOwnerPayout.value
        if (v == null) netKnown = false; else netSum += v
      }
      netOwnerPayoutEur = anyEligible && netKnown ? Math.round(netSum * 100) / 100 : null
    }
    breakdown.push({
      propertyId: p.id, propertyName: p.name, confirmed, cancelled, nights, revenueEur,
      netOwnerPayoutEur, nextCheckIn, status: nextCheckIn ? 'active' : 'idle',
    })

    // ── Compact reconciliation (reuse existing month-aligned helper) ──
    const dto = await getStrReconciliationByName(p.name, input.startDate, input.endDate).catch(() => null)
    if (dto) {
      const period = dto.periods[0]
      reconciliation.push({
        propertyName: p.name,
        hostawayEvidenceEur: period?.hostawayAmount ?? null,
        jjLedgerEur: period?.jjAmount ?? null,
        varianceEur: period?.variance ?? null,
        confidence: period?.confidence ?? 'none',
        status: period?.status ?? (dto.hasActiveEngagement ? 'no_activity' : 'no_engagement'),
        reviewReason: period?.needsReviewReason ?? null,
        hasEngagement: dto.hasActiveEngagement,
      })
    } else {
      reconciliation.push({
        propertyName: p.name, hostawayEvidenceEur: null, jjLedgerEur: null, varianceEur: null,
        confidence: 'none', status: 'unavailable', reviewReason: 'Reconciliation unavailable', hasEngagement: false,
      })
    }
  }

  const anyRevNull = breakdown.some(b => b.revenueEur == null)
  const anyNetNull = breakdown.some(b => b.netOwnerPayoutEur == null)
  const totals = {
    confirmed: breakdown.reduce((a, b) => a + b.confirmed, 0),
    cancelled: breakdown.reduce((a, b) => a + b.cancelled, 0),
    nights: breakdown.reduce((a, b) => a + b.nights, 0),
    revenueEur: anyRevNull ? null : Math.round(breakdown.reduce((a, b) => a + (b.revenueEur ?? 0), 0) * 100) / 100,
    netOwnerPayoutEur: anyNetNull ? null : Math.round(breakdown.reduce((a, b) => a + (b.netOwnerPayoutEur ?? 0), 0) * 100) / 100,
  }
  return { breakdown, reconciliation, totals }
}
