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
 * FAIL-CLOSED (QA #185-1): if the ledger or the exclusions source is unavailable, this
 * NEVER falls back to an empty exclusion set or an empty ledger that could look like a
 * valid zero result — it returns a source-failure blocker instead.
 *
 * Identity (QA #185-2): payer/payee are resolved canonical-first via an injected
 * IdentityDirectory (registry.parties), with approved aliases as explicit fallback.
 */

import { resolveParty, resolvePartyWith, type ResolvedParty, type IdentityDirectory } from './identityResolver'

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

function res(directory: IdentityDirectory | undefined, raw: string | null): ResolvedParty {
  return directory ? resolvePartyWith(directory, raw) : resolveParty(raw)
}

/**
 * A row is partner-relevant when a PARTNER (Yossi/Jacob) is payer or payee, OR when a
 * settlement-sensitive Transfer pairs JJ with an ambiguous counterparty (so a partner
 * hiding behind an unrecognised name is never silently dropped — it reaches the engine
 * and becomes IDENTITY_UNRESOLVED).
 */
export function isPartnerRelevant(
  row: { payer: string | null; payee: string | null; category?: string | null },
  directory?: IdentityDirectory,
): boolean {
  const p = res(directory, row.payer ?? null)
  const q = res(directory, row.payee ?? null)
  if (p.role === 'PARTNER' || q.role === 'PARTNER') return true
  const anyAmbiguous = p.ambiguous || q.ambiguous
  const anyJJ = p.role === 'JJ' || q.role === 'JJ'
  if (row.category === 'Transfer' && anyAmbiguous && anyJJ) return true
  return false
}

export function normalizePartnerTx(row: RawLedgerRow, directory?: IdentityDirectory): NormalizedPartnerTx {
  return {
    id: row.id,
    date: row.date,
    propertyName: row.property_name,
    category: row.category,
    subcategory: row.subcategory,
    amountEur: row.amount_eur,
    payer: res(directory, row.payer),
    payee: res(directory, row.payee),
  }
}

/** Full pure pipeline: certified + partner-relevant → normalized. */
export function toPartnerLedger(
  rows: readonly RawLedgerRow[],
  activeExcludedIds: ReadonlySet<string>,
  directory?: IdentityDirectory,
): NormalizedPartnerTx[] {
  const out: NormalizedPartnerTx[] = []
  for (const r of rows) {
    if (!isCertifiedLedgerRow(r, activeExcludedIds)) continue
    if (!isPartnerRelevant(r, directory)) continue
    out.push(normalizePartnerTx(r, directory))
  }
  return out
}

/** Distinct non-blank payer/payee strings (for building the identity directory). */
export function distinctPartyNames(rows: readonly RawLedgerRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    for (const raw of [r.payer, r.payee]) {
      if (raw == null) continue
      const t = raw.trim()
      if (t === '') continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

// ─── Fail-closed source assembly (QA #185-1) ─────────────────────────────────────

export type LedgerSourceFailureKind =
  | 'LEDGER_SOURCE_UNAVAILABLE'
  | 'EXCLUSIONS_SOURCE_UNAVAILABLE'

export interface LedgerSourceFailure {
  readonly kind: LedgerSourceFailureKind
  readonly reason: string
}

export interface PartnerLedgerRead {
  readonly txns: readonly NormalizedPartnerTx[]
  readonly failures: readonly LedgerSourceFailure[]
}

export interface RawSourceResult {
  readonly txData: RawLedgerRow[] | null
  readonly txError: unknown
  readonly exData: readonly { transaction_id: string }[] | null
  readonly exError: unknown
}

/**
 * Assemble the certified partner ledger from raw source results, FAIL-CLOSED:
 *  - transactions query errored or returned null → LEDGER_SOURCE_UNAVAILABLE, no rows.
 *  - exclusions query errored or returned null   → EXCLUSIONS_SOURCE_UNAVAILABLE, no rows
 *    (NEVER continue with an empty exclusion set — excluded txns must not slip in).
 * The empty `txns` in a failure case is paired with a blocker, so it can never be
 * mistaken for a valid zero result.
 */
export function buildLedgerFromSources(src: RawSourceResult, directory?: IdentityDirectory): PartnerLedgerRead {
  if (src.txError || src.txData == null) {
    return { txns: [], failures: [{ kind: 'LEDGER_SOURCE_UNAVAILABLE', reason: `transactions query failed: ${String(src.txError ?? 'null data')}` }] }
  }
  if (src.exError || src.exData == null) {
    return { txns: [], failures: [{ kind: 'EXCLUSIONS_SOURCE_UNAVAILABLE', reason: `transaction_exclusions query failed: ${String(src.exError ?? 'null data')}` }] }
  }
  const excluded = new Set<string>(src.exData.map(r => r.transaction_id))
  return { txns: toPartnerLedger(src.txData, excluded, directory), failures: [] }
}
