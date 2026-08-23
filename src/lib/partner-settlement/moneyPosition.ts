/**
 * @module partner-settlement/moneyPosition
 * @description Pure v_money_position summarization (no I/O, no server-only).
 *
 * QA fix #5 — null preservation: a null open_amount_eur is NEVER coerced to 0.
 * Such rows are counted (unknownRows) and surfaced by the service; unknown stays
 * unknown (P-ARCH-1). v_money_position is authoritative only for its covered scope,
 * so totals are always marked PARTIAL.
 */

export interface ReceivablesSummary {
  readonly receivableToJjEur: number | null
  readonly payableByJjEur: number | null
  /** rows whose open_amount_eur was null — surfaced, never silently zeroed */
  readonly unknownRows: number
  readonly scope: 'PARTIAL'
  readonly coveredCounterpartyTypes: readonly string[]
}

export interface MoneyPositionRow {
  direction: string | null
  counterparty_type: string | null
  open_amount_eur: number | null
}

export function summarizeMoneyPosition(rows: readonly MoneyPositionRow[]): ReceivablesSummary {
  let receivable = 0
  let payable = 0
  let unknownRows = 0
  const types = new Set<string>()
  let any = false
  for (const r of rows) {
    any = true
    if (r.counterparty_type) types.add(r.counterparty_type)
    if (r.open_amount_eur === null || r.open_amount_eur === undefined) {
      unknownRows++ // unknown must remain unknown — never coerced to 0
      continue
    }
    if (r.direction === 'RECEIVABLE_TO_JJ') receivable += r.open_amount_eur
    else if (r.direction === 'PAYABLE_BY_JJ') payable += r.open_amount_eur
  }
  return {
    receivableToJjEur: any ? receivable : null,
    payableByJjEur: any ? payable : null,
    unknownRows,
    scope: 'PARTIAL',
    coveredCounterpartyTypes: Array.from(types).sort(),
  }
}
