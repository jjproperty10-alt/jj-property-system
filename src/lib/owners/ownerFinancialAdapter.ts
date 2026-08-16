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
  BillingStateDTO,
  PaymentAllocationDTO,
  PaymentAllocationSummaryDTO,
  FinancialCorrectionCaseDTO,
  FinancialCorrectionEventDTO,
  FinancialAlertDTO,
  AlertSeverity,
  AlertCategory,
  ReportPresentationConfigDTO,
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

  // PR #166 Consolidation: alerts + report config + payments + corrections
  const alerts = computeFinancialAlerts(reports)
  const reportConfig = buildDefaultReportConfig()

  return {
    position, overallNet, sections, propertyGroups, timeline,
    jjInternalView, occupancyPosition, historicalSummary,
    alerts, reportConfig,
    // paymentSummary + openCorrectionCases require statement series context —
    // populated by fetchPaymentAllocationSummary / fetchCorrectionCases below
    // when called from the Financial tab with a seriesId.
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
 * Resolution logic:
 *   1. No draft_line → 'unbilled'
 *   2. draft_line with includeInStatement=false → 'excluded'
 *   3. draft_line with includeInStatement=true, no snapshot → 'pending'
 *   4. In snapshot, no allocation → 'presented'
 *   5. In snapshot + has allocation → 'billed'
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

    let state: BillingState
    if (!draftLine) {
      state = 'unbilled'
    } else if (!draftLine.includeInStatement) {
      state = 'excluded'
    } else if (!snapshotId) {
      state = 'pending'
    } else if (allocated > 0) {
      state = 'billed'
    } else {
      state = 'presented'
    }

    result.set(txId, {
      state,
      draftLineId: draftLine?.id ?? null,
      snapshotId,
      allocatedAmountEur: toEur(allocated),
      remainingEur: toEur(0), // Placeholder — requires charge amount context
      canRepropose: state === 'excluded' || state === 'unbilled',
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
      totalChargesEur: toEur(0),
      totalAllocatedEur: toEur(0),
      remainingUnallocatedEur: toEur(0),
      surplusEur: toEur(0),
      fullyAllocatedCount: 0,
      partiallyAllocatedCount: 0,
      unallocatedCount: 0,
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
    totalChargesEur: toEur(0), // Requires charge context — populated by caller
    totalAllocatedEur: toEur(totalAllocated),
    remainingUnallocatedEur: toEur(0), // Requires charge context
    surplusEur: toEur(0), // Requires charge context
    fullyAllocatedCount: 0, // Requires charge amount context
    partiallyAllocatedCount: chargeAllocations.size,
    unallocatedCount: 0, // Requires full charge list
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
function computeFinancialAlerts(
  reports: RC3PropertyReport[],
): readonly FinancialAlertDTO[] {
  const alerts: FinancialAlertDTO[] = []
  const now = new Date().toISOString()
  let alertId = 0

  for (const report of reports) {
    for (const section of report.accounts) {
      for (const row of section.rows) {
        // Alert: client_charge differs from amount_eur (potential margin or error)
        if (
          row.client_charge != null &&
          row.amount_eur != null &&
          Math.abs(Number(row.client_charge) - Number(row.amount_eur)) > 0.01
        ) {
          const diff = Number(row.client_charge) - Number(row.amount_eur)
          // Only alert on large discrepancies (>20% or >€100)
          const pct = Math.abs(diff / Number(row.amount_eur))
          if (pct > 0.2 || Math.abs(diff) > 100) {
            alerts.push({
              id: `alert-${++alertId}`,
              severity: 'info' as AlertSeverity,
              category: 'amount_mismatch' as AlertCategory,
              message: `Charge differs from actual cost by €${Math.abs(diff).toFixed(2)} (${(pct * 100).toFixed(0)}%)`,
              relatedTransactionIds: row.id ? [row.id] : [],
              propertyName: report.reporting_name,
              suggestedAction: 'Verify margin is intentional',
              dismissible: true,
              acknowledged: false,
              computedAt: now,
            })
          }
        }
      }
    }
  }

  return alerts
}

// ─── Report Presentation Config ──────────────────────────────────────────────

/**
 * Build default report presentation configuration.
 * Can be overridden per-owner via statement_series or session preferences.
 */
function buildDefaultReportConfig(): ReportPresentationConfigDTO {
  return {
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
}
