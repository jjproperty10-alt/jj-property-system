/**
 * JJ Property 10 - Re-proposal engine + regression lock (G8)
 *
 * Pure, deterministic resolution of "which owed obligations must be re-proposed
 * onto the NEXT statement draft". This is the app-layer selection policy the
 * closure spec requires; it does NOT create drafts, does NOT send statements, and
 * does NOT touch any P1-1 mutation RPC (the VS-1A STOP condition stays intact). It
 * only classifies existing per-row billing/payment/presentation state.
 *
 * It builds ON the existing infrastructure rather than replacing it:
 *  - billing/payment state comes from BillingStateDTO (resolveBillingStates).
 *  - presentation intent comes from the presentation override
 *    (StatementPresentationOverrideDTO.presentationStatus), which is
 *    presentation-only and NEVER changes amounts, dates, or balances.
 *
 * LOCKED business rules encoded here (this file is the regression lock):
 *  - "Exclude keeps the obligation open + auto re-proposed": an EXCLUDED row is
 *    still owed and must reappear on the next draft.
 *  - "Unbilled" rows are owed but never proposed yet -> proposal candidates too
 *    (mirrors BillingStateDTO.canRepropose = excluded | unbilled).
 *  - "Include != paid": PRESENTED / PENDING means the charge is ON a statement,
 *    NOT that it was collected. Presented obligations are not re-proposed and are
 *    not settled.
 *  - Payment closes an obligation, not inclusion: paymentState 'paid' => SETTLED,
 *    and that dominates every other state (a paid row is never re-proposed).
 *  - Presentation intent governs WHEN an open charge appears, never the money:
 *      internal_only     -> never on the owner statement (suppressed).
 *      defer_until_date  -> held until asOf >= deferUntilDate, then re-proposed.
 *      next_statement    -> explicitly re-proposed onto the next draft.
 *      include_now/none  -> the billing-state rule decides.
 *  - Unknown is never coerced: a null paymentState is "not proven paid"; a defer
 *    with no asOf stays held rather than being silently proposed.
 */
import type {
  BillingStateDTO,
  BillingState,
  PaymentState,
  PresentationStatus,
  EuroAmount,
} from '@/lib/owners/ownerWorkspaceTypes'

/** What should happen to an obligation on the next statement cycle. */
export type ObligationDisposition =
  | 'open_reproposal' // owed and not on a live statement -> auto re-propose next draft
  | 'presented'       // already on a draft/sent statement, not yet paid -> leave as is
  | 'settled'         // fully paid -> closed, never re-proposed
  | 'held_deferred'   // defer_until_date not yet reached -> not proposed yet
  | 'internal_only'   // presentation internal_only -> never on the owner statement

/** Optional presentation intent for a row (subset of StatementPresentationOverrideDTO). */
export interface RowPresentation {
  readonly presentationStatus: PresentationStatus
  readonly deferUntilDate: string | null
}

export interface RowBillingState {
  readonly transactionId: string
  readonly state: BillingStateDTO
  /** Optional presentation override; absent = no presentation intent. */
  readonly presentation?: RowPresentation | null
}

export interface ReproposalOptions {
  /** ISO date used to evaluate defer_until_date holds. Absent = holds stay held. */
  readonly asOf?: string | null
}

export interface ObligationOutcome {
  readonly transactionId: string
  readonly disposition: ObligationDisposition
  readonly billingState: BillingState
  readonly paymentState: PaymentState | null
  readonly presentationStatus: PresentationStatus | null
  readonly remainingEur: EuroAmount
}

export interface ReproposalResult {
  /** Transaction ids that MUST be re-proposed onto the next draft. */
  readonly reproposal: string[]
  /** Ids already presented/pending on a statement (not re-proposed). */
  readonly presented: string[]
  /** Ids whose obligation is closed by full payment. */
  readonly settled: string[]
  /** Ids held by a not-yet-reached defer_until_date. */
  readonly heldDeferred: string[]
  /** Ids suppressed as internal_only (never owner-facing). */
  readonly internalOnly: string[]
  /** Full per-row outcome, input order preserved. */
  readonly outcomes: ObligationOutcome[]
}

/** Billing states that represent an owed-but-not-live obligation. */
const OPEN_BILLING_STATES: ReadonlySet<BillingState> = new Set<BillingState>(['excluded', 'unbilled'])

/**
 * Classify a single row. Precedence:
 *   1. paymentState 'paid'           -> settled (payment closes the obligation).
 *   2. presentation internal_only    -> internal_only (never owner-facing).
 *   3. presentation defer_until_date & asOf < deferUntilDate (or asOf unknown)
 *                                     -> held_deferred.
 *   4. presentation next_statement    -> open_reproposal (explicit re-propose).
 *   5. otherwise -> billing-state rule: excluded|unbilled -> open_reproposal,
 *      else presented.
 */
export function classifyObligation(
  state: BillingStateDTO,
  presentation?: RowPresentation | null,
  asOf?: string | null,
): ObligationDisposition {
  if (state.paymentState === 'paid') return 'settled'

  const ps = presentation?.presentationStatus
  if (ps === 'internal_only') return 'internal_only'
  if (ps === 'defer_until_date') {
    const until = presentation?.deferUntilDate ?? null
    // Held unless we can prove the deferral has elapsed (asOf >= until).
    if (!asOf || !until || asOf < until) return 'held_deferred'
    // deferral elapsed -> fall through to open/presented logic below
  }
  if (ps === 'next_statement') return 'open_reproposal'

  if (OPEN_BILLING_STATES.has(state.billingState)) return 'open_reproposal'
  return 'presented'
}

/** True when the row must be re-proposed onto the next draft. */
export function mustRepropose(
  state: BillingStateDTO,
  presentation?: RowPresentation | null,
  asOf?: string | null,
): boolean {
  return classifyObligation(state, presentation, asOf) === 'open_reproposal'
}

/**
 * Resolve the re-proposal set across many rows. Deterministic and stable: the
 * `outcomes` array preserves input order and every id list follows it.
 */
export function computeReproposal(
  rows: readonly RowBillingState[],
  options: ReproposalOptions = {},
): ReproposalResult {
  const asOf = options.asOf ?? null
  const outcomes: ObligationOutcome[] = []
  const reproposal: string[] = []
  const presented: string[] = []
  const settled: string[] = []
  const heldDeferred: string[] = []
  const internalOnly: string[] = []

  for (const { transactionId, state, presentation } of rows) {
    const disposition = classifyObligation(state, presentation, asOf)
    outcomes.push({
      transactionId,
      disposition,
      billingState: state.billingState,
      paymentState: state.paymentState,
      presentationStatus: presentation?.presentationStatus ?? null,
      remainingEur: state.remainingEur,
    })
    if (disposition === 'open_reproposal') reproposal.push(transactionId)
    else if (disposition === 'presented') presented.push(transactionId)
    else if (disposition === 'settled') settled.push(transactionId)
    else if (disposition === 'held_deferred') heldDeferred.push(transactionId)
    else internalOnly.push(transactionId)
  }

  return { reproposal, presented, settled, heldDeferred, internalOnly, outcomes }
}

/**
 * Convenience adapter for the Map returned by resolveBillingStates(seriesId, ids),
 * with an optional presentation lookup and asOf. Map iteration is insertion order,
 * so the result stays deterministic.
 */
export function computeReproposalFromMap(
  states: ReadonlyMap<string, BillingStateDTO>,
  presentationById?: ReadonlyMap<string, RowPresentation | null> | null,
  options: ReproposalOptions = {},
): ReproposalResult {
  const rows: RowBillingState[] = []
  states.forEach((state, transactionId) =>
    rows.push({ transactionId, state, presentation: presentationById?.get(transactionId) ?? null }),
  )
  return computeReproposal(rows, options)
}
