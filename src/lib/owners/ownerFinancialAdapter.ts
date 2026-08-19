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
  PropertyFinancialGroupDTO,
  JjInternalViewDTO,
  JjInternalSectionDTO,
  JjInternalRowDTO,
  FinancialTimelineItemDTO,
  EuroAmount,
  // PR #166 Consolidation types
  BillingState,
  PaymentState,
  BillingStateDTO,
  PaymentAllocationDTO,
  PaymentAllocationSummaryDTO,
  FinancialCorrectionCaseDTO,
  FinancialCorrectionEventDTO,
  FinancialAlertDTO,
  AlertSeverity,
  AlertCategory,
  ReportPresentationConfigDTO,
  ReportLanguage,
} from './ownerWorkspaceTypes'

// ─── Adapter input ────────────────────────────────────────────────────────────

export interface OwnerFinancialAdapterInput {
  /** Verified property names from identity resolver (management_relationship) */
  readonly properties: readonly string[]
  readonly fromDate?: string   // ISO date e.g. "2026-01-01"
  readonly toDate?: string     // ISO date e.g. "2026-12-31"
  /** Statement series UUID — when provided, enables billing state resolution,
   *  payment allocation summary, and correction case retrieval.
   *  Without this, all rows default to unbilled/null (correct for 0 series). */
  readonly seriesId?: string
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

/**
 * Override descriptions for known semantic patterns.
 * DS-009B: Fabi staff accommodation in Uriel Duplex —
 * Tenant Payment rows with description 'שכירות הדירה למטה' are staff accommodation offsets.
 */
function resolveDescription(row: RC3AccountRow, propertyName?: string | null): string {
  const base = row.description ?? row.display_label ?? row.subcategory ?? ''
  // DS-009B: Fabi staff accommodation rent in Duplex
  if (
    propertyName &&
    propertyName.toLowerCase().includes('duplex') &&
    row.subcategory === 'Tenant Payment' &&
    (base.includes('שכירות הדירה למטה') || base.includes('Staff Accommodation'))
  ) {
    return 'Staff Accommodation — Rent Offset (Fabi)'
  }
  if (
    propertyName &&
    propertyName.toLowerCase().includes('duplex') &&
    row.display_label === 'Staff Accommodation Rent'
  ) {
    return 'Staff Accommodation Rent — Owner Entitlement'
  }
  return base
}

// ─── Rental Presentation Groups ──────────────────────────────────────────────

/**
 * Presentation grouping for Rental Management subcategories.
 *
 * ~11 logical groups for readability. Presentation only — no arithmetic change.
 * Subgroup totals must reconcile to the canonical section subtotal.
 *
 * Any subcategory not in this map falls into 'Other'.
 */
const RENTAL_PRESENTATION_GROUPS: Record<string, string> = {
  // Rent Income
  'Tenant Payment':             'Rent Income',
  'Client Payment':             'Rent Income',
  'Staff Accommodation Rent':   'Rent Income',
  // Owner Payments
  'Bank Payment to Owner':      'Owner Payments',
  // Management Fees
  'Management Fee':             'Management Fees',
  // Deposits
  'Deposit':                    'Deposits',
  'Deposit refund':             'Deposits',
  // Utilities
  'Water':                      'Utilities',
  'Water bill':                 'Utilities',
  'Electricity bill':           'Utilities',
  'Electricity':                'Utilities',
  // Maintenance & Repairs
  'Repairs':                    'Maintenance & Repairs',
  'Repair':                     'Maintenance & Repairs',
  'Plumber':                    'Maintenance & Repairs',
  'Minor Renovation':           'Maintenance & Repairs',
  'Workers':                    'Maintenance & Repairs',
  'Key Duplication':            'Maintenance & Repairs',
  'Materials':                  'Maintenance & Repairs',
  // Cleaning
  'Cleaning':                   'Cleaning',
  // Furnishing & Equipment
  'Furniture':                  'Furnishing & Equipment',
  'Electrical Appliances':      'Furnishing & Equipment',
  'Curtains':                   'Furnishing & Equipment',
  'Kitchen':                    'Furnishing & Equipment',
  // Property Costs
  'HOA':                        'Property Costs',
  'Pool Service':               'Property Costs',
  'Property insurance':         'Property Costs',
  'Insurance':                  'Property Costs',
  // Marketing
  'Bazaraki':                   'Marketing',
  // Other — fallback (not listed; anything not mapped goes here)
  'Design':                     'Other',
  'Other':                      'Other',
  'Consumable Supplies':        'Other',
}

/**
 * Resolve the presentation group for a row based on its subcategory.
 * Only applied to rental/management sections.
 */
function resolveRentalPresentationGroup(subcategory: string | null): string {
  if (!subcategory) return 'Other'
  return RENTAL_PRESENTATION_GROUPS[subcategory] ?? 'Other'
}

function mapRowToDTO(
  row: RC3AccountRow,
  propertyName?: string | null,
  sectionType?: string,
): OwnerFinancialRowDTO {
  const isRental = sectionType === 'rental'
  // Margin: present only when client_charge differs from actual cost
  const hasMargin = row.client_charge != null && row.client_charge !== row.amount_eur
  return {
    id:                row.id,
    date:              row.date,
    description:       resolveDescription(row, propertyName),
    displayGroup:      mapDisplayGroup(row.display_group),
    amountEur:         toEur(row.client_amount),
    evidenceRef:       null,
    isReference:       row.display_group === 'reference',
    subcategory:       isRental ? (row.subcategory ?? null) : undefined,
    presentationGroup: isRental ? resolveRentalPresentationGroup(row.subcategory ?? null) : undefined,
    actualCostEur:     hasMargin ? toEur(row.amount_eur) : undefined,
    marginEur:         hasMargin ? toEur(row.client_amount - row.amount_eur) : undefined,
  }
}

function mapSectionToDTO(
  section: RC3AccountSection,
  propertyName?: string | null,
  purchaseDisposition?: 'internal_settled' | 'needs_review',
): OwnerFinancialSectionDTO {
  const normalized = section.balance_convention === 'owner_credit'
    ? section.closing_balance
    : -section.closing_balance
  const visibleRows = section.rows.filter(
    r => !r.is_platform_tracking,
  )

  // Purchase sections: label based on disposition from rule engine
  const isInternalPurchase =
    section.account_type === 'purchase' &&
    purchaseDisposition === 'internal_settled'

  const isNeedsReviewPurchase =
    section.account_type === 'purchase' &&
    purchaseDisposition === 'needs_review'

  const label = isInternalPurchase
    ? 'JJ Internal Acquisition — Settled'
    : section.account_label

  const displayNote = isInternalPurchase
    ? 'All Purchase costs are JJ internal acquisition — excluded from Owner Summary.'
    : isNeedsReviewPurchase
      ? `Needs Review — €${Math.abs(section.closing_balance).toLocaleString('en', { minimumFractionDigits: 2 })} purchase with no confirmed settlement mechanism.`
      : null

  return {
    type:               section.account_type,
    label,
    incomeEur:          toEur(section.total_income),
    expensesEur:        toEur(section.total_expenses),
    netEur:             toEur(section.total_income - section.total_expenses),
    openingBalanceEur:  section.opening_balance !== 0 ? toEur(section.opening_balance) : undefined,
    closingBalanceEur:  toEur(section.closing_balance),
    balanceConvention:  section.balance_convention,
    propertyName:       propertyName ?? null,
    ownerDirection:     isInternalPurchase ? 'internal' : netLabel(normalized),
    ownerDirectionAmountEur: isInternalPurchase ? toEur(Math.abs(normalized)) : toEur(Math.abs(normalized)),
    rows:               visibleRows.map(r => mapRowToDTO(r, propertyName, section.account_type)),
    displayNote,
    purchaseDisposition: purchaseDisposition ?? undefined,
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
 * Purchase disposition — ALL Purchase = JJ internal acquisition.
 *
 * Locked business decision (Yossi, August 2026):
 * JJ acquires properties and resells/assigns to clients. ALL Purchase costs
 * (contracts, deposits, payments, AND Purchase Expenses) across ALL managed
 * properties are JJ-internal acquisition cost — fully excluded from Owner
 * Summary and Overall Net.
 *
 * The Purchase section remains visible per-property for audit transparency
 * but is excluded from owner-facing balance computations.
 *
 * Previous implementation had a per-property registry (PURCHASE_DISPOSITIONS)
 * covering only 4 Uriel properties. Spec correction: the business rule applies
 * universally — there is no property where Purchase is an owner charge.
 */

/**
 * Build a disposition map for Purchase sections.
 *
 * ALL Purchase = JJ internal acquisition (Yossi's locked business decision).
 * Every property with a Purchase section gets 'internal_settled'.
 * Properties without Purchase sections are not in the map.
 */
function buildPurchaseDispositionMap(
  reports: RC3PropertyReport[],
): Map<string, 'internal_settled' | 'needs_review'> {
  const map = new Map<string, 'internal_settled' | 'needs_review'>()
  for (const report of reports) {
    if (!report.has_purchase) continue
    map.set(report.reporting_name, 'internal_settled')
  }
  return map
}

/**
 * Perspective correction — rule-based Purchase exclusion from Overall Net.
 *
 * ALL Purchase costs (contract, deposits, payments, AND Purchase Expenses)
 * for internal_settled properties are fully excluded from the Overall Net
 * computation. JJ acquired the property and resold — the entire Purchase
 * is JJ-internal acquisition cost settled through Sale.
 *
 * Purchase sections with disposition = 'needs_review' remain in the net
 * (no confirmed settlement mechanism).
 *
 * The Purchase section remains visible in the per-property breakdown regardless.
 * It is excluded only from the Overall Net / Owner Summary computation.
 *
 * Also applies the legacy Oshrit occupancy model correction via NEEDS_REVIEW_PROPERTIES.
 */
function applyPerspectiveCorrection(
  reports: RC3PropertyReport[],
  dispositionMap: Map<string, 'internal_settled' | 'needs_review'>,
): RC3AccountSection[] {
  const ownerFacing: RC3AccountSection[] = []
  for (const report of reports) {
    const disposition = dispositionMap.get(report.reporting_name)
    for (const section of report.accounts) {
      // ALL Purchase = JJ internal acquisition — excluded from Owner Summary.
      // Universal rule: every property with Purchase gets internal_settled.
      if (section.account_type === 'purchase' && disposition === 'internal_settled') {
        continue
      }
      ownerFacing.push(section)
    }
  }
  return ownerFacing
}

function buildOverallNet(
  reports: RC3PropertyReport[],
  dispositionMap: Map<string, 'internal_settled' | 'needs_review'>,
): OwnerOverallNetDTO | null {
  const allSections = reports.flatMap(r => r.accounts)
  if (allSections.length === 0) return null
  const ownerFacing = applyPerspectiveCorrection(reports, dispositionMap)
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

/**
 * Build per-property financial groups with Property Net for each.
 *
 * Each property gets its own group with:
 * - All its RC3 sections mapped to DTOs
 * - A Property Net computed from those sections (owner perspective)
 * - Flags for purchase exclusion / needs-review status
 */
function buildPropertyGroups(
  reports: RC3PropertyReport[],
  dispositionMap: Map<string, 'internal_settled' | 'needs_review'>,
): PropertyFinancialGroupDTO[] {
  return reports.map(report => {
    const disposition = dispositionMap.get(report.reporting_name)
    const sections = report.accounts.map(sec =>
      mapSectionToDTO(sec, report.reporting_name, disposition)
    )

    // Property Net: ALL Purchase = JJ internal acquisition, excluded from Property Net.
    const netSections: RC3AccountSection[] = []
    for (const sec of report.accounts) {
      if (sec.account_type === 'purchase' && disposition === 'internal_settled') {
        continue
      }
      netSections.push(sec)
    }
    const net = computeNetOwnerBalance(netSections)

    return {
      propertyName: report.reporting_name,
      sections,
      propertyNet: {
        netEur: toEur(net) as string,
        label: netLabel(net),
        displayAmountEur: toEur(Math.abs(net)) as string,
      },
      hasPurchaseExclusion: disposition === 'internal_settled',
      hasNeedsReviewPurchase: disposition === 'needs_review',
    }
  })
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
 * Net and Closing Balance use computeNetOwnerBalance — the same canonical
 * function used by Overall Net / Owner Summary — ensuring top KPIs always
 * reconcile with the Owner Summary display.
 *
 * Income and Expenses sum only from owner_credit sections (rental, airbnb)
 * where total_income/total_expenses represent actual operational cash flows.
 * client_debt sections (purchase, sale, renovation) include contract reference
 * values that do not represent actual money movement and would inflate KPIs.
 *
 * BPO (Bank Payments to Owner) sums across all sections since it always
 * represents actual money paid regardless of balance_convention.
 */
function composePosition(sections: RC3AccountSection[]): OwnerFinancialDTO['position'] {
  // Canonical net — matches Owner Summary (computeNetOwnerBalance uses
  // closing_balance + balance_convention sign correction)
  const net = computeNetOwnerBalance(sections)

  // Operational income/expenses — only owner_credit sections have meaningful
  // raw totals (rental income, airbnb payouts, cleaning costs, etc.)
  const operational     = sections.filter(s => s.balance_convention === 'owner_credit')
  const incomeEur       = operational.reduce((s, a) => s + a.total_income,   0)
  const expensesEur     = operational.reduce((s, a) => s + a.total_expenses, 0)

  // BPO from all sections — actual money paid to owner
  const paidToOwnerEur  = sections.reduce((s, a) => s + a.total_bpo,         0)

  return {
    incomeEur:         toEur(incomeEur),
    expensesEur:       toEur(expensesEur),
    netEur:            toEur(net),
    paidToOwnerEur:    toEur(paidToOwnerEur),
    pendingEur:        null,                           // RC2 scope — Settlement Engine
    closingBalanceEur: toEur(net),
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

// ─── JJ Internal View — Margin Analysis ─────────────────────────────────────

/**
 * Build JJ Internal margin view from RC3 reports.
 *
 * Shows rows where client_charge differs from amount_eur.
 * Margin = client_amount − amount_eur (what JJ earns above actual cost).
 * Never shown in owner-facing views — JJ management only.
 */
function buildJjInternalView(
  reports: RC3PropertyReport[],
): JjInternalViewDTO | null {
  const sections: JjInternalSectionDTO[] = []
  let totalMargin = 0
  let rowsWithMargin = 0
  let totalRows = 0

  for (const report of reports) {
    for (const account of report.accounts) {
      const marginRows: JjInternalRowDTO[] = []
      for (const row of account.rows) {
        totalRows++
        if (row.client_charge != null && row.client_charge !== row.amount_eur) {
          const margin = row.client_amount - row.amount_eur
          totalMargin += margin
          rowsWithMargin++
          marginRows.push({
            id: row.id,
            date: row.date,
            description: row.description ?? row.subcategory ?? '',
            subcategory: row.subcategory ?? null,
            actualCostEur: toEur(row.amount_eur),
            clientChargeEur: toEur(row.client_amount),
            marginEur: toEur(margin),
          })
        }
      }
      if (marginRows.length > 0) {
        const sectionMargin = marginRows.reduce(
          (sum, r) => sum + parseFloat(r.marginEur as string), 0
        )
        sections.push({
          propertyName: report.reporting_name,
          accountType: account.account_type,
          accountLabel: account.account_label,
          totalMarginEur: toEur(sectionMargin),
          rows: marginRows,
        })
      }
    }
  }

  if (rowsWithMargin === 0) return null

  return {
    totalMarginEur: toEur(totalMargin),
    rowsWithMargin,
    totalRows,
    sections,
  }
}

// ─── Financial Timeline ─────────────────────────────────────────────────────

/**
 * Build a financial timeline from RC3 reports.
 *
 * Selects significant events: BPO payments (money actually paid to owner),
 * plus the most recent transactions, ordered chronologically.
 */
function buildTimeline(
  reports: RC3PropertyReport[],
): FinancialTimelineItemDTO[] {
  const items: FinancialTimelineItemDTO[] = []

  for (const report of reports) {
    for (const account of report.accounts) {
      for (const row of account.rows) {
        if (row.is_platform_tracking) continue
        if (row.display_group === 'reference') continue

        // BPO payments are always significant timeline events
        if (row.is_bpo) {
          items.push({
            id: row.id,
            label: `Payment to Owner — ${report.reporting_name}`,
            date: row.date,
            amountEur: toEur(row.client_amount),
            type: 'payment',
          })
          continue
        }

        // Large transactions (>€1,000) are significant
        if (Math.abs(row.client_amount) >= 1000 && row.is_balance_affecting) {
          const type: FinancialTimelineItemDTO['type'] =
            row.display_group === 'income' ? 'income' :
            row.display_group === 'expense' ? 'expense' : 'income'
          items.push({
            id: row.id,
            label: `${row.description ?? row.subcategory ?? account.account_label} — ${report.reporting_name}`,
            date: row.date,
            amountEur: toEur(row.client_amount),
            type,
          })
        }
      }
    }
  }

  // Sort chronologically descending (most recent first), limit to 20
  items.sort((a, b) => b.date.localeCompare(a.date))
  return items.slice(0, 20)
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
  const { properties, fromDate, toDate, seriesId } = input

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

  // Rule-based Purchase disposition map (replaces hardcoded property sets)
  const dispositionMap = buildPurchaseDispositionMap(reports)

  // KPIs use owner-facing sections (Purchase excluded for internal_settled properties)
  // so they reconcile with the Overall Net and Property Net calculations.
  const ownerFacingSections = applyPerspectiveCorrection(reports, dispositionMap)
  const position    = composePosition(ownerFacingSections)
  const overallNet  = buildOverallNet(reports, dispositionMap)
  const sections    = reports.flatMap(r =>
    r.accounts.map(sec => mapSectionToDTO(sec, r.reporting_name, dispositionMap.get(r.reporting_name)))
  )
  const propertyGroups = buildPropertyGroups(reports, dispositionMap)

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

  const timeline = buildTimeline(reports)
  const jjInternalView = buildJjInternalView(reports)

  // PR #166 Consolidation: report config (alerts computed after billing enrichment)
  const reportConfig = await buildDefaultReportConfig(seriesId)

  // Wire billing states into rows when seriesId is provided (Gap C)
  let paymentSummary: PaymentAllocationSummaryDTO | undefined
  let openCorrectionCases: readonly FinancialCorrectionCaseDTO[] | undefined
  if (seriesId) {
    // Collect all transaction IDs from visible rows
    const allTxIds: string[] = []
    for (const sec of sections) {
      for (const row of sec.rows) {
        if (row.id) allTxIds.push(row.id)
      }
    }

    if (allTxIds.length > 0) {
      const billingStates = await resolveBillingStates(seriesId, allTxIds)

      // Inject billing state into each row
      for (const sec of sections) {
        for (const row of sec.rows) {
          if (row.id) {
            const state = billingStates.get(row.id)
            if (state) {
              // Compute remainingEur using the row's owner-facing amount (P-LEDGER-6)
              const ownerAmount = Number(row.amountEur ?? 0)
              const allocated = state.allocatedAmountEur ? Number(state.allocatedAmountEur) : 0
              const remaining = ownerAmount > 0 && allocated > 0
                ? toEur(Math.max(0, ownerAmount - allocated))
                : state.billingState === 'presented' ? row.amountEur : null

              ;(row as unknown as Record<string, unknown>).billingState = {
                ...state,
                remainingEur: remaining,
                // Upgrade to 'paid' if fully allocated (we now have charge context)
                paymentState: (allocated > 0 && ownerAmount > 0 && allocated >= ownerAmount)
                  ? 'paid' as PaymentState
                  : state.paymentState,
              }
            }
          }
        }
      }
    }

    // Fetch payment summary and correction cases with series context
    paymentSummary = await fetchPaymentAllocationSummary(seriesId)
    openCorrectionCases = await fetchCorrectionCases(seriesId)

    // Enrich payment summary with charge context now that we have sections + billing states
    if (paymentSummary) {
      // Collect all chargeable rows (expenses/income that have billing state)
      const chargeRows = sections
        .flatMap(s => s.rows)
        .filter(r => r.displayGroup === 'expense' || r.displayGroup === 'income')

      // P-LEDGER-6: use owner-facing amount (amountEur in rows is already COALESCE'd)
      const totalCharges = chargeRows.reduce((sum, r) => sum + Math.abs(Number(r.amountEur ?? 0)), 0)
      const totalAllocated = Number(paymentSummary.totalAllocatedEur ?? 0)

      // Compute per-charge allocation counts from injected billing states
      let fullyAllocatedCount = 0
      let unallocatedCount = 0
      for (const row of chargeRows) {
        const bs = (row as unknown as Record<string, unknown>).billingState as BillingStateDTO | undefined
        if (bs) {
          if (bs.paymentState === 'paid') fullyAllocatedCount++
          else if (bs.paymentState === 'unpaid' || bs.paymentState === null) unallocatedCount++
        } else {
          // No billing state = unbilled = unallocated
          unallocatedCount++
        }
      }

      paymentSummary = {
        ...paymentSummary,
        totalChargesEur: totalCharges > 0 ? toEur(totalCharges) : null,
        remainingUnallocatedEur: totalCharges > 0 ? toEur(Math.max(0, totalCharges - totalAllocated)) : null,
        surplusEur: totalAllocated > totalCharges ? toEur(totalAllocated - totalCharges) : null,
        fullyAllocatedCount: chargeRows.length > 0 ? fullyAllocatedCount : null,
        unallocatedCount: chargeRows.length > 0 ? unallocatedCount : null,
      }
    }
  }

  // Compute alerts AFTER billing enrichment so they reflect real billing/payment state
  const alerts = computeFinancialAlerts(
    reports,
    sections,
    paymentSummary,
    openCorrectionCases as readonly FinancialCorrectionCaseDTO[] | null ?? null,
  )

  return {
    position, overallNet, sections, propertyGroups, timeline,
    jjInternalView, occupancyPosition, historicalSummary,
    alerts, reportConfig,
    paymentSummary: paymentSummary ?? undefined,
    openCorrectionCases: openCorrectionCases ?? undefined,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PR #166 CONSOLIDATION — Billing State, Payment Allocation, Corrections, Alerts
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Billing State Resolver ──────────────────────────────────────────────────
// Computes BillingState per transaction by querying the statement lifecycle.
// No separate table — derived from statement_draft_lines + sent_statement_snapshots
// + payment_allocations.

/**
 * Resolve billing state for a set of transaction IDs within a statement series.
 * Returns a Map keyed by transaction ID.
 *
 * Billing lifecycle (independent of payment):
 *   1. No draft_line → 'unbilled'
 *   2. draft_line with includeInStatement=false → 'excluded'
 *   3. draft_line with includeInStatement=true, no snapshot → 'pending'
 *   4. In snapshot → 'presented'
 *
 * Payment lifecycle (independent of billing):
 *   - allocated > 0 → 'partially_paid' (full 'paid' requires charge amount)
 *   - presented but no allocation → 'unpaid'
 *   - unbilled/pending/excluded → null (not applicable yet)
 */
export async function resolveBillingStates(
  seriesId: string,
  transactionIds: readonly string[],
): Promise<Map<string, BillingStateDTO>> {
  const supabase = createServiceClient()
  const result = new Map<string, BillingStateDTO>()

  if (transactionIds.length === 0) return result

  // Step 1: Get all draft lines for these transactions in this series
  const { data: draftLines } = await supabase
    .schema('statements')
    .rpc('get_draft_lines_for_transactions', {
      p_series_id: seriesId,
      p_transaction_ids: transactionIds as string[],
    })

  // Step 2: Get all sent entry snapshots for these transactions
  const { data: sentEntries } = await supabase
    .schema('statements')
    .rpc('get_sent_entries_for_transactions', {
      p_series_id: seriesId,
      p_transaction_ids: transactionIds as string[],
    })

  // Step 3: Get all payment allocations for these transactions as charges
  const { data: allocations } = await supabase
    .schema('statements')
    .rpc('get_payment_allocations', { p_series_id: seriesId })

  // Build lookup maps
  const draftLineMap = new Map<string, { id: string; includeInStatement: boolean; updatedAt: string }>()
  for (const dl of (draftLines ?? [])) {
    draftLineMap.set(dl.source_transaction_id, {
      id: dl.id,
      includeInStatement: dl.include_in_statement,
      updatedAt: dl.updated_at,
    })
  }

  const snapshotMap = new Map<string, string>() // txId → snapshotId
  for (const se of (sentEntries ?? [])) {
    snapshotMap.set(se.source_transaction_id, se.snapshot_id)
  }

  const allocationMap = new Map<string, number>() // chargeId → total allocated
  for (const alloc of (allocations ?? [])) {
    const prev = allocationMap.get(alloc.charge_transaction_id) ?? 0
    allocationMap.set(alloc.charge_transaction_id, prev + Number(alloc.allocated_amount_eur))
  }

  // Step 4: Resolve each transaction
  for (const txId of transactionIds) {
    const draftLine = draftLineMap.get(txId)
    const snapshotId = snapshotMap.get(txId) ?? null
    const allocated = allocationMap.get(txId) ?? 0

    // Billing lifecycle — independent of payment
    let billingState: BillingState
    if (!draftLine) {
      billingState = 'unbilled'
    } else if (!draftLine.includeInStatement) {
      billingState = 'excluded'
    } else if (!snapshotId) {
      billingState = 'pending'
    } else {
      billingState = 'presented'
    }

    // Payment lifecycle — independent of billing
    // P-ARCH-1: paymentState = null when we can't determine (no charge amount context)
    let paymentState: PaymentState | null = null
    if (allocated > 0) {
      // We have allocation data — determine partial vs full
      // Without the charge amount, we can only say 'partially_paid' conservatively
      // Full 'paid' determination requires charge amount context from the caller
      paymentState = 'partially_paid'
    } else if (billingState === 'presented') {
      // Presented but no allocation = unpaid
      paymentState = 'unpaid'
    }
    // unbilled/pending/excluded → paymentState remains null (not applicable yet)

    result.set(txId, {
      billingState,
      paymentState,
      draftLineId: draftLine?.id ?? null,
      snapshotId,
      allocatedAmountEur: allocated > 0 ? toEur(allocated) : null,
      remainingEur: null, // P-ARCH-1: requires charge amount context — caller must compute
      canRepropose: billingState === 'excluded' || billingState === 'unbilled',
      lastTransitionAt: draftLine?.updatedAt ?? null,
    })
  }

  return result
}

// ─── Payment Allocation ──────────────────────────────────────────────────────

/**
 * Fetch payment allocation summary for a statement series.
 * Calls the RPC and aggregates into PaymentAllocationSummaryDTO.
 */
export async function fetchPaymentAllocationSummary(
  seriesId: string,
): Promise<PaymentAllocationSummaryDTO> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .schema('statements')
    .rpc('get_payment_allocations', { p_series_id: seriesId })

  if (error || !data) {
    return {
      totalChargesEur: null, // P-ARCH-1: no data — unknown, not zero
      totalAllocatedEur: toEur(0), // Known: zero allocations exist
      remainingUnallocatedEur: null, // P-ARCH-1: requires charge context
      surplusEur: null, // P-ARCH-1: requires charge context
      fullyAllocatedCount: null, // P-ARCH-1: requires charge amounts
      partiallyAllocatedCount: 0,
      unallocatedCount: null, // P-ARCH-1: requires full charge list
      allocations: [],
    }
  }

  const allocations: PaymentAllocationDTO[] = data.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    seriesId: String(row.series_id),
    paymentTransactionId: String(row.payment_transaction_id),
    chargeTransactionId: String(row.charge_transaction_id),
    allocatedAmountEur: toEur(Number(row.allocated_amount_eur)),
    allocationMethod: row.allocation_method as 'fifo' | 'manual',
    allocatedBy: row.allocated_by ? String(row.allocated_by) : null,
    allocatedAt: String(row.allocated_at),
    notes: row.notes ? String(row.notes) : null,
  }))

  const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.allocatedAmountEur), 0)

  // Aggregate by charge to compute counts
  const chargeAllocations = new Map<string, number>()
  for (const a of allocations) {
    const prev = chargeAllocations.get(a.chargeTransactionId) ?? 0
    chargeAllocations.set(a.chargeTransactionId, prev + Number(a.allocatedAmountEur))
  }

  return {
    totalChargesEur: null, // P-ARCH-1: requires charge context — caller must provide
    totalAllocatedEur: toEur(totalAllocated),
    remainingUnallocatedEur: null, // P-ARCH-1: requires charge context
    surplusEur: null, // P-ARCH-1: requires charge context
    fullyAllocatedCount: null, // P-ARCH-1: requires charge amounts
    partiallyAllocatedCount: chargeAllocations.size,
    unallocatedCount: null, // P-ARCH-1: requires full charge list
    allocations,
  }
}

// ─── Correction Cases ────────────────────────────────────────────────────────

/**
 * Fetch correction cases for a statement series, including event history.
 */
export async function fetchCorrectionCases(
  seriesId: string,
): Promise<readonly FinancialCorrectionCaseDTO[]> {
  const supabase = createServiceClient()

  const { data: cases, error } = await supabase
    .schema('statements')
    .rpc('get_correction_cases', { p_series_id: seriesId })

  if (error || !cases) return []

  // Fetch events for each case
  const caseDTOs: FinancialCorrectionCaseDTO[] = []
  for (const c of cases) {
    const { data: events } = await supabase
      .schema('statements')
      .rpc('get_correction_events', { p_case_id: c.id })

    const eventDTOs: FinancialCorrectionEventDTO[] = (events ?? []).map((e: Record<string, unknown>) => ({
      id: String(e.id),
      caseId: String(e.case_id),
      eventType: String(e.event_type),
      performedBy: e.performed_by ? String(e.performed_by) : null,
      notes: e.notes ? String(e.notes) : null,
      metadata: (e.metadata as Record<string, unknown>) ?? null,
      createdAt: String(e.created_at),
    }))

    caseDTOs.push({
      id: String(c.id),
      seriesId: String(c.series_id),
      originalTransactionId: String(c.original_transaction_id),
      correctionType: c.correction_type,
      status: c.status,
      description: String(c.description),
      priority: c.priority,
      originalAmountEur: c.original_amount_eur != null ? toEur(Number(c.original_amount_eur)) : null,
      correctedAmountEur: c.corrected_amount_eur != null ? toEur(Number(c.corrected_amount_eur)) : null,
      originalFieldValues: (c.original_field_values as Record<string, unknown>) ?? null,
      correctedFieldValues: (c.corrected_field_values as Record<string, unknown>) ?? null,
      openedBy: c.opened_by ? String(c.opened_by) : null,
      openedAt: String(c.opened_at),
      resolvedBy: c.resolved_by ? String(c.resolved_by) : null,
      resolvedAt: c.resolved_at ? String(c.resolved_at) : null,
      resolutionNotes: c.resolution_notes ? String(c.resolution_notes) : null,
      appliedTransactionId: c.applied_transaction_id ? String(c.applied_transaction_id) : null,
      appliedAt: c.applied_at ? String(c.applied_at) : null,
      events: eventDTOs,
    })
  }

  return caseDTOs
}

// ─── Financial Alerts (in-memory, RC1 scope) ─────────────────────────────────
// Computed from RC3 report data without querying additional tables.
// RC2 will add persistent accounting_alerts table.

/**
 * Compute financial alerts from RC3 report data.
 * Detects: duplicate candidates, amount mismatches, missing charges.
 */
/**
 * Compute truthful financial alerts from report data + billing context.
 *
 * Gap L: Alerts detect real workflow states, not just margin discrepancies:
 * 1. Amount mismatch (client_charge vs amount_eur >20% or >€100)
 * 2. Unbilled charges — rows with no draft line (billingState absent)
 * 3. Billed-but-unpaid — rows in draft but no payment allocation
 * 4. Unallocated payments — payments with remaining balance
 * 5. Open correction cases — active cases needing resolution
 */
export function computeFinancialAlerts(
  reports: RC3PropertyReport[],
  sections?: readonly OwnerFinancialSectionDTO[],
  paymentSummary?: PaymentAllocationSummaryDTO | null,
  openCorrectionCases?: readonly FinancialCorrectionCaseDTO[] | null,
): readonly FinancialAlertDTO[] {
  const alerts: FinancialAlertDTO[] = []
  const now = new Date().toISOString()
  let alertId = 0

  // ── 1. Margin / amount-mismatch — ONE consolidated JJ-internal summary alert ──
  // Section 8 (Owner/Client Financial Closure): never one-alert-per-row, never
  // "Infinity%". A row counts as a margin difference when the client charge
  // differs from actual cost (amount_eur) beyond the threshold. When actual cost
  // is 0 the percentage is undefined — we still count the row, but never render a
  // ratio, and surface a business-safe "actual cost not recorded" note instead.
  // Individual cases live in the "JJ Internal — Margin Analysis" drill-down.
  {
    const marginTxIds: string[] = []
    let missingActualCost = 0
    for (const report of reports) {
      for (const section of report.accounts) {
        for (const row of section.rows) {
          if (row.client_charge == null || row.amount_eur == null) continue
          const diff = Number(row.client_charge) - Number(row.amount_eur)
          if (Math.abs(diff) <= 0.01) continue
          const actual = Number(row.amount_eur)
          if (actual === 0) {
            // Actual cost not recorded — percentage is not meaningful. Count it,
            // but never compute a ratio (avoids "Infinity%").
            missingActualCost++
            if (row.id) marginTxIds.push(row.id)
            continue
          }
          const pct = Math.abs(diff / actual)
          if (pct > 0.2 || Math.abs(diff) > 100) {
            if (row.id) marginTxIds.push(row.id)
          }
        }
      }
    }
    const marginCount = marginTxIds.length
    if (marginCount > 0) {
      const suffix = missingActualCost > 0
        ? ` (${missingActualCost} with actual cost not recorded)`
        : ''
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'info' as AlertSeverity,
        category: 'amount_mismatch' as AlertCategory,
        message: `${marginCount} transaction${marginCount === 1 ? ' has' : 's have'} margin differences${suffix}`,
        relatedTransactionIds: marginTxIds.slice(0, 10),
        propertyName: null,
        suggestedAction: 'Review in JJ Internal — Margin Analysis',
        dismissible: true,
        acknowledged: false,
        computedAt: now,
      })
    }
  }

  // ── 2. Unbilled charges — rows without billing state (no draft line) ──
  if (sections) {
    let unbilledCount = 0
    const unbilledIds: string[] = []
    for (const sec of sections) {
      for (const row of sec.rows) {
        if (row.displayGroup === 'expense' || row.displayGroup === 'income') {
          const bs = (row as unknown as Record<string, unknown>).billingState as BillingStateDTO | undefined
          if (!bs || bs.billingState === 'unbilled') {
            unbilledCount++
            if (row.id) unbilledIds.push(row.id)
          }
        }
      }
    }
    if (unbilledCount > 0) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'warning' as AlertSeverity,
        category: 'unbilled_charges' as AlertCategory,
        message: `${unbilledCount} charge${unbilledCount > 1 ? 's' : ''} not yet included in any statement draft`,
        relatedTransactionIds: unbilledIds.slice(0, 10),
        propertyName: null,
        suggestedAction: 'Create or update a statement draft to include these charges',
        dismissible: true,
        acknowledged: false,
        computedAt: now,
      })
    }

    // ── 3. Billed-but-unpaid — in draft but no payment allocation ──
    let unpaidCount = 0
    const unpaidIds: string[] = []
    for (const sec of sections) {
      for (const row of sec.rows) {
        const bs = (row as unknown as Record<string, unknown>).billingState as BillingStateDTO | undefined
        if (bs && bs.billingState !== 'unbilled' && (bs.paymentState === 'unpaid' || bs.paymentState === null)) {
          unpaidCount++
          if (row.id) unpaidIds.push(row.id)
        }
      }
    }
    if (unpaidCount > 0) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'info' as AlertSeverity,
        category: 'billed_unpaid' as AlertCategory,
        message: `${unpaidCount} billed charge${unpaidCount > 1 ? 's' : ''} awaiting payment allocation`,
        relatedTransactionIds: unpaidIds.slice(0, 10),
        propertyName: null,
        suggestedAction: 'Allocate payments to outstanding charges (manual or FIFO)',
        dismissible: true,
        acknowledged: false,
        computedAt: now,
      })
    }
  }

  // ── 4. Unallocated payments — payments with remaining balance ──
  if (paymentSummary && paymentSummary.remainingUnallocatedEur != null) {
    const remaining = Number(paymentSummary.remainingUnallocatedEur)
    if (remaining > 0.01) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'info' as AlertSeverity,
        category: 'unallocated_payments' as AlertCategory,
        message: `€${remaining.toFixed(2)} in payments not yet allocated to specific charges`,
        relatedTransactionIds: [],
        propertyName: null,
        suggestedAction: 'Run FIFO allocation or manually assign payments to charges',
        dismissible: true,
        acknowledged: false,
        computedAt: now,
      })
    }
  }

  // ── 5. Open correction cases ──
  if (openCorrectionCases && openCorrectionCases.length > 0) {
    const openCount = openCorrectionCases.filter(c => c.status === 'open' || c.status === 'under_review').length
    if (openCount > 0) {
      alerts.push({
        id: `alert-${++alertId}`,
        severity: 'warning' as AlertSeverity,
        category: 'open_corrections' as AlertCategory,
        message: `${openCount} correction case${openCount > 1 ? 's' : ''} requiring resolution`,
        relatedTransactionIds: openCorrectionCases
          .filter(c => c.status === 'open' || c.status === 'under_review')
          .map(c => c.originalTransactionId)
          .slice(0, 10),
        propertyName: null,
        suggestedAction: 'Review and resolve open correction cases',
        dismissible: false,
        acknowledged: false,
        computedAt: now,
      })
    }
  }

  return alerts
}

// ─── Report Presentation Config ──────────────────────────────────────────────

/**
 * Build report presentation configuration.
 * When seriesId is provided, merges persisted owner preferences from statement_series.
 * Persisted preferences override defaults (partial merge — only set fields override).
 * P-ARCH-1: NULL in persisted prefs = use default (not override with null).
 */
async function buildDefaultReportConfig(
  seriesId?: string | null,
): Promise<ReportPresentationConfigDTO> {
  const defaults: ReportPresentationConfigDTO = {
    language: 'en',
    isRtl: false,
    titleOverride: null,
    headerText: null,
    footerText: null,
    showInternalMargin: false,
    showPaymentAllocations: false,
    showBillingState: false,
    dateFormat: 'dd/mm/yyyy',
    currencyFormat: 'symbol',
  }

  if (!seriesId) return defaults

  try {
    const db = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('statements')
      .rpc('get_report_preferences', { p_series_id: seriesId })

    if (error || !data) return defaults

    const stored = data as Record<string, unknown>
    // Merge: only non-null stored values override defaults
    return {
      language: typeof stored.language === 'string' ? stored.language as ReportLanguage : defaults.language,
      isRtl: typeof stored.isRtl === 'boolean' ? stored.isRtl : defaults.isRtl,
      titleOverride: stored.titleOverride !== undefined ? (stored.titleOverride as string | null) : defaults.titleOverride,
      headerText: stored.headerText !== undefined ? (stored.headerText as string | null) : defaults.headerText,
      footerText: stored.footerText !== undefined ? (stored.footerText as string | null) : defaults.footerText,
      showInternalMargin: typeof stored.showInternalMargin === 'boolean' ? stored.showInternalMargin : defaults.showInternalMargin,
      showPaymentAllocations: typeof stored.showPaymentAllocations === 'boolean' ? stored.showPaymentAllocations : defaults.showPaymentAllocations,
      showBillingState: typeof stored.showBillingState === 'boolean' ? stored.showBillingState : defaults.showBillingState,
      dateFormat: typeof stored.dateFormat === 'string' ? stored.dateFormat as ReportPresentationConfigDTO['dateFormat'] : defaults.dateFormat,
      currencyFormat: typeof stored.currencyFormat === 'string' ? stored.currencyFormat as ReportPresentationConfigDTO['currencyFormat'] : defaults.currencyFormat,
    }
  } catch {
    // Silent fallback — preferences are non-critical
    return defaults
  }
}
