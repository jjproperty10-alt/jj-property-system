/**
 * @module partner-settlement/adapters/transactionsReader
 * @description READ-ONLY canonical transaction reader for the partner report (Stage 2).
 *
 * Reads public.transactions with the repository's established certified-read predicate
 * (is_deleted IS NOT TRUE AND review_status active/null AND not actively excluded — see
 * ledgerRowFilter for the single source of truth) and returns only partner-relevant,
 * normalized rows. Pure filtering/normalization lives in ../ledgerRowFilter.ts so it is
 * unit-testable without server-only.
 *
 * READ-ONLY: only .select() is used. NEVER insert/update/delete/upsert/rpc. The
 * Transaction Register workstream is not touched.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { toPartnerLedger, type RawLedgerRow, type NormalizedPartnerTx } from '../ledgerRowFilter'

export async function readPartnerLedger(fromDate?: string, toDate?: string): Promise<NormalizedPartnerTx[]> {
  const db = createServiceClient()

  let q = db
    .from('transactions')
    .select('id, date, property_name, category, subcategory, payer, payee, amount_eur, is_deleted, review_status')
  if (fromDate) q = q.gte('date', fromDate)
  if (toDate) q = q.lte('date', toDate)
  const { data } = await q
  const rows = (data as RawLedgerRow[]) ?? []

  // Active transaction_exclusions (certified-read predicate, part 3). Read-only.
  const activeExcluded = new Set<string>()
  try {
    const { data: ex } = await db
      .from('transaction_exclusions')
      .select('transaction_id, is_active')
      .eq('is_active', true)
    for (const r of ((ex as { transaction_id: string }[]) ?? [])) activeExcluded.add(r.transaction_id)
  } catch {
    // exclusions table unavailable — proceed with is_deleted/review_status only.
  }

  return toPartnerLedger(rows, activeExcluded)
}
