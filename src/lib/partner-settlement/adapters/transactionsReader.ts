/**
 * @module partner-settlement/adapters/transactionsReader
 * @description READ-ONLY canonical transaction reader for the partner report (Stage 2).
 *
 * FAIL-CLOSED (QA #185-1): checks errors from BOTH the transactions and the
 * transaction_exclusions queries. It NEVER continues with an empty exclusion set (which
 * would let excluded transactions slip in) and NEVER returns an empty ledger that could
 * be mistaken for a valid zero result — a source failure yields a traceable blocker.
 *
 * CANONICAL IDENTITY (QA #185-2): payer/payee are resolved through the canonical party
 * authority (registry.parties) via a directory built read-only here and injected into
 * the pure normalizer; if the identity source is unavailable it blocks, too.
 *
 * READ-ONLY: only .select() is used. NEVER insert/update/delete/upsert/rpc against the
 * ledger. The Transaction Register workstream is not touched.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import {
  buildLedgerFromSources, distinctPartyNames,
  type RawLedgerRow, type NormalizedPartnerTx,
} from '../ledgerRowFilter'
import { buildIdentityDirectory } from './identityDirectoryReader'

export type LedgerReadFailureKind =
  | 'LEDGER_SOURCE_UNAVAILABLE'
  | 'EXCLUSIONS_SOURCE_UNAVAILABLE'
  | 'IDENTITY_SOURCE_UNAVAILABLE'

export interface PartnerLedgerReadResult {
  readonly txns: readonly NormalizedPartnerTx[]
  readonly sourceFailures: readonly { readonly kind: LedgerReadFailureKind; readonly reason: string }[]
}

export async function readPartnerLedger(fromDate?: string, toDate?: string): Promise<PartnerLedgerReadResult> {
  const db = createServiceClient()

  let q = db
    .from('transactions')
    .select('id, date, property_name, category, subcategory, payer, payee, amount_eur, is_deleted, review_status')
  if (fromDate) q = q.gte('date', fromDate)
  if (toDate) q = q.lte('date', toDate)
  const { data: txData, error: txError } = await q

  // Fail closed on ledger source.
  if (txError || txData == null) {
    return { txns: [], sourceFailures: [{ kind: 'LEDGER_SOURCE_UNAVAILABLE', reason: `transactions query failed: ${String(txError ?? 'null data')}` }] }
  }

  // Active exclusions — part 3 of the certified-read predicate. Read-only.
  const { data: exData, error: exError } = await db
    .from('transaction_exclusions')
    .select('transaction_id, is_active')
    .eq('is_active', true)

  // Fail closed on exclusions source — never continue with an empty exclusion set.
  if (exError || exData == null) {
    return { txns: [], sourceFailures: [{ kind: 'EXCLUSIONS_SOURCE_UNAVAILABLE', reason: `transaction_exclusions query failed: ${String(exError ?? 'null data')}` }] }
  }

  // Canonical identity directory (registry.parties). Fail closed if unavailable.
  const rows = txData as RawLedgerRow[]
  const { directory, sourceUnavailable } = await buildIdentityDirectory(distinctPartyNames(rows))
  if (sourceUnavailable) {
    return { txns: [], sourceFailures: [{ kind: 'IDENTITY_SOURCE_UNAVAILABLE', reason: 'canonical party authority (registry.parties) unavailable — identities cannot be certified' }] }
  }

  const read = buildLedgerFromSources(
    { txData: rows, txError: null, exData: exData as { transaction_id: string }[], exError: null },
    directory,
  )
  // buildLedgerFromSources re-validates the same predicate; map any residual failures.
  const sourceFailures = read.failures.map(f => ({ kind: f.kind as LedgerReadFailureKind, reason: f.reason }))
  return { txns: read.txns, sourceFailures }
}
