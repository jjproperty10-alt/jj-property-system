/**
 * ownerStrStatementService — server-only fetch layer for the owner STR statement.
 *
 * Hostaway reservation evidence via the certified PropertyAuditService; Expenses & Extras + Platform
 * Income reconciliation from JJ authoritative public.transactions (read-only). Composes via the pure
 * composeOwnerStrStatement. NO writes, no financial authority mutation, aggregate PI never split.
 */
import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { PropertyAuditService, isRevenueEligible, parsePeriodFromDescription } from '@/lib/hostaway-audit'
import { maskGuestName } from '@/lib/owners/ownerReservationAdapter'
import { composeOwnerStrStatement, isOwnerStatementExtra, type OwnerStrStatement, type StatementReservationEvidence, type StatementExtra } from './ownerStrStatement'
import { isBookingAccountVerifiedZero } from './bookingTaxPolicy'
import { getAuthoritativeStatementLine, belongsToStatementMonth } from './statementEvidence'

export interface OwnerStrStatementInput {
  readonly ownerName: string
  readonly properties: readonly { id: string; name: string }[]
  readonly startDate: string
  readonly endDate: string
  readonly periodLabel: string
  readonly today?: string
}

const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/** Map a certified audit reservation's financials -> statement evidence (channel-aware platform fee). */
function toEvidence(propertyName: string, r: any, today: string): StatementReservationEvidence {
  const f = r.financials
  const hostFee = f.hostServiceFee as number | null
  const commission = f.channelCommission as number | null
  const platformFeesEur = hostFee ?? commission ?? (r.channel === 'direct' ? 0 : null)
  const platformFeesSource = hostFee != null
    ? 'hostaway:airbnbListingHostFee'
    : commission != null
      ? 'hostaway:channelCommissionAmount'
      : r.channel === 'direct' ? 'direct:no_platform_fee' : 'hostaway:none'
  return {
    reservationId: r.hostawayReservationId,
    channel: String(r.channel),
    propertyName,
    guestName: maskGuestName(r.guestName ?? null, r.checkOut, today),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: r.nights,
    grossEur: f.totalPrice ?? null,
    platformFeesEur,
    platformFeesSource,
    cleaningEur: f.cleaningFee ?? null,
    taxesEur: f.taxAmount ?? null,               // null stays Unknown (never coerced to 0)
    // Account-bounded Booking verified-zero tax (raw null + validated regime). Fail-closed elsewhere.
    taxVerifiedZeroEvidence: isBookingAccountVerifiedZero(String(r.channel), f.taxAmount ?? null, r.checkIn),
    // Authoritative Hostaway statement line (verbatim) when raw is incomplete/inconsistent.
    authoritativeLine: getAuthoritativeStatementLine(r.hostawayReservationId, propertyName, r.checkIn) ?? undefined,
    platformPayoutEvidenceEur: f.payout?.amount ?? null,
  }
}

export async function buildOwnerStrStatement(input: OwnerStrStatementInput): Promise<OwnerStrStatement> {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const sb = createServiceClient()
  const audit = new PropertyAuditService(sb)
  const names = input.properties.map(p => p.name)

  // 1) Hostaway reservation evidence (revenue-eligible only), per property.
  const reservations: StatementReservationEvidence[] = []
  for (const p of input.properties) {
    const res = await audit.auditProperty({ jjPropertyName: p.name, dateFrom: input.startDate, dateTo: input.endDate })
    if (!res.success || !res.audit) continue
    for (const r of res.audit.reservations) {
      if (!isRevenueEligible(r.status)) continue
      // Owner Statement periodization follows Hostaway: a reservation belongs to the statement month
      // by ARRIVAL/check-in date (NOT overlap). The operational Reservations cockpit keeps overlap.
      if (!belongsToStatementMonth(r.checkIn, input.startDate, input.endDate)) continue
      reservations.push(toEvidence(p.name, r, today))
    }
  }

  // 2) Expenses & Extras — JJ authoritative ledger (owner property expenses in period).
  //    Owner-facing amount = COALESCE(client_charge, amount_eur) (P-LEDGER-6), shown as a negative charge.
  //    Platform Income / Client Payment are NOT extras (income/settlement — handled via reconciliation).
  //    Cleaning / Management Fee are NOT extras either: both are already deducted inside the certified
  //    per-reservation chain (Net = Total Payout − Cleaning − Management Fee − Taxes). Re-adding them here
  //    would double-count (proven in the accuracy audit: Mgmt €4,023.79 + Cleaning €3,061.08).
  //    KNOWN LIMITATION (subcategory-based exclusion): this drops Cleaning/Management Fee purely by
  //    subcategory. If a future row is a genuinely SEPARATE charge (different business meaning than the
  //    reservation's own cleaning/mgmt — e.g. a one-off deep-clean billed apart from any reservation),
  //    it must be distinguished EXPLICITLY (dedicated flag / linkage), not inferred from subcategory alone.
  const extras: StatementExtra[] = []
  if (names.length) {
    const { data: exRows } = await sb.from('transactions')
      .select('date, property_name, subcategory, description, amount_eur, client_charge')
      .in('property_name', names)
      .eq('category', 'Airbnb')
      .gte('date', input.startDate).lte('date', input.endDate)
      .or('review_status.eq.active,review_status.is.null')
    for (const t of exRows ?? []) {
      const sub = String(t.subcategory ?? '')
      // Owner-facing extras only. Excludes income/settlement (Platform Income/Client Payment) AND
      // reservation-chain deductions (Cleaning/Management Fee — Decision B, prevents double-count).
      if (!isOwnerStatementExtra(sub)) continue
      const ownerFacing = num(t.client_charge) ?? num(t.amount_eur) ?? 0
      if (ownerFacing === 0) continue
      extras.push({
        name: (t.description as string) || sub || 'Expense',
        date: String(t.date),
        subcategory: sub,
        propertyName: String(t.property_name),
        amountEur: -Math.abs(Math.round(ownerFacing * 100) / 100),
        provenance: 'jj_transaction',
      })
    }
  }

  // 3) JJ Platform Income coverage — aggregate-aware, identical semantics to the certified cockpit
  //    reconciliation (ownerStrAuditAdapter.getStrReconciliation). Fetch ALL Platform Income rows for
  //    the owner's properties (any transaction date) and classify each by its RECORDED period using the
  //    reused parser (parsePeriodFromDescription) — no second parser, no monthly allocation, no split.
  //    A row whose period spans beyond the selected window is a MULTI-MONTH aggregate that must never be
  //    presented as a clean monthly match.
  let jjPI: number | null = null
  let piAggregate = false
  if (names.length) {
    const { data: piRows } = await sb.from('transactions')
      .select('date, description, amount_eur')
      .in('property_name', names)
      .eq('category', 'Airbnb').eq('subcategory', 'Platform Income')
      .or('review_status.eq.active,review_status.is.null')
    let monthSpecificSum = 0, monthSpecificCount = 0
    let aggregateSum = 0, aggregateCount = 0
    for (const t of piRows ?? []) {
      const parsed = parsePeriodFromDescription((t.description as string | null) ?? null)
      const from = parsed?.from ?? String(t.date)   // ISO 'YYYY-MM-DD' — lexical compare is date-correct
      const to = parsed?.to ?? String(t.date)
      const overlaps = from <= input.endDate && to >= input.startDate
      if (!overlaps) continue
      const amt = num(t.amount_eur) ?? 0
      const spansBeyondMonth = from < input.startDate || to > input.endDate
      if (spansBeyondMonth) { aggregateSum += amt; aggregateCount++ }
      else { monthSpecificSum += amt; monthSpecificCount++ }
    }
    if (aggregateCount > 0) {
      // Any multi-month aggregate touching this window → aggregate_only (context sum, never compared).
      jjPI = Math.round((aggregateSum + monthSpecificSum) * 100) / 100
      piAggregate = true
    } else if (monthSpecificCount > 0) {
      jjPI = Math.round(monthSpecificSum * 100) / 100   // genuinely month-specific → normal reconciliation
    }
  }

  return composeOwnerStrStatement({
    ownerName: input.ownerName,
    properties: names,
    periodStart: input.startDate,
    periodEnd: input.endDate,
    periodLabel: input.periodLabel,
    issuedDate: today,
    reservations,
    extras,
    jjPlatformIncomeInPeriodEur: jjPI,
    jjPlatformIncomeIsAggregate: piAggregate,
  })
}
