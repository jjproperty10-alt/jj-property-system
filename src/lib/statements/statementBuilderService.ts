/**
 * @module statements/statementBuilderService
 * @description VS-1A — Statement builder: assembles StatementBuilderOutput for one investor+property+period.
 *
 * Server-side only. Calls:
 *   1. RC3 engine (fetchRC3Report) to get classified transactions
 *   2. Disposition engine (classifyDisposition) to produce disposition buckets
 *   3. Lifecycle schema to get ownership + investor identity
 *
 * DOES NOT:
 *   - Call any P1-1 mutation RPCs (VS-1A STOP condition)
 *   - Create statement_series, statement_drafts, or draft_lines
 *   - Create immutable snapshots
 *   - Write to any table
 *   - Accept a bypass parameter for freshness or finalization
 *
 * R4: Authentication must occur before this service is called.
 *     This service uses service-role client for reads only.
 * R5: Freshness carries structured missing-source data.
 * R6: Opening balance = NULL, settlement = NOT_YET_COMPUTED.
 *
 * @see StatementBuilderOutput in ./types — output contract
 * @see classifyDisposition in ./dispositionEngine — pure classification
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-5: lifecycle and public schema fetched independently.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { classifyDisposition } from './dispositionEngine'
import type { RC3AccountRow, RC3AccountSection } from '@/lib/report/types'
import type {
  StatementBuilderOutput,
  AccountSectionSummary,
  SourceFreshnessGate,
  SourceFreshnessEntry,
} from './types'

// ─── Input contract ─────────────────────────────────────────────────────────────

export interface BuildStatementInput {
  /** Investor entity UUID from lifecycle.entity_identity */
  readonly investorEntityId: string

  /** Investor canonical name (for display) */
  readonly investorName: string

  /** Property name (reporting_name for RC3) */
  readonly propertyName: string

  /** Statement period start (ISO date) */
  readonly periodStart: string

  /** Statement period end (ISO date) */
  readonly periodEnd: string
}

// ─── Source freshness assessment (R5) ──────────────────────────────────────────

/**
 * Known data sources that must be synced for a complete statement.
 * Each source must be verified through the period end date.
 */
const REQUIRED_SOURCES = [
  'transactions',            // JJ accounting ledger
  'hostaway_reservations',   // PMS reservation data
  'hostaway_financials',     // PMS financial data
] as const

/**
 * Assess whether all data sources are synced through the statement period end.
 *
 * VS-1A: No automated freshness verification is implemented yet.
 * Returns DATA_FRESHNESS_UNKNOWN with structured missing-source data.
 *
 * R5: No bypass parameter exists. Freshness is assessed, not overridden.
 *
 * Future: will check Hostaway sync date, last transaction import date, etc.
 */
function assessFreshness(periodEnd: string): SourceFreshnessGate {
  // VS-1A: no source has verified sync — all are missing
  const sources: SourceFreshnessEntry[] = REQUIRED_SOURCES.map(sourceName => ({
    sourceName,
    lastVerified: null,
    requiredCutoff: periodEnd,
    isSufficient: false,
  }))

  const missingSources = sources
    .filter(s => !s.isSufficient)
    .map(s => s.sourceName)

  return {
    status: 'DATA_FRESHNESS_UNKNOWN',
    periodEnd,
    lastVerifiedSourceTimestamp: null,
    requiredCutoff: periodEnd,
    missingSources,
    freshnessBlockerReason: `${missingSources.length} of ${REQUIRED_SOURCES.length} required sources have no verified sync date. Cannot confirm data completeness through ${periodEnd}.`,
    sources,
    message: `Cannot confirm all sources are synced through ${periodEnd}. Missing: ${missingSources.join(', ')}. Manual verification required before finalization.`,
  }
}

// ─── Finalization gate ──────────────────────────────────────────────────────────

function computeFinalizationBlockers(
  freshness: SourceFreshnessGate,
  unresolvedCount: number,
  openingBalanceStatus: 'NULL' | 'PENDING_RECONCILIATION' | 'CONFIRMED',
): string[] {
  const blockers: string[] = []

  if (openingBalanceStatus === 'NULL') {
    blockers.push('Opening balance is NULL — reconciliation required before finalization')
  }
  if (openingBalanceStatus === 'PENDING_RECONCILIATION') {
    blockers.push('Opening balance is PENDING_RECONCILIATION — confirmation required')
  }
  if (freshness.status !== 'VERIFIED') {
    blockers.push(`Source freshness: ${freshness.status} — ${freshness.freshnessBlockerReason ?? freshness.message}`)
  }
  if (unresolvedCount > 0) {
    blockers.push(`${unresolvedCount} UNRESOLVED transaction(s) — all must be classified before finalization`)
  }

  // VS-1A permanent blocker — no bypass parameter
  blockers.push('VS-1A scope: production finalization not authorized')

  return blockers
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build a complete StatementBuilderOutput for one investor + property + period.
 *
 * Read-only. Does not create drafts or call P1-1 RPCs.
 *
 * PRECONDITION: Caller must have authenticated and authorized the request
 * via authenticateStatementUser() + resolveStatementTarget() BEFORE calling this.
 * This service uses service-role client for reads — it does NOT re-authenticate.
 * See R4 and statementAuthService.ts for the authorization boundary.
 *
 * @param input  Investor + property + period specification
 * @returns      StatementBuilderOutput with disposition, freshness, finalization gates
 * @throws       If RC3 report fails entirely (no data and error)
 */
export async function buildStatementPreview(
  input: BuildStatementInput,
): Promise<StatementBuilderOutput> {
  const { investorEntityId, investorName, propertyName, periodStart, periodEnd } = input
  const db = createServiceClient()

  // ── 1. Fetch RC3 report for the property + period ─────────────────────────
  const rc3Report = await fetchRC3Report({
    reportingName: propertyName,
    fromDate: periodStart,
    toDate: periodEnd,
  })

  // ── 2. Flatten all rows across account sections for disposition ───────────
  const allRows: RC3AccountRow[] = rc3Report.accounts.flatMap(s => s.rows)

  // ── 3. Run disposition engine (pure, no DB) ───────────────────────────────
  const disposition = classifyDisposition(allRows, periodStart, periodEnd)

  // ── 4. Build account section summaries ────────────────────────────────────
  const accountSections: AccountSectionSummary[] = rc3Report.accounts.map(
    (section: RC3AccountSection) => ({
      accountType: section.account_type,
      accountLabel: section.account_label,
      totalIncomeEur: section.total_income,
      totalExpensesEur: section.total_expenses,
      netEur: section.total_income - section.total_expenses,
      rowCount: section.rows.length,
    }),
  )

  // ── 5. Look up ownership percentage from lifecycle ────────────────────────
  let ownershipPct: number | null = null
  try {
    const { data: ownershipRows } = await db
      .schema('lifecycle')
      .from('ownership_period')
      .select('ownership_pct')
      .eq('entity_id', investorEntityId)
      .eq('property_name', propertyName)
      .neq('status', 'void')
      .is('effective_to', null)  // current period only

    if (ownershipRows && ownershipRows.length > 0) {
      ownershipPct = (ownershipRows[0] as { ownership_pct: number }).ownership_pct
    }
  } catch {
    // Ownership data unavailable — stays null (P-ARCH-1)
  }

  // ── 6. Assess source freshness (R5: structured, not decorative) ──────────
  const freshness = assessFreshness(periodEnd)

  // ── 7. Opening balance — always NULL in VS-1A (D-VS01-3: Option C) ────────
  // R6: status is explicit. NULL ≠ €0 — never format null as zero.
  const openingBalance = {
    status: 'NULL' as const,
    valueEur: null,
    source: null,
  }

  // ── 7b. Settlement — always NOT_YET_COMPUTED in VS-1A (R6) ───────────────
  const settlement = {
    status: 'NOT_YET_COMPUTED' as const,
    valueEur: null,
  }

  // ── 8. Compute finalization blockers ──────────────────────────────────────
  const finalizationBlockers = computeFinalizationBlockers(
    freshness,
    disposition.unresolved,
    openingBalance.status,
  )

  // ── 9. Assemble output ────────────────────────────────────────────────────
  return {
    investorName,
    investorEntityId,
    propertyName,
    periodStart,
    periodEnd,
    disposition,
    freshness,
    openingBalance,
    settlement,
    canFinalize: finalizationBlockers.length === 0,
    finalizationBlockers,
    accountSections,
    statementType: 'investor_statement',
    ownershipPct,
    generatedAt: new Date().toISOString(),
  }
}
