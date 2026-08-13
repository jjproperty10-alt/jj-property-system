/**
 * ownerStrStatement — PURE composition of an owner STR statement from already-fetched inputs.
 *
 * Boundary (locked): Hostaway = reservation evidence/economics; JJ = derived management fee (20%),
 * derived net owner payout, authoritative Expenses & Extras (transactions), reconciliation authority.
 * Never fabricates: unknown stays null / Needs Review. Aggregate JJ Platform Income is NEVER split.
 * Pure + deterministic. No DB, no writes.
 */
import { buildStrStatementLine, type StrStatementLine, type StrLineEvidence, roundEur } from './strStatementLine'

export interface StatementReservationEvidence extends StrLineEvidence {
  readonly propertyName: string
  readonly guestName: string | null   // caller applies masking policy
  readonly checkIn: string
  readonly checkOut: string
  readonly nights: number
}

/**
 * Non-extra income/settlement subcategories — handled via reconciliation, never owner charges.
 */
export const NON_EXTRA_SUBCATEGORIES: ReadonlySet<string> = new Set(['Platform Income', 'Client Payment'])
/**
 * Reservation-chain deductions already applied inside the certified per-reservation Net calculation
 * (Net = Total Payout - Cleaning - Management Fee - Taxes). Re-adding them to Expenses & Extras would
 * double-count (Decision B, proven in the accuracy audit). KNOWN LIMITATION: subcategory-based — a
 * future genuinely SEPARATE Cleaning/Management charge (different business meaning than the
 * reservation's own) must be distinguished EXPLICITLY (e.g. reservationId / dedicated flag), never
 * inferred from subcategory alone.
 */
export const RESERVATION_CHAIN_SUBCATEGORIES: ReadonlySet<string> = new Set(['Cleaning', 'Management Fee'])
/** True when a JJ ledger row (category=Airbnb) belongs in owner-facing Expenses & Extras. */
export function isOwnerStatementExtra(subcategory: string): boolean {
  return !NON_EXTRA_SUBCATEGORIES.has(subcategory) && !RESERVATION_CHAIN_SUBCATEGORIES.has(subcategory)
}

export interface StatementExtra {
  readonly name: string
  readonly date: string
  readonly subcategory: string
  readonly propertyName: string
  /** Owner-facing amount, signed: negative = charge to owner, positive = credit. From JJ transactions. */
  readonly amountEur: number
  readonly provenance: 'jj_transaction'
  /**
   * Explicit reservation linkage for a genuinely SEPARATE charge (not a reservation-chain deduction).
   * JJ ledger extras carry none today → null (rendered as em dash). Reserved for the known-limitation
   * follow-up: a future standalone Cleaning/Management charge distinguished by business meaning.
   */
  readonly reservationId?: string | null
}

export interface StatementActivityRow {
  readonly reservationId: string
  readonly propertyName: string
  readonly guestName: string | null
  readonly channel: string
  readonly checkIn: string
  readonly checkOut: string
  readonly nights: number
  readonly line: StrStatementLine
}

export interface OwnerStrStatement {
  readonly header: {
    readonly company: string
    readonly ownerName: string
    readonly properties: readonly string[]
    readonly periodStart: string
    readonly periodEnd: string
    readonly periodLabel: string
    readonly issuedDate: string
  }
  readonly metrics: {
    readonly grossEur: number
    readonly netOwnerPayoutEur: number | null       // null when any row is Needs Review
    readonly propertyManagementRevenueEur: number | null
  }
  readonly activity: readonly StatementActivityRow[]
  readonly totals: {
    readonly grossEur: number
    readonly platformFeesEur: number | null
    readonly cleaningEur: number | null
    readonly managementFeeEur: number | null
    readonly taxesEur: number | null
    readonly netOwnerPayoutEur: number | null
    readonly needsReviewCount: number
  }
  readonly expensesExtras: readonly StatementExtra[]
  readonly expensesExtrasTotalEur: number
  readonly statementTotalEur: number | null          // netOwnerPayout + Σ extras; null if payout unknown
  readonly reconciliation: {
    readonly hostawayPayoutEvidenceEur: number | null
    readonly jjPlatformIncomeEur: number | null
    readonly jjPlatformIncomeIsAggregate: boolean
    readonly status: 'match' | 'variance' | 'missing_in_jj' | 'aggregate_only' | 'no_evidence'
    readonly note: string
  }
  readonly provenanceNote: string
}

export interface ComposeInput {
  readonly company?: string
  readonly ownerName: string
  readonly properties: readonly string[]
  readonly periodStart: string
  readonly periodEnd: string
  readonly periodLabel: string
  readonly issuedDate: string
  readonly reservations: readonly StatementReservationEvidence[]
  readonly extras: readonly StatementExtra[]
  /** JJ Platform Income posted with a transaction date inside the period (aggregate rows kept as-is). */
  readonly jjPlatformIncomeInPeriodEur: number | null
  /** True when the JJ Platform Income evidence covers a span wider than this period (aggregate). */
  readonly jjPlatformIncomeIsAggregate: boolean
}

const sumKnown = (xs: (number | null)[]): number | null => {
  if (xs.some(x => x == null)) return null
  let s = 0
  for (const x of xs) s += x as number
  return roundEur(s)
}

export function composeOwnerStrStatement(input: ComposeInput): OwnerStrStatement {
  const activity: StatementActivityRow[] = input.reservations.map(ev => ({
    reservationId: ev.reservationId,
    propertyName: ev.propertyName,
    guestName: ev.guestName,
    channel: ev.channel,
    checkIn: ev.checkIn,
    checkOut: ev.checkOut,
    nights: ev.nights,
    line: buildStrStatementLine(ev),
  }))

  const lines = activity.map(a => a.line)
  const grossTotal = roundEur(lines.reduce((a, l) => a + (l.gross.value ?? 0), 0))
  const platformFeesTotal = sumKnown(lines.map(l => l.platformFees.value))
  const cleaningTotal = sumKnown(lines.map(l => l.cleaning.value))
  const managementFeeTotal = sumKnown(lines.map(l => l.managementFee.value))
  const taxesTotal = sumKnown(lines.map(l => l.taxes.value))
  const netTotal = sumKnown(lines.map(l => l.netOwnerPayout.value))
  const needsReviewCount = lines.filter(l => l.needsReview).length

  const pmRevenue =
    managementFeeTotal != null && cleaningTotal != null ? roundEur(managementFeeTotal + cleaningTotal) : null

  const extrasTotal = roundEur(input.extras.reduce((a, e) => a + e.amountEur, 0))
  const statementTotal = netTotal != null ? roundEur(netTotal + extrasTotal) : null

  const hostawayPayoutEvidence = roundEur(
    activity.reduce((a, r) => a + (r.line.platformPayoutEvidence.value ?? 0), 0),
  )
  const jjPI = input.jjPlatformIncomeInPeriodEur
  let recStatus: OwnerStrStatement['reconciliation']['status']
  let recNote: string
  if (activity.length === 0 && jjPI == null) {
    recStatus = 'no_evidence'; recNote = 'No Hostaway reservations and no JJ Platform Income in period.'
  } else if (jjPI == null) {
    recStatus = 'missing_in_jj'
    recNote = 'Hostaway reservation evidence present; JJ has no Platform Income posted for this period (owner-payout is derived from Hostaway evidence and pending JJ ledger).'
  } else if (input.jjPlatformIncomeIsAggregate) {
    recStatus = 'aggregate_only'
    recNote = 'JJ Platform Income is recorded as a multi-period aggregate; monthly ledger attribution is unavailable. Aggregate value shown as reconciliation evidence only — never split.'
  } else {
    const diff = Math.abs(hostawayPayoutEvidence - jjPI)
    recStatus = diff <= 0.01 ? 'match' : 'variance'
    recNote = diff <= 0.01 ? 'Hostaway payout evidence matches JJ Platform Income.' : `Hostaway payout evidence €${hostawayPayoutEvidence.toFixed(2)} vs JJ Platform Income €${jjPI.toFixed(2)}.`
  }

  return {
    header: {
      company: input.company ?? 'JJ PROPERTY 10 LTD',
      ownerName: input.ownerName,
      properties: input.properties,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodLabel: input.periodLabel,
      issuedDate: input.issuedDate,
    },
    metrics: {
      grossEur: grossTotal,
      netOwnerPayoutEur: netTotal,
      propertyManagementRevenueEur: pmRevenue,
    },
    activity,
    totals: {
      grossEur: grossTotal,
      platformFeesEur: platformFeesTotal,
      cleaningEur: cleaningTotal,
      managementFeeEur: managementFeeTotal,
      taxesEur: taxesTotal,
      netOwnerPayoutEur: netTotal,
      needsReviewCount,
    },
    expensesExtras: input.extras,
    expensesExtrasTotalEur: extrasTotal,
    statementTotalEur: statementTotal,
    reconciliation: {
      hostawayPayoutEvidenceEur: activity.length ? hostawayPayoutEvidence : null,
      jjPlatformIncomeEur: jjPI,
      jjPlatformIncomeIsAggregate: input.jjPlatformIncomeIsAggregate,
      status: recStatus,
      note: recNote,
    },
    provenanceNote:
      'Gross, Platform Fees, Cleaning, Taxes = Hostaway reservation evidence. Management Fee = JJ policy (20% after platform fees), report calculation only. Net Owner Payout = derived (Gross − Platform − Cleaning − Management Fee − Taxes). Expenses & Extras = JJ ledger (transactions). Unknown values are shown as Needs Review, never zero.',
  }
}
