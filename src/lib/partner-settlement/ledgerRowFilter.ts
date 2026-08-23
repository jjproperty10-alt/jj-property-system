/**
 * @module partner-settlement/ledgerRowFilter
 * @description Pure certified-ledger filtering + normalization (no I/O, no server-only).
 *
 * The canonical certified-read predicate for public.transactions — reused verbatim
 * from the repository's established rule (see src/lib/report/fetchReport.ts,
 * supabase STR settlement views, and 20260817 FIFO migration):
 *
 *   is_deleted IS NOT TRUE
 *   AND (review_status = 'active' OR review_status IS NULL)
 *   AND NOT EXISTS (active row in transaction_exclusions for this tx)
 *
 * The transaction_exclusions membership is resolved by SQL in the adapter and passed
 * here as an id set. This module NEVER mutates and NEVER coerces unknowns.
 */

import { resolveParty, type ResolvedParty } from './identityResolver'

export interface RawLedgerRow {
  readonly id: string
  readonly date: string
  readonly property_name: string | null
  readonly category: string
  readonly subcategory: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number
  readonly is_deleted?: boolean | null
  readonly review_status?: string | null
}

export interface NormalizedPartnerTx {
  readonly id: string
  readonly date: string
  readonly propertyName: string | null
  readonly category: string
  readonly subcategory: string | null
  readonly amountEur: number
  readonly payer: ResolvedParty
  readonly payee: ResolvedParty
}

/** The canonical certified-read predicate (single source of truth for exclusions). */
export function isCertifiedLedgerRow(
  row: Pick<RawLedgerRow, 'id' | 'is_deleted' | 'review_status'>,
  activeExcludedIds: ReadonlySet<string>,
): boolean {
  if (row.is_deleted === true) return false
  if (row.review_status != null && row.review_status !== 'active') return false
  if (activeExcludedIds.has(row.id)) return false
  return true
}

/**
 * A row is partner-relevant when a PARTNER (Yossi/Jacob) is payer or payee.
 * JJ↔external and external↔external rows are outside the partner report.
 */
export function isPartnerRelevant(row: Pick<RawLedgerRow, 'payer' | 'payee'>): boolean {
  return resolveParty(row.payer).role === 'PARTNER' || resolveParty(row.payee).role === 'PARTNER'
}

export function normalizePartnerTx(row: RawLedgerRow): NormalizedPartnerTx {
  return {
    id: row.id,
    date: row.date,
    propertyName: row.property_name,
    category: row.category,
    subcategory: row.subcategory,
    amountEur: row.amount_eur,
    payer: resolveParty(row.payer),
    payee: resolveParty(row.payee),
  }
}

/** Full pure pipeline: certified + partner-relevant → normalized. */
export function toPartnerLedger(
  rows: readonly RawLedgerRow[],
  activeExcludedIds: ReadonlySet<string>,
): NormalizedPartnerTx[] {
  const out: NormalizedPartnerTx[] = []
  for (const r of rows) {
    if (!isCertifiedLedgerRow(r, activeExcludedIds)) continue
    if (!isPartnerRelevant(r)) continue
    out.push(normalizePartnerTx(r))
  }
  return out
}
