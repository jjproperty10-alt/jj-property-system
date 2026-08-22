/**
 * @module partner-settlement/adapters/receivablesReader
 * @description READ-ONLY receivables/payables adapter.
 *
 * v_money_position is the canonical, typed, no-double-count source — but authoritative
 * ONLY for its covered scope (12c). It does NOT fully cover partner current accounts,
 * suppliers/contractors, or forward commitments. So the returned totals are always
 * marked PARTIAL, and the covered counterparty classes are reported for transparency.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'

export interface ReceivablesSummary {
  readonly receivableToJjEur: number | null
  readonly payableByJjEur: number | null
  /** always PARTIAL in Stage 1 — the view's scope excludes some counterparty classes */
  readonly scope: 'PARTIAL'
  readonly coveredCounterpartyTypes: readonly string[]
}

interface MoneyPositionRow {
  direction: string | null
  counterparty_type: string | null
  open_amount_eur: number | null
}

export async function readReceivables(): Promise<ReceivablesSummary> {
  const db = createServiceClient()
  const { data } = await db
    .from('v_money_position')
    .select('direction, counterparty_type, open_amount_eur')

  const rows = (data as MoneyPositionRow[]) ?? []
  let receivable = 0
  let payable = 0
  const types = new Set<string>()
  let any = false
  for (const r of rows) {
    any = true
    if (r.counterparty_type) types.add(r.counterparty_type)
    const amt = r.open_amount_eur ?? 0
    if (r.direction === 'RECEIVABLE_TO_JJ') receivable += amt
    else if (r.direction === 'PAYABLE_BY_JJ') payable += amt
  }

  return {
    receivableToJjEur: any ? receivable : null,
    payableByJjEur: any ? payable : null,
    scope: 'PARTIAL',
    coveredCounterpartyTypes: Array.from(types).sort(),
  }
}
