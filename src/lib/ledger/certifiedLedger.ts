/**
 * Certified ledger admission predicate (Phase 0D).
 *
 * Single reusable definition for report-admitted transaction rows:
 *   COALESCE(is_deleted, false) = false
 *   AND (review_status = 'active' OR review_status IS NULL)
 *   AND id NOT IN active transaction_exclusions
 *
 * Partner Settlement keeps its own isCertifiedLedgerRow export unchanged.
 * This module is the shared helper for RC3 fixtures, STR extras/PI, and tests.
 * Do not reimplement a drifting copy in React components.
 */

export const CERTIFIED_LEDGER_VIEW = 'v_certified_ledger_transactions'

export interface CertifiedLedgerRowInput {
  readonly id: string
  readonly is_deleted?: boolean | null
  readonly review_status?: string | null
}

export function isCertifiedLedgerRow(
  row: CertifiedLedgerRowInput,
  activeExcludedIds: ReadonlySet<string>,
): boolean {
  if (row.is_deleted === true) return false
  if (row.review_status != null && row.review_status !== 'active') return false
  if (activeExcludedIds.has(row.id)) return false
  return true
}

export type CertifiedLedgerAssembly<T> =
  | { readonly ok: true; readonly rows: readonly T[] }
  | { readonly ok: false; readonly reason: 'LEDGER_SOURCE_UNAVAILABLE' | 'EXCLUSIONS_SOURCE_UNAVAILABLE' }

/**
 * Fail-closed assembly when the caller fetched transactions + exclusions separately.
 * A failed exclusion read MUST NOT continue with an empty exclusion set.
 */
export function assembleCertifiedLedgerRows<T extends CertifiedLedgerRowInput>(src: {
  readonly txData: readonly T[] | null
  readonly txError: unknown
  readonly exData: readonly { transaction_id: string }[] | null
  readonly exError: unknown
}): CertifiedLedgerAssembly<T> {
  if (src.txError || src.txData == null) {
    return { ok: false, reason: 'LEDGER_SOURCE_UNAVAILABLE' }
  }
  if (src.exError || src.exData == null) {
    return { ok: false, reason: 'EXCLUSIONS_SOURCE_UNAVAILABLE' }
  }
  const excluded = new Set(src.exData.map(r => r.transaction_id))
  return { ok: true, rows: src.txData.filter(r => isCertifiedLedgerRow(r, excluded)) }
}

export class CertifiedLedgerUnavailableError extends Error {
  readonly reason: 'LEDGER_SOURCE_UNAVAILABLE' | 'EXCLUSIONS_SOURCE_UNAVAILABLE'
  constructor(reason: CertifiedLedgerUnavailableError['reason'], detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason)
    this.name = 'CertifiedLedgerUnavailableError'
    this.reason = reason
  }
}
