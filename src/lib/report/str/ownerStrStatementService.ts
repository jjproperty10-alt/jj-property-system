/**
 * ownerStrStatementService — server-only fetch layer for the owner STR statement.
 *
 * Hostaway reservation evidence via the certified PropertyAuditService; Expenses & Extras + Platform
 * Income reconciliation from JJ authoritative public.transactions (read-only). Composes via the pure
 * composeOwnerStrStatement. NO writes, no financial authority mutation, aggregate PI never split.
 */
import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { PropertyAuditService, isRevenueEligible } from '@/lib/hostaway-audit'
import { maskGuestName } from '@/lib/owners/ownerReservationAdapter'
import { composeOwnerStrStatement, type OwnerStrStatement, type StatementReservationEvidence, type StatementExtra } from './ownerStrStatement'

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
      reservations.push(toEvidence(p.name, r, today))
    }
  }

  // 2) Expenses & Extras — JJ authoritative ledger (owner property expenses in period).
  //    Owner-facing amount = COALESCE(client_charge, amount_eur) (P-LEDGER-6), shown as a negative charge.
  //    Platform Income / Client Payment are NOT extras (income/settlement — handled via reconciliation).
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
      if (sub === 'Platform Income' || sub === 'Client Payment') continue
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

  // 3) JJ Platform Income posted in period (aggregate rows kept as-is, NEVER split).
  let jjPI: number | null = null
  let piAggregate = false
  if (names.length) {
    const { data: piRows } = await sb.from('transactions')
      .select('amount_eur, client_charge')
      .in('property_name', names)
      .eq('category', 'Airbnb').eq('subcategory', 'Platform Income')
      .gte('date', input.startDate).lte('date', input.endDate)
      .or('review_status.eq.active,review_status.is.null')
    if (piRows && piRows.length) {
      let s = 0
      for (const t of piRows) s += num(t.amount_eur) ?? 0
      jjPI = Math.round(s * 100) / 100
      // Established fact: JJ records Platform Income as multi-period aggregates — treat as aggregate
      // evidence (do not claim a clean monthly match). Refined only with explicit monthly evidence.
      piAggregate = true
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
