/**
 * ownerStrRangeStatementService — server-only fetch layer for the MULTI-MONTH owner STR statement.
 *
 * Reuses the certified single-month buildOwnerStrStatement for each month in [fromMonth, toMonth],
 * then rolls the months up via the pure composeOwnerStrRangeStatement. NO new financial logic — this
 * only iterates months and aggregates. Read-only; no writes.
 */
import 'server-only'
import { buildOwnerStrStatement, type OwnerStrStatementInput } from './ownerStrStatementService'
import { composeOwnerStrRangeStatement, type OwnerStrRangeStatement } from './ownerStrRangeStatement'

export interface OwnerStrRangeInput {
  readonly ownerName: string
  readonly properties: readonly { id: string; name: string }[]
  readonly fromMonth: string // YYYY-MM inclusive
  readonly toMonth: string   // YYYY-MM inclusive
  readonly today?: string
}

/** Inclusive list of YYYY-MM from `from` to `to` (max cap guards against absurd ranges). */
export function monthsInRange(from: string, to: string, maxMonths = 36): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy, mo = fm
  while ((y < ty || (y === ty && mo <= tm)) && out.length < maxMonths) {
    out.push(`${y}-${String(mo).padStart(2, '0')}`)
    mo++
    if (mo > 12) { mo = 1; y++ }
  }
  return out
}

function monthBounds(ym: string): { start: string; end: string; label: string } {
  const [y, mo] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const last = new Date(Date.UTC(y, mo, 0))
  const end = `${ym}-${String(last.getUTCDate()).padStart(2, '0')}`
  const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { start, end, label }
}

export async function buildOwnerStrRangeStatement(input: OwnerStrRangeInput): Promise<OwnerStrRangeStatement> {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const months = monthsInRange(input.fromMonth, input.toMonth)
  const fromB = monthBounds(input.fromMonth)
  const toB = monthBounds(input.toMonth)

  // Compose each month with the certified single-month builder (sequential — read-only, deterministic).
  const monthStatements = []
  for (const ym of months) {
    const b = monthBounds(ym)
    const single: OwnerStrStatementInput = {
      ownerName: input.ownerName,
      properties: input.properties,
      startDate: b.start,
      endDate: b.end,
      periodLabel: b.label,
      today,
    }
    monthStatements.push(await buildOwnerStrStatement(single))
  }

  return composeOwnerStrRangeStatement({
    ownerName: input.ownerName,
    properties: input.properties.map(p => p.name),
    rangeStart: fromB.start,
    rangeEnd: toB.end,
    rangeLabel: months.length === 1 ? fromB.label : `${fromB.label} – ${toB.label}`,
    issuedDate: today,
    months: monthStatements,
  })
}
