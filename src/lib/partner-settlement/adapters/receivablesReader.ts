/**
 * @module partner-settlement/adapters/receivablesReader
 * @description READ-ONLY receivables/payables adapter over v_money_position.
 * Pure summarization (incl. QA fix #5 null preservation) lives in ../moneyPosition.ts.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { summarizeMoneyPosition, type ReceivablesSummary, type MoneyPositionRow } from '../moneyPosition'

export type { ReceivablesSummary } from '../moneyPosition'

export async function readReceivables(): Promise<ReceivablesSummary> {
  const db = createServiceClient()
  const { data } = await db
    .from('v_money_position')
    .select('direction, counterparty_type, open_amount_eur')
  return summarizeMoneyPosition((data as MoneyPositionRow[]) ?? [])
}
