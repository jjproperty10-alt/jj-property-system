/**
 * ownerStrRangeStatement — pure composition of a MULTI-MONTH owner STR statement.
 *
 * PRESENTATION/AGGREGATION ONLY. Reuses the certified single-month statements verbatim (each is a
 * fully-composed OwnerStrStatement) and rolls them up into an overall summary + a per-month list.
 * There is NO new financial logic here: every per-month number comes from composeOwnerStrStatement,
 * and every overall number is a straight sum of the months. Unknown ≠ 0 is preserved — if ANY month's
 * field is Needs Review (null), the overall field is Needs Review (null), never a partial sum shown as
 * if complete.
 */
import type { OwnerStrStatement } from './ownerStrStatement'

/** IEEE-754-safe 2dp rounding (same as strStatementLine.roundEur). */
function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Sum a list that may contain nulls: null if ANY entry is null (Unknown ≠ 0), else the rounded sum. */
function sumOrNull(values: readonly (number | null)[]): number | null {
  if (values.some(v => v == null)) return null
  return roundEur((values as number[]).reduce((a, v) => a + v, 0))
}

export interface OwnerStrRangeStatement {
  readonly header: {
    readonly company: string
    readonly ownerName: string
    readonly properties: readonly string[]
    readonly rangeStart: string // inclusive first day, YYYY-MM-DD
    readonly rangeEnd: string    // inclusive last day, YYYY-MM-DD
    readonly rangeLabel: string  // e.g. "May 2026 – July 2026"
    readonly monthCount: number
    readonly issuedDate: string
  }
  readonly overall: {
    readonly grossEur: number
    readonly platformFeesEur: number | null
    readonly cleaningEur: number | null
    readonly managementFeeEur: number | null
    readonly taxesEur: number | null
    readonly netOwnerPayoutEur: number | null
    readonly expensesExtrasTotalEur: number
    readonly statementTotalEur: number | null
    readonly needsReviewMonths: number // count of months whose Net Owner Payout is Needs Review
  }
  /** Per-month full statements, in chronological order. */
  readonly months: readonly OwnerStrStatement[]
  readonly provenanceNote: string
}

export interface ComposeRangeInput {
  readonly ownerName: string
  readonly properties: readonly string[]
  readonly rangeStart: string
  readonly rangeEnd: string
  readonly rangeLabel: string
  readonly issuedDate: string
  readonly months: readonly OwnerStrStatement[]
}

export function composeOwnerStrRangeStatement(input: ComposeRangeInput): OwnerStrRangeStatement {
  const m = input.months
  const company = m[0]?.header.company ?? 'JJ PROPERTY 10 LTD'

  const grossEur = roundEur(m.reduce((a, s) => a + s.totals.grossEur, 0))
  const platformFeesEur = sumOrNull(m.map(s => s.totals.platformFeesEur))
  const cleaningEur = sumOrNull(m.map(s => s.totals.cleaningEur))
  const managementFeeEur = sumOrNull(m.map(s => s.totals.managementFeeEur))
  const taxesEur = sumOrNull(m.map(s => s.totals.taxesEur))
  const netOwnerPayoutEur = sumOrNull(m.map(s => s.totals.netOwnerPayoutEur))
  const expensesExtrasTotalEur = roundEur(m.reduce((a, s) => a + s.expensesExtrasTotalEur, 0))
  const statementTotalEur =
    netOwnerPayoutEur == null ? null : roundEur(netOwnerPayoutEur + expensesExtrasTotalEur)
  const needsReviewMonths = m.filter(s => s.totals.netOwnerPayoutEur == null).length

  return {
    header: {
      company,
      ownerName: input.ownerName,
      properties: input.properties,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      rangeLabel: input.rangeLabel,
      monthCount: m.length,
      issuedDate: input.issuedDate,
    },
    overall: {
      grossEur,
      platformFeesEur,
      cleaningEur,
      managementFeeEur,
      taxesEur,
      netOwnerPayoutEur,
      expensesExtrasTotalEur,
      statementTotalEur,
      needsReviewMonths,
    },
    months: m,
    provenanceNote:
      'Multi-month statement. Each month is the certified single-month Owner Statement (same rules, ' +
      'check-in-month attribution). Overall totals are the sum of the months; any month still Needs ' +
      'Review makes the corresponding overall total Needs Review — never assumed zero.',
  }
}
