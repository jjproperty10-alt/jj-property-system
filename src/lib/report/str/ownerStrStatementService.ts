/**
 * ownerStrStatementService — server-only fetch layer for the owner STR statement.
 *
 * Hostaway reservation evidence via the certified PropertyAuditService; Expenses & Extras + Platform
 * Income reconciliation from JJ authoritative public.transactions (read-only). Composes via the pure
 * composeOwnerStrStatement. NO writes, no financial authority mutation, aggregate PI never split.
 */
import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { fetchCertifiedLedgerRows } from '@/lib/ledger/certifiedTransactionsReader'
import { CertifiedLedgerUnavailableError } from '@/lib/ledger/certifiedLedger'
import { PropertyAuditService, isRevenueEligible, parsePeriodFromDescription } from '@/lib/hostaway-audit'
import { maskGuestName } from '@/lib/owners/ownerReservationAdapter'
import { composeOwnerStrStatement, isOwnerStatementExtra, isOwnerStatementExtraCategory, isOwnerStatementPayment, OWNER_STATEMENT_EXTRA_CATEGORIES, type OwnerStrStatement, type StatementReservationEvidence, type StatementExtra } from './ownerStrStatement'
import { isBookingAccountVerifiedZero } from './bookingTaxPolicy'
import { applyAirbnbCyprusVat } from './airbnbTaxPolicy'
import { getAuthoritativeStatementLine, belongsToStatementMonth } from './statementEvidence'
import { getHistoricalChannelEvidence, mergeLiveAndHistoricalEvidence } from './historicalChannelEvidence'

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
  // Cyprus VAT gross-up (Airbnb only): the raw Airbnb feed omits the 9% occupancy VAT that the
  // authoritative Hostaway Owner Statement grosses-up into Gross + Platform Fees and surfaces as Taxes.
  // Report layer only; Booking/direct/historical untouched; explicit-nonzero-tax rows respected as-is.
  const vat = applyAirbnbCyprusVat({
    channel: String(r.channel),
    grossEur: f.totalPrice ?? null,
    platformFeesEur,
    taxesEur: f.taxAmount ?? null,
    airbnbExpectedPayoutEur: f.payout?.amount ?? null,
  })
  return {
    reservationId: r.hostawayReservationId,
    channel: String(r.channel),
    propertyName,
    guestName: maskGuestName(r.guestName ?? null, r.checkOut, today),
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: r.nights,
    grossEur: vat.grossEur,
    platformFeesEur: vat.platformFeesEur,
    platformFeesSource: vat.applied ? `${platformFeesSource}+jj_derived:airbnb_cyprus_vat_9pct` : platformFeesSource,
    cleaningEur: f.cleaningFee ?? null,
    taxesEur: vat.taxesEur,                       // Airbnb VAT gross-up applied; null stays Unknown (never coerced to 0)
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
  //     Historical-only properties have no live mapping: auditProperty fails closed and this
  //     loop contributes nothing. That is expected — not a defect.
  const live: StatementReservationEvidence[] = []
  for (const p of input.properties) {
    const res = await audit.auditProperty({ jjPropertyName: p.name, dateFrom: input.startDate, dateTo: input.endDate })
    if (!res.success || !res.audit) continue
    for (const r of res.audit.reservations) {
      if (!isRevenueEligible(r.status)) continue
      // Owner Statement periodization follows Hostaway: a reservation belongs to the statement month
      // by ARRIVAL/check-in date (NOT overlap). The operational Reservations cockpit keeps overlap.
      if (!belongsToStatementMonth(r.checkIn, input.startDate, input.endDate)) continue
      live.push(toEvidence(p.name, r, today))
    }
  }

  // 1b) Historical channel evidence — recovered Booking/Airbnb by canonical property_id.
  //     No live Hostaway listing required. Same StatementReservationEvidence shape, same
  //     arrival-month periodization. Deduped against live by reservationId (no double count).
  //     Provenance remains airbnb/booking (never hostaway).
  const historical: StatementReservationEvidence[] = []
  for (const p of input.properties) {
    const hist = await getHistoricalChannelEvidence(sb, p.id, p.name, today)
    for (const ev of hist) {
      if (!belongsToStatementMonth(ev.checkIn, input.startDate, input.endDate)) continue
      historical.push(ev)
    }
  }
  const reservations = mergeLiveAndHistoricalEvidence(live, historical)

  // 2) Expenses & Extras — JJ authoritative ledger (owner property expenses in period).
  //    Categories: Airbnb + Management only (not Purchase/Sale/Renovation/Transfer).
  //    Owner-facing amount = COALESCE(client_charge, amount_eur) (P-LEDGER-6), shown as a negative charge.
  //    Platform Income / Client Payment / Bank Payment to Owner are NOT extras (income/settlement).
  //    Client Payment is collected separately as Payments received (owner credit).
  //    Cleaning with payer=Airbnb is reservation-chain tracking — not an owner extra.
  //    Cleaning with payer≠Airbnb is a real owner cost (supplies / billed deep clean).
  //    Management Fee stays out of extras regardless of payer (already deducted in-chain).
  const extras: StatementExtra[] = []
  const ownerPayments: StatementExtra[] = []
  let jjPI: number | null = null
  let piAggregate = false
  let ledgerUnavailable = false
  if (names.length) {
    try {
      const exRows = await fetchCertifiedLedgerRows(sb, {
        select: 'id, date, property_name, category, subcategory, description, payer, amount_eur, client_charge',
        propertyNames: names,
        categories: [...OWNER_STATEMENT_EXTRA_CATEGORIES],
        dateGte: input.startDate,
        dateLte: input.endDate,
      })
      for (const t of exRows) {
        const cat = String(t.category ?? '')
        const sub = String(t.subcategory ?? '')
        const payer = t.payer != null ? String(t.payer) : null
        if (!isOwnerStatementExtraCategory(cat)) continue
        const ownerFacing = num(t.client_charge) ?? num(t.amount_eur) ?? 0
        if (ownerFacing === 0) continue
        const rounded = Math.round(ownerFacing * 100) / 100
        const row = {
          name: (t.description as string) || sub || 'Expense',
          date: String(t.date),
          subcategory: sub,
          propertyName: String(t.property_name),
          provenance: 'jj_transaction' as const,
        }
        if (isOwnerStatementPayment(sub)) {
          ownerPayments.push({ ...row, amountEur: Math.abs(rounded) })
          continue
        }
        if (!isOwnerStatementExtra(sub, payer)) continue
        extras.push({ ...row, amountEur: -Math.abs(rounded) })
      }

      const piRows = await fetchCertifiedLedgerRows(sb, {
        select: 'date, description, amount_eur',
        propertyNames: names,
        eq: { category: 'Airbnb', subcategory: 'Platform Income' },
      })
      let monthSpecificSum = 0, monthSpecificCount = 0
      let aggregateSum = 0, aggregateCount = 0
      for (const t of piRows) {
        const parsed = parsePeriodFromDescription((t.description as string | null) ?? null)
        const from = parsed?.from ?? String(t.date)
        const to = parsed?.to ?? String(t.date)
        const overlaps = from <= input.endDate && to >= input.startDate
        if (!overlaps) continue
        const amt = num(t.amount_eur) ?? 0
        const spansBeyondMonth = from < input.startDate || to > input.endDate
        if (spansBeyondMonth) { aggregateSum += amt; aggregateCount++ }
        else { monthSpecificSum += amt; monthSpecificCount++ }
      }
      if (aggregateCount > 0) {
        jjPI = Math.round((aggregateSum + monthSpecificSum) * 100) / 100
        piAggregate = true
      } else if (monthSpecificCount > 0) {
        jjPI = Math.round(monthSpecificSum * 100) / 100
      }
    } catch (err) {
      if (!(err instanceof CertifiedLedgerUnavailableError)) throw err
      // Fail-closed for extras/PI: include none. Hostaway reservations already composed above.
      ledgerUnavailable = true
      extras.length = 0
      ownerPayments.length = 0
      jjPI = null
      piAggregate = false
    }
  }

  const composed = composeOwnerStrStatement({
    ownerName: input.ownerName,
    properties: names,
    periodStart: input.startDate,
    periodEnd: input.endDate,
    periodLabel: input.periodLabel,
    issuedDate: today,
    reservations,
    extras,
    ownerPayments,
    jjPlatformIncomeInPeriodEur: jjPI,
    jjPlatformIncomeIsAggregate: piAggregate,
  })
  if (!ledgerUnavailable) return composed
  return {
    ...composed,
    statementTotalEur: null,
    totals: {
      ...composed.totals,
      needsReviewCount: composed.totals.needsReviewCount + 1,
    },
    reconciliation: {
      ...composed.reconciliation,
      jjPlatformIncomeEur: null,
      note: 'Certified ledger unavailable. Hostaway reservation figures are shown. JJ extras and Platform Income are Needs Review — not assumed zero.',
    },
  }
}
