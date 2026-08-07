/**
 * ownerFinancialAdapter — RC3 data consumer for Owner Financial tab.
 *
 * G3-A: Owner Workspace Financial RC3 Alignment (2026-07-25).
 * Architecture: OwnerFinancialService → OwnerFinancialAdapter → RC3 (fetchRC3Report)
 *
 * Responsibility:
 * - Calls fetchRC3Report once per property (never reads public.transactions directly)
 * - Composes owner-level position from RC3 engine-computed section aggregates
 * - Maps RC3 sections/rows to OwnerFinancialSectionDTO / OwnerFinancialRowDTO
 * - Platform tracking rows excluded (is_platform_tracking === true never reaches UI)
 * - 'reference' display group excluded (contract values are internal-only)
 *
 * Composition arithmetic — D-1 Option B (approved):
 * - Sum of RC3 engine-computed section aggregates ONLY
 * - No transaction arithmetic, no classification, no inference
 * - composedFrom field records the number of property reports used
 *
 * G3-17: This adapter does NOT import fetchRC3Report directly into Owner Workspace.
 *        Owner Workspace imports only from ownerFinancialService.ts (permanent boundary).
 * G3-18: This adapter does NOT import from ownerMaintenanceAdapter (no adapter-to-adapter).
 *
 * Adapters are replaceable; the Service contract is permanent.
 */

import 'server-only'

import { fetchRC3Report } from '@/lib/report/fetchReport'
import type {
  RC3AccountSection,
  RC3AccountRow,
  RC3PropertyReport,
  DisplayGroup,
} from '@/lib/report/types'
import { computeNetOwnerBalance } from '@/lib/report/executiveSummary'
import { createServiceClient } from '@/lib/supabase'
import type {
  OwnerFinancialDTO,
  OwnerFinancialSectionDTO,
  OwnerFinancialRowDTO,
  OwnerOverallNetDTO,
  OwnerDepartmentBalanceDTO,
  OccupancyPositionDTO,
  EuroAmount,
} from './ownerWorkspaceTypes'

// ─── Adapter input ────────────────────────────────────────────────────────────

export interface OwnerFinancialAdapterInput {
  /** Verified property names from identity resolver (management_relationship) */
  readonly properties: readonly string[]
  readonly fromDate?: string   // ISO date e.g. "2026-01-01"
  readonly toDate?: string     // ISO date e.g. "2026-12-31"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEur(n: number): EuroAmount {
  return String(n)
}

function mapDisplayGroup(dg: DisplayGroup): 'income' | 'expense' | 'payment' | 'info' {
  switch (dg) {
    case 'income':      return 'income'
    case 'expense':     return 'expense'
    case 'payment_out': return 'payment'
    case 'info':        return 'info'
    case 'reference':   return 'info'
    default:            return 'info'
  }
}

function mapRowToDTO(row: RC3AccountRow): OwnerFinancialRowDTO {
  return {
    id:           row.id,
    date:         row.date,
    description:  row.description ?? row.display_label ?? row.subcategory ?? '',
    displayGroup: mapDisplayGroup(row.display_group),
    amountEur:    toEur(row.client_amount),
    evidenceRef:  null,
  }
}

function mapSectionToDTO(section: RC3AccountSection): OwnerFinancialSectionDTO {
  const visibleRows = section.rows.filter(
    r => !r.is_platform_tracking && r.display_group !== 'reference',
  )
  return {
    type:               section.account_type,
    label:              section.account_label,
    incomeEur:          toEur(section.total_income),
    expensesEur:        toEur(section.total_expenses),
    netEur:             toEur(section.total_income - section.total_expenses),
    closingBalanceEur:  toEur(section.closing_balance),
    balanceConvention:  section.balance_convention,
    rows:               visibleRows.map(mapRowToDTO),
  }
}

// ─── Overall Net computation ─────────────────────────────────────────────────

function netLabel(net: number): 'due_to_jj' | 'due_to_you' | 'settled' {
  if (net < 0) return 'due_to_jj'
  if (net > 0) return 'due_to_you'
  return 'settled'
}

/**
 * Normalize a single section's closing balance to the owner's perspective.
 *
 * Convention:
 * - client_debt: positive closing = owner owes JJ → normalized negative
 * - owner_credit: positive closing = JJ owes owner → normalized positive
 *
 * This matches computeNetOwnerBalance():
 *   client_debt  → net -= closing_balance  (i.e. normalized = -closing)
 *   owner_credit → net += closing_balance  (i.e. normalized = +closing)
 */
function normalizeDepartment(section: RC3AccountSection): OwnerDepartmentBalanceDTO {
  const normalized = section.balance_convention === 'owner_credit'
    ? section.closing_balance
    : -section.closing_balance
  return {
    type:              section.account_type,
    label:             section.account_label,
    closingBalanceEur: toEur(section.closing_balance) as string,
    normalizedEur:     toEur(normalized) as string,
    label_status:      netLabel(normalized),
    displayAmountEur:  toEur(Math.abs(normalized)) as string,
  }
}

/**
 * Perspective correction (OSHRIT-ONLY — narrowed scope).
 *
 * For Oshrit Deklia specifically, JJ's Purchase Contract (€183K) is JJ-internal
 * acquisition cost that must not enter the owner-facing Overall Net. The client's
 * relationship is through the Sale contract.
 *
 * This correction is applied ONLY to properties listed in NEEDS_REVIEW_PROPERTIES.
 * Extending to all client properties requires a separate generic rule approval
 * from Yossi — see Oshrit Corrective Protocol scope correction.
 *
 * The Purchase section remains visible in the sections breakdown for JJ internal
 * reference; it is excluded only from the Overall Net computation.
 */
function applyPerspectiveCorrection(
  sections: RC3AccountSection[],
  properties: readonly string[],
): RC3AccountSection[] {
  const needsCorrection = properties.some(p => NEEDS_REVIEW_PROPERTIES.has(p))
  if (!needsCorrection) return sections
  return sections.filter(s => s.account_type !== 'purchase')
}

function buildOverallNet(
  sections: RC3AccountSection[],
  properties: readonly string[],
): OwnerOverallNetDTO | null {
  if (sections.length === 0) return null
  const ownerFacing = applyPerspectiveCorrection(sections, properties)
  if (ownerFacing.length === 0) return null
  const net = computeNetOwnerBalance(ownerFacing)
  const departments = ownerFacing.map(normalizeDepartment)
  return {
    departments,
    netEur:           toEur(net) as string,
    label:            netLabel(net),
    displayAmountEur: toEur(Math.abs(net)) as string,
  }
}

function emptyPosition(): OwnerFinancialDTO['position'] {
  return {
    incomeEur:         null,
    expensesEur:       null,
    netEur:            null,
    paidToOwnerEur:    null,
    pendingEur:        null,
    closingBalanceEur: null,
  }
}

// ─── Composition arithmetic (D-1 Option B) ───────────────────────────────────

/**
 * Compose owner-level financial position from RC3 engine section aggregates.
 *
 * Only uses engine-computed totals (total_income, total_expenses, total_bpo,
 * closing_balance). Never sums individual transaction amounts.
 */
function composePosition(sections: RC3AccountSection[]): OwnerFinancialDTO['position'] {
  const incomeEur         = sections.reduce((s, a) => s + a.total_income,     0)
  const expensesEur       = sections.reduce((s, a) => s + a.total_expenses,   0)
  const paidToOwnerEur    = sections.reduce((s, a) => s + a.total_bpo,        0)
  const closingBalanceEur = sections.reduce((s, a) => s + a.closing_balance,  0)
  return {
    incomeEur:         toEur(incomeEur),
    expensesEur:       toEur(expensesEur),
    netEur:            toEur(incomeEur - expensesEur),
    paidToOwnerEur:    toEur(paidToOwnerEur),
    pendingEur:        null,                           // RC2 scope — Settlement Engine
    closingBalanceEur: toEur(closingBalanceEur),
  }
}

// ─── Production guard ────────────────────────────────────────────────────────

/**
 * Properties with known incomplete accounting models.
 *
 * Oshrit Deklia: personal occupancy model not implemented — €20K accrued
 * obligations and €14K settled payments are not reflected in the RC3 engine.
 * Overall Net shows incorrect values until the occupancy + partner current-account
 * ledger architecture is built.
 *
 * Remove entries from this set as their accounting models are implemented.
 * See Oshrit Corrective Protocol Section 8.
 */
const NEEDS_REVIEW_PROPERTIES = new Set([
  'Oshrit Deklia',
])

/**
 * Properties that must bypass date filtering to show historical data.
 *
 * Superset of NEEDS_REVIEW_PROPERTIES — all reviewed properties also bypass
 * the date filter. Additional properties here have clean accounting models
 * but no current-month data (all rows predate the current period).
 *
 * Without this bypass, the Financial tab shows "No financial data available"
 * even though the owner has dozens of historical rows in RC3 views.
 *
 * Properties NOT in this set use the three-state display model instead:
 * - State A: current period has data → show normally
 * - State B: current period empty, historical exists → show message + summary
 * - State C: no historical data → "No financial data available"
 *
 * Permanent fix: historical date range selector (future scope).
 */
const BYPASS_DATE_FILTER_PROPERTIES = new Set([
  'Oshrit Deklia',
])

// ─── Occupancy Position ──────────────────────────────────────────────────

/**
 * Fetch occupancy position for properties with personal occupancy agreements.
 *
 * Only queries lifecycle.v_occupancy_position for NEEDS_REVIEW properties.
 * Returns null for properties without occupancy agreements (most owners).
 *
 * Uses service client — lifecycle schema has RLS deny-all.
 */
async function fetchOccupancyPosition(
  properties: readonly string[],
): Promise<OccupancyPositionDTO | null> {
  const needsReview = properties.filter(p => NEEDS_REVIEW_PROPERTIES.has(p))
  if (needsReview.length === 0) return null

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .schema('lifecycle')
      .from('v_occupancy_position')
      .select('*')
      .in('property_name', needsReview)
      .limit(1)
      .single()

    if (error || !data) return null

    return {
      propertyName:       data.property_name,
      monthlyAmountEur:   String(data.monthly_amount_eur),
      effectiveFrom:      data.effective_from,
      effectiveTo:        data.effective_to ?? null,
      agreementStatus:    data.agreement_status,
      totalObligations:   Number(data.total_obligations),
      settledCount:       Number(data.settled_count),
      openCount:          Number(data.open_count),
      totalObligatedEur:  String(data.total_obligated_eur),
      totalSettledEur:    String(data.total_settled_eur),
      outstandingEur:     String(data.outstanding_eur),
      settledByJjEur:     String(data.settled_by_jj_eur),
      settledByJacobEur:  String(data.settled_by_jacob_eur),
      settledByYossiEur:  String(data.settled_by_yossi_eur),
    }
  } catch {
    return null
  }
}


/**
 * Fetch a historical summary (date range + row count) for properties that
 * are NOT in BYPASS_DATE_FILTER_PROPERTIES. Returns null when no historical
 * rows exist or all properties bypass the date filter.
 */
async function fetchHistoricalSummary(
  properties: readonly string[],
): Promise<OwnerFinancialDTO['historicalSummary']> {
  const toCheck = properties.filter(p => !BYPASS_DATE_FILTER_PROPERTIES.has(p))
  if (toCheck.length === 0) return null

  try {
    const settled = await Promise.allSettled(
      toCheck.map(reportingName =>
        fetchRC3Report({ reportingName })
      ),
    )

    const reports: RC3PropertyReport[] = settled
      .filter((r): r is PromiseFulfilledResult<RC3PropertyReport> => r.status === 'fulfilled')
      .map(r => r.value)

    const allRows = reports.flatMap(r => r.accounts.flatMap(a => a.rows))
    if (allRows.length === 0) return null

    const dates = allRows
      .map(r => r.date)
      .filter((d): d is string => d != null)
      .sort()

    if (dates.length === 0) return null

    return {
      earliestDate: dates[0],
      latestDate: dates[dates.length - 1],
      rowCount: allRows.length,
    }
  } catch {
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch financial data for an owner's properties from the RC3 engine.
 *
 * Calls fetchRC3Report once per property in parallel (Promise.allSettled).
 * Failed properties are skipped — partial data is preferred over total failure.
 * Returns empty DTO with null position fields when all properties fail or none provided.
 */
export async function fetchOwnerFinancial(
  input: OwnerFinancialAdapterInput,
): Promise<OwnerFinancialDTO> {
  const { properties, fromDate, toDate } = input

  if (properties.length === 0) {
    return { position: emptyPosition(), overallNet: null, sections: [], timeline: [], occupancyPosition: null }
  }

  const settled = await Promise.allSettled(
    properties.map(reportingName => {
      // Phase 0: Properties with incomplete accounting models (e.g. Oshrit —
      // personal occupancy not yet in transactions) have no current-month rows.
      // Show all-time data so historical sections remain visible.
      // Other owners keep the caller-supplied date filter.
      const skipDateFilter = BYPASS_DATE_FILTER_PROPERTIES.has(reportingName)
      return fetchRC3Report({
        reportingName,
        fromDate: skipDateFilter ? undefined : fromDate,
        toDate: skipDateFilter ? undefined : toDate,
      })
    }),
  )

  const reports: RC3PropertyReport[] = settled
    .filter((r): r is PromiseFulfilledResult<RC3PropertyReport> => r.status === 'fulfilled')
    .map(r => r.value)

  if (reports.length === 0) {
    // Still fetch occupancy even if RC3 reports fail — the position data
    // lives in lifecycle schema, independent of RC3.
    const occupancyPosition = await fetchOccupancyPosition(properties)
    const historicalSummary = await fetchHistoricalSummary(properties)
    return { position: emptyPosition(), overallNet: null, sections: [], timeline: [], occupancyPosition, historicalSummary }
  }

  const allSections = reports.flatMap(r => r.accounts)

  // When the date-filtered report returned sections but they're all empty,
  // check whether unfiltered history exists (State B).
  let historicalSummary: OwnerFinancialDTO['historicalSummary'] = undefined
  if (allSections.length === 0) {
    historicalSummary = await fetchHistoricalSummary(properties)
  }

  const position    = composePosition(allSections)
  const overallNet  = buildOverallNet(allSections, properties)
  const sections    = allSections.map(mapSectionToDTO)

  // Fetch occupancy position for NEEDS_REVIEW properties
  const occupancyPosition = await fetchOccupancyPosition(properties)

  // Production guard: mark Overall Net as needs_review for properties
  // with known incomplete accounting models
  if (overallNet && properties.some(p => NEEDS_REVIEW_PROPERTIES.has(p))) {
    overallNet.reviewStatus = 'needs_review'
    overallNet.reviewReason =
      'Personal occupancy obligations and partner settlement credits are not yet ' +
      'reflected in the accounting engine. The amounts shown are incomplete.'
  }

  return { position, overallNet, sections, timeline: [], occupancyPosition, historicalSummary }
}
