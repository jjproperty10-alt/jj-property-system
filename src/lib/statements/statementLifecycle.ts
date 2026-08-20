/**
 * JJ Property 10 - Statement lifecycle orchestration (pure) (Gate certification)
 *
 * Pure, deterministic mapping from the read-only statement disposition + the G8
 * re-proposal result into the inputs the DEPLOYED lifecycle RPCs consume:
 *   - add_draft_line(p_draft_id, p_source_transaction_id, p_release_amount_eur,
 *     p_include, p_line_notes)  -> DraftLineInput[]
 *   - send_statement(..., p_entries jsonb, ...)  -> SnapshotEntryInput[]
 *
 * This module performs NO I/O and mutates nothing. It is the piece that "feeds
 * computeReproposal into the next draft": prior open obligations returned by the
 * re-proposal engine are merged (deduped) with the current period's
 * balance-affecting rows to form the next draft's line set. The actual writes
 * happen in the server actions (statementLifecycleActions.ts), which call the
 * existing production RPCs - this file only decides WHAT to write, deterministically.
 *
 * No accounting recompute: amounts come straight from the disposition
 * (clientAmountEur / signedBalanceEffect) and the re-proposal remaining amounts.
 */
import type {
  TransactionDisposition,
  DraftLineInput,
  SnapshotEntryInput,
} from './types'
import type { ReproposalResult } from './reproposal'

/** Options for building the next draft's lines. */
export interface NextDraftOptions {
  /**
   * Remaining owed amount per re-proposed transaction id (EUR). Sourced from the
   * prior cycle's BillingStateDTO.remainingEur. If a re-proposed obligation's
   * remaining is UNKNOWN (missing / null / non-finite), it is NOT turned into a
   * line - P-ARCH-1: Unknown != 0. It is surfaced as UNRESOLVED and blocks
   * finalization until a real amount is provided.
   */
  readonly remainingByTxId?: Readonly<Record<string, number | null>>
  /** Notes to attach to re-proposed lines (defaults to a stable marker). */
  readonly reproposedLineNote?: string
}

/** A draft line plus its provenance (current period vs re-proposed prior obligation). */
export interface PlannedDraftLine extends DraftLineInput {
  readonly origin: 'current_period' | 'reproposed'
}

/** A re-proposed obligation that cannot be turned into a line yet. */
export interface UnresolvedObligation {
  readonly transactionId: string
  readonly reason: 'unknown_remaining_amount'
}

/** Result of planning the next draft's lines, with unresolved obligations surfaced. */
export interface NextDraftPlan {
  readonly lines: PlannedDraftLine[]
  /** Re-proposed obligations whose remaining amount is unknown; MUST be resolved before finalize. */
  readonly unresolved: UnresolvedObligation[]
  /** False when any obligation is unresolved (finalization is blocked). */
  readonly canFinalize: boolean
}

/** Balance-affecting rows of the current period become included draft lines. */
export function currentPeriodDraftLines(rows: readonly TransactionDisposition[]): PlannedDraftLine[] {
  const out: PlannedDraftLine[] = []
  for (const r of rows) {
    if (r.bucket !== 'BALANCE_AFFECTING') continue
    out.push({
      sourceTransactionId: r.transactionId,
      releaseAmountEur: r.clientAmountEur,
      includeInStatement: true,
      lineNotes: null,
      origin: 'current_period',
    })
  }
  return out
}

/**
 * Re-proposed prior obligations (from computeReproposal). Those with a KNOWN finite
 * remaining amount become included lines; those with an UNKNOWN remaining are surfaced
 * as `unresolved` and are NEVER emitted as a EUR 0 line (P-ARCH-1: Unknown != 0).
 */
export function reproposedDraftLines(
  reproposal: ReproposalResult,
  options: NextDraftOptions = {},
): { lines: PlannedDraftLine[]; unresolved: UnresolvedObligation[] } {
  const remaining = options.remainingByTxId ?? {}
  const note = options.reproposedLineNote ?? 're-proposed: obligation left open on a prior statement'
  const lines: PlannedDraftLine[] = []
  const unresolved: UnresolvedObligation[] = []
  for (const txId of reproposal.reproposal) {
    const amt = remaining[txId]
    if (typeof amt === 'number' && Number.isFinite(amt)) {
      lines.push({
        sourceTransactionId: txId,
        releaseAmountEur: amt,
        includeInStatement: true,
        lineNotes: note,
        origin: 'reproposed',
      })
    } else {
      unresolved.push({ transactionId: txId, reason: 'unknown_remaining_amount' })
    }
  }
  return { lines, unresolved }
}

/**
 * Plan the next draft's full line set: current-period balance-affecting rows PLUS
 * re-proposed prior obligations with a KNOWN remaining, deduped by source transaction
 * id (current period wins if a tx appears in both). Re-proposed obligations with an
 * unknown remaining are returned as `unresolved` and set `canFinalize=false` - they
 * must be resolved to a real amount before the draft can be finalized. Deterministic
 * and order-stable: current-period lines first, then re-proposed lines.
 */
export function planNextDraftLines(
  rows: readonly TransactionDisposition[],
  reproposal: ReproposalResult,
  options: NextDraftOptions = {},
): NextDraftPlan {
  const current = currentPeriodDraftLines(rows)
  const seen = new Set(current.map(l => l.sourceTransactionId))
  const rep = reproposedDraftLines(reproposal, options)
  const reproposed = rep.lines.filter(l => !seen.has(l.sourceTransactionId))
  // An obligation already covered by a current-period line is resolved, not blocking.
  const unresolved = rep.unresolved.filter(u => !seen.has(u.transactionId))
  return {
    lines: [...current, ...reproposed],
    unresolved,
    canFinalize: unresolved.length === 0,
  }
}

/**
 * Freeze the balance-affecting rows into snapshot entries for send_statement's
 * p_entries. Classification is taken verbatim from the disposition (frozen at
 * finalization); no recompute.
 */
export function buildSnapshotEntries(rows: readonly TransactionDisposition[]): SnapshotEntryInput[] {
  const out: SnapshotEntryInput[] = []
  for (const r of rows) {
    if (r.bucket !== 'BALANCE_AFFECTING') continue
    out.push({
      source_transaction_id: r.transactionId,
      released_amount_eur: r.clientAmountEur,
      signed_balance_effect_eur: r.signedBalanceEffect,
      is_balance_affecting: r.isBalanceAffecting,
      is_bpo: r.isBpo,
      balance_effect: r.balanceEffect,
      display_group: r.displayGroup,
      display_label: r.displayLabel,
    })
  }
  return out
}

/** Convenience totals for a planned line set (deterministic; no recompute). */
export function draftLineTotals(lines: readonly PlannedDraftLine[]): {
  lineCount: number
  currentPeriodCount: number
  reproposedCount: number
  totalReleaseEur: number
} {
  let totalReleaseEur = 0
  let currentPeriodCount = 0
  let reproposedCount = 0
  for (const l of lines) {
    totalReleaseEur += l.releaseAmountEur
    if (l.origin === 'current_period') currentPeriodCount += 1
    else reproposedCount += 1
  }
  return { lineCount: lines.length, currentPeriodCount, reproposedCount, totalReleaseEur }
}
