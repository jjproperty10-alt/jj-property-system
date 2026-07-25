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
import type {
  OwnerFinancialDTO,
  OwnerFinancialSectionDTO,
  OwnerFinancialRowDTO,
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
    type:        section.account_type,
    label:       section.account_label,
    incomeEur:   toEur(section.total_income),
    expensesEur: toEur(section.total_expenses),
    netEur:      toEur(section.total_income - section.total_expenses),
    rows:        visibleRows.map(mapRowToDTO),
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
    return { position: emptyPosition(), sections: [], timeline: [] }
  }

  const settled = await Promise.allSettled(
    properties.map(reportingName =>
      fetchRC3Report({ reportingName, fromDate, toDate }),
    ),
  )

  const reports: RC3PropertyReport[] = settled
    .filter((r): r is PromiseFulfilledResult<RC3PropertyReport> => r.status === 'fulfilled')
    .map(r => r.value)

  if (reports.length === 0) {
    return { position: emptyPosition(), sections: [], timeline: [] }
  }

  const allSections = reports.flatMap(r => r.accounts)
  const position    = composePosition(allSections)
  const sections    = allSections.map(mapSectionToDTO)

  return { position, sections, timeline: [] }
}
