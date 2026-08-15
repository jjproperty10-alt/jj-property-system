/**
 * ownerLtrStatementAdapter — Composition layer for Owner LTR Statement.
 *
 * P8 LTR Operations — Owner LTR Statement Integration
 *
 * Architecture: ownerWorkspaceService → ownerLtrStatementAdapter → {
 *   RC3 (fetchRC3Report) — UNCONDITIONAL monetary authority,
 *   P1 (rentPositionAdapter) — supplementary lifecycle enrichment,
 *   P2 (managementFeeAdapter) — supplementary lifecycle enrichment,
 *   P3 (depositAdapter) — supplementary lifecycle enrichment,
 *   P5 (tenantChargeAdapter)
 * }
 *
 * LOCKED RULE (Yossi, Aug 2026):
 *   RC3 is the UNCONDITIONAL monetary authority for every financial value
 *   in the Owner LTR Statement. Monetary values (rent received, management
 *   fee charged, expenses, payments to owner, opening/closing balance)
 *   ALWAYS come from RC3 — regardless of whether P1/P2/P3 lifecycle rows
 *   exist. P1/P2/P3 provide supplementary lifecycle metadata only
 *   (expected obligations, fee configuration, deposit lifecycle status).
 *
 * FORBIDDEN PATTERN:
 *   `if (lifecycle empty) → use RC3; else → use lifecycle financial total`
 *   This creates two financial authorities and will diverge when lifecycle
 *   tables are populated.
 *
 * Responsibility:
 * - RC3 provides ALL monetary values (rent received, fees charged, expenses, BPO)
 * - P1 enriches rental income with expected/outstanding/obligation status
 * - P2 enriches management fee with feeType/periodLabel
 * - P3 enriches deposit with lifecycle status (held/applied/refunded)
 * - Does NOT recalculate anything — consumes and formats
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations beyond balance arithmetic
 * - No settlement logic (P7 authoritative)
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-6: Owner NEVER sees JJ margin, internal payer/payee, partner settlement,
 *             deposit custodian (JJ/Yossi/Jacob/Anastasia)
 *   P-LEDGER-6: owner-facing amounts = COALESCE(client_charge, amount_eur)
 *               → RC3 engine `client_amount` field
 *   Spec Section 13.2: "The Owner LTR Statement does NOT build a second calculation engine"
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { fetchPropertyRentPosition, fetchRentObligations } from './rentPositionAdapter'
import { fetchPropertyManagementFees } from './managementFeeAdapter'
import { fetchDepositHistory } from './depositAdapter'
import { fetchPropertyTenantCharges } from './tenantChargeAdapter'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import type { RC3AccountRow, RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'
import type {
  OwnerLtrStatementDTO,
  RentPeriodSummaryDTO,
  OwnerExpenseLineDTO,
  OwnerPaymentLineDTO,
  TenantChargeLineDTO,
  BalanceDirection,
  ManagementFeeType,
  RentObligationStatus,
  PresentationStatus,
  EuroAmount,
  ISODate,
  TenantChargeObligationDTO,
} from './ownerWorkspaceTypes'

// ─── Input ────────────────────────────────────────────────────────────────────

export interface OwnerLtrStatementInput {
  readonly propertyId: string
  readonly propertyName: string
  readonly ownerName: string
  readonly rentalContractId: string
  readonly periodStart: ISODate
  readonly periodEnd: ISODate
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEur(n: number): EuroAmount {
  return String(n)
}

function parseEur(s: EuroAmount): number {
  if (s == null) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function balanceDir(n: number): BalanceDirection {
  if (n > 0) return 'due_to_owner'
  if (n < 0) return 'due_to_jj'
  return 'balanced'
}

// ─── Section builders (pure) ─────────────────────────────────────────────────

/**
 * Build rental income section from P1 rent position + obligations.
 */
async function buildRentalIncomeFromP1(
  propertyId: string,
  rentalContractId: string,
  periodStart: string,
  periodEnd: string,
): Promise<OwnerLtrStatementDTO['rentalIncome']> {
  const [positions, obligations] = await Promise.all([
    fetchPropertyRentPosition(propertyId),
    fetchRentObligations(rentalContractId),
  ])

  // Filter obligations to statement period
  const periodObls = obligations.filter(obl => {
    return obl.obligationMonth >= periodStart.slice(0, 7) &&
           obl.obligationMonth <= periodEnd.slice(0, 7)
  })

  // Find the matching position for this contract
  const position = positions.find(p => p.rentalContractId === rentalContractId)

  let totalExpected = 0
  let totalReceived = 0

  const periods: RentPeriodSummaryDTO[] = periodObls.map(obl => {
    const expected = parseEur(obl.expectedAmountEur)
    const received = parseEur(obl.receivedAmountEur)
    totalExpected += expected
    totalReceived += received

    // Extract latest payment date from settlement evidence
    let paymentDate: ISODate | null = null
    if (obl.settlementEvidence && obl.settlementEvidence.length > 0) {
      const dates = obl.settlementEvidence
        .map(e => e.date)
        .filter((d): d is string => d != null)
        .sort()
      paymentDate = dates.length > 0 ? dates[dates.length - 1] : null
    }

    return {
      month: obl.obligationMonth,
      expected: obl.expectedAmountEur,
      received: obl.receivedAmountEur,
      paymentDate,
      status: obl.status as RentObligationStatus,
    }
  })

  // If no period obligations, use position summary for totals
  if (periodObls.length === 0 && position) {
    totalExpected = parseEur(position.totalExpectedEur)
    totalReceived = parseEur(position.totalReceivedEur)
  }

  return {
    expected: toEur(totalExpected),
    received: toEur(totalReceived),
    outstanding: toEur(totalExpected - totalReceived),
    periods,
  }
}

/**
 * Build rental income from RC3 — UNCONDITIONAL monetary authority.
 *
 * RC3 provides the actual rent received (canonical transactions).
 * Groups income rows (display_group='income') by month. Since RC3
 * records actual payments (not obligations), expected = received
 * and status = 'paid'. P1 lifecycle may later enrich with expected/
 * outstanding, but the monetary values always come from here.
 */
function buildRentalIncomeFromRC3(
  rc3Rows: readonly RC3AccountRow[],
): OwnerLtrStatementDTO['rentalIncome'] {
  const incomeRows = rc3Rows.filter(r => r.display_group === 'income')

  if (incomeRows.length === 0) {
    return {
      expected: toEur(0),
      received: toEur(0),
      outstanding: toEur(0),
      periods: [],
    }
  }

  // Group by YYYY-MM
  const byMonth = new Map<string, { total: number; latestDate: string | null }>()
  for (const row of incomeRows) {
    const month = row.date ? row.date.slice(0, 7) : 'unknown'
    const entry = byMonth.get(month) ?? { total: 0, latestDate: null }
    entry.total += row.client_amount
    if (row.date && (!entry.latestDate || row.date > entry.latestDate)) {
      entry.latestDate = row.date
    }
    byMonth.set(month, entry)
  }

  let totalReceived = 0
  const periods: RentPeriodSummaryDTO[] = []

  // Sort by month ascending
  const sortedMonths = Array.from(byMonth.keys()).sort()
  for (const month of sortedMonths) {
    const entry = byMonth.get(month)!
    totalReceived += entry.total
    periods.push({
      month,
      expected: toEur(entry.total),
      received: toEur(entry.total),
      paymentDate: entry.latestDate,
      status: 'paid' as RentObligationStatus,
    })
  }

  return {
    expected: toEur(totalReceived),
    received: toEur(totalReceived),
    outstanding: toEur(0),
    periods,
  }
}

/**
 * Build management fee section from P2 fee position.
 * Returns null if fee type is 'no_fee' (P-ARCH-1).
 */
async function buildManagementFeeFromP2(
  propertyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<OwnerLtrStatementDTO['managementFee']> {
  const feePosition = await fetchPropertyManagementFees(propertyId)

  if (feePosition.configs.length === 0) return null

  // Find the active config
  const activeConfig = feePosition.configs.find(c => c.status === 'active')
    ?? feePosition.configs[0]

  if (activeConfig.feeType === 'no_fee') return null

  // Filter obligations to statement period
  const periodObls = feePosition.obligations.filter(obl => {
    return obl.periodStart <= periodEnd && obl.periodEnd >= periodStart
  })

  let totalDue = 0
  let totalSettled = 0
  let periodLabel = ''

  for (const obl of periodObls) {
    totalDue += parseEur(obl.calculatedAmountEur)
    totalSettled += parseEur(obl.settledAmountEur)
    if (!periodLabel && obl.periodLabel) periodLabel = obl.periodLabel
  }

  return {
    due: toEur(totalDue),
    settled: toEur(totalSettled),
    outstanding: toEur(totalDue - totalSettled),
    feeType: activeConfig.feeType as ManagementFeeType,
    periodLabel,
  }
}

/**
 * Build management fee from RC3 — UNCONDITIONAL monetary authority.
 *
 * Extracts Management Fee rows from RC3 (display_group='expense',
 * subcategory='Management Fee'). Since RC3 records actual charges,
 * due = settled and outstanding = 0. P2 lifecycle may later enrich
 * with feeType/periodLabel, but the monetary values always come
 * from here. Returns null if no Management Fee rows exist.
 */
function buildManagementFeeFromRC3(
  rc3Rows: readonly RC3AccountRow[],
): OwnerLtrStatementDTO['managementFee'] {
  const mgmtFeeRows = rc3Rows.filter(
    r => r.display_group === 'expense' && r.subcategory === 'Management Fee',
  )

  if (mgmtFeeRows.length === 0) return null

  let totalDue = 0
  for (const row of mgmtFeeRows) {
    totalDue += row.client_amount
  }

  return {
    due: toEur(totalDue),
    settled: toEur(totalDue),
    outstanding: toEur(0),
    feeType: 'fixed_amount' as ManagementFeeType,
    periodLabel: '',
  }
}

/**
 * RC3 canonical fallback for deposit (Decision #10).
 *
 * When P3 lifecycle rows are absent, extracts Deposit info rows
 * from RC3 (display_group='info', subcategory='Deposit').
 * Decision #8: deposit is separate from operating rent accounting.
 */
function buildDepositHeldFromRC3(
  rc3Rows: readonly RC3AccountRow[],
): OwnerLtrStatementDTO['depositHeld'] {
  const depositRows = rc3Rows.filter(
    r => r.display_group === 'info' && r.subcategory === 'Deposit',
  )

  if (depositRows.length === 0) return null

  let totalDeposit = 0
  for (const row of depositRows) {
    totalDeposit += row.client_amount
  }

  if (totalDeposit === 0) return null

  return {
    amount: toEur(totalDeposit),
    status: 'received',
  }
}

/**
 * Build owner expenses section from RC3 engine.
 * Uses P-LEDGER-6: client_amount = COALESCE(client_charge, amount_eur).
 *
 * EXCLUDES Management Fee rows — those are handled by buildManagementFee*
 * (Decision #6: Management Fee appears as its own section, never deducted twice).
 */
function buildOwnerExpenses(
  rows: readonly RC3AccountRow[],
): { expenses: readonly OwnerExpenseLineDTO[]; total: number } {
  const expenseRows = rows.filter(
    r => r.display_group === 'expense' &&
         !r.is_platform_tracking &&
         r.subcategory !== 'Management Fee',
  )

  let total = 0
  const expenses: OwnerExpenseLineDTO[] = expenseRows.map(row => {
    total += row.client_amount
    return {
      date: row.date ?? '',
      description: row.description ?? row.display_label ?? row.subcategory ?? '',
      chargeAmount: toEur(row.client_amount),
      presentationStatus: 'include_now' as PresentationStatus,
    }
  })

  return { expenses, total }
}

/**
 * Build owner payments section from RC3 BPO rows.
 * BPO = Bank Payment to Owner — settlement, NOT expense.
 */
function buildOwnerPayments(
  rows: readonly RC3AccountRow[],
): { payments: readonly OwnerPaymentLineDTO[]; total: number } {
  const bpoRows = rows.filter(
    r => r.display_group === 'payment_out',
  )

  let total = 0
  const payments: OwnerPaymentLineDTO[] = bpoRows.map(row => {
    total += row.client_amount
    return {
      date: row.date ?? '',
      description: row.description ?? row.display_label ?? row.subcategory ?? '',
      amount: toEur(row.client_amount),
    }
  })

  return { payments, total }
}

/**
 * Build deposit held section from P3 deposit adapter.
 * P-ARCH-6: custodian is INTERNAL — excluded from owner DTO.
 * Deposit is informational, NEVER income.
 */
async function buildDepositHeld(
  rentalContractId: string,
): Promise<OwnerLtrStatementDTO['depositHeld']> {
  const history = await fetchDepositHistory(rentalContractId)

  if (!history.currentState) return null

  const { currentHeldEur, lifecycleStatus } = history.currentState

  // Map lifecycle status to owner-facing status
  let status: string
  switch (lifecycleStatus) {
    case 'held':              status = 'held'; break
    case 'partially_settled': status = 'partially_applied'; break
    case 'fully_closed':      status = 'fully_applied'; break
    case 'no_deposit':        return null
    default:                  status = 'held'
  }

  return {
    amount: toEur(currentHeldEur),
    status,
  }
}

/**
 * Build tenant charges relevant to owner from P5 adapter.
 * Only charges that affect the owner's balance (e.g. damage deducted from deposit).
 * P-ARCH-6: no JJ internal margin or custodian details.
 */
async function buildTenantChargesRelevantToOwner(
  propertyId: string,
): Promise<readonly TenantChargeLineDTO[]> {
  const charges = await fetchPropertyTenantCharges(propertyId)

  // Filter to charges relevant to owner: deductible from deposit or affecting owner balance
  const relevant = charges.filter((c: TenantChargeObligationDTO) =>
    c.deductibleFromDeposit || c.status === 'settled',
  )

  return relevant.map((c: TenantChargeObligationDTO): TenantChargeLineDTO => ({
    chargeType: c.chargeType,
    description: c.description,
    chargeAmountEur: toEur(c.chargeAmountEur),
    status: c.status,
    deductibleFromDeposit: c.deductibleFromDeposit,
  }))
}

/**
 * RC3 result for the statement period — full report + flattened rental rows.
 */
interface RC3PeriodResult {
  /** Full RC3 report — includes opening_balance per section */
  readonly report: RC3PropertyReport | null
  /** Flattened rental rows (non-reference, non-platform-tracking) */
  readonly rentalRows: readonly RC3AccountRow[]
  /** RC3 rental section (if exists) — has opening_balance + closing_balance */
  readonly rentalSection: RC3AccountSection | null
}

/**
 * Fetch full RC3 report for the statement period.
 * Returns the complete report (with opening_balance computed by
 * computePrePeriodClosing when fromDate is provided) plus flattened
 * rental rows for section builders.
 *
 * LOCKED RULE: RC3 is the unconditional monetary authority.
 */
async function fetchRC3ForPeriod(
  propertyName: string,
  periodStart: string,
  periodEnd: string,
): Promise<RC3PeriodResult> {
  try {
    const report = await fetchRC3Report({
      reportingName: propertyName,
      fromDate: periodStart,
      toDate: periodEnd,
    })

    const rentalSection = report.accounts.find(
      s => s.account_type === 'rental',
    ) ?? null

    // Flatten rental rows only (LTR statement = rental account)
    const rentalRows = rentalSection
      ? rentalSection.rows.filter(
          r => !r.is_platform_tracking && r.display_group !== 'reference',
        )
      : []

    return { report, rentalRows, rentalSection }
  } catch {
    return { report: null, rentalRows: [], rentalSection: null }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch and compose a complete Owner LTR Statement.
 *
 * Decision #10 (LOCKED): RC3 is canonical financial authority.
 * P1/P2/P3 provide supplementary lifecycle detail (expected obligations,
 * fee configs, deposit lifecycle). Absence of lifecycle rows must NOT
 * cause real canonical transactions to disappear from the report.
 *
 * Strategy: fetch RC3 + P1/P2/P3/P5 in parallel. RC3 is always the
 * monetary authority. P1/P2/P3 provide supplementary lifecycle enrichment.
 *
 * Opening balance: uses null for now — statements.statement_series
 * integration deferred until first statement is created via UI.
 *
 * Closing balance equation:
 *   opening + rental_income_received - management_fee_due
 *   - owner_expenses - owner_payments = closing
 *
 * Constitutional enforcement:
 *   P-ARCH-6: depositHeld excludes custodian
 *   P-LEDGER-6: expenses use RC3 client_amount (COALESCE)
 *   Decision #6: Management Fee = own section, never deducted twice
 *   Decision #8: Deposit separate from operating rent accounting
 */
export async function fetchOwnerLtrStatement(
  input: OwnerLtrStatementInput,
): Promise<OwnerLtrStatementDTO> {
  const {
    propertyId,
    propertyName,
    ownerName,
    rentalContractId,
    periodStart,
    periodEnd,
  } = input

  // Fetch all sources in parallel — RC3 (monetary authority) + P1/P2/P3/P5 (lifecycle enrichment)
  const [
    rc3,
    p1Enrichment,
    p2Enrichment,
    p3Enrichment,
    tenantChargesRelevantToOwner,
  ] = await Promise.all([
    fetchRC3ForPeriod(propertyName, periodStart, periodEnd),
    buildRentalIncomeFromP1(propertyId, rentalContractId, periodStart, periodEnd),
    buildManagementFeeFromP2(propertyId, periodStart, periodEnd),
    buildDepositHeld(rentalContractId),
    buildTenantChargesRelevantToOwner(propertyId),
  ])

  // ── LOCKED RULE: RC3 is UNCONDITIONAL monetary authority ────────────────
  // RC3 ALWAYS provides: rent received, management fee charged, expenses,
  // payments to owner, opening balance, closing balance.
  // P1/P2/P3 ONLY enrich with lifecycle metadata (expected obligations,
  // fee type/period labels, deposit lifecycle status).
  // FORBIDDEN PATTERN: if (lifecycle empty) → use RC3; else → use lifecycle.

  // Monetary values — ALWAYS from RC3
  const rentalIncome = buildRentalIncomeFromRC3(rc3.rentalRows)
  const managementFee = buildManagementFeeFromRC3(rc3.rentalRows)
  const depositHeld = buildDepositHeldFromRC3(rc3.rentalRows)

  // P1 lifecycle enrichment: expected rent, outstanding amounts
  // Future: merge p1Enrichment.expected into rentalIncome when P1 is populated
  void p1Enrichment

  // P2 lifecycle enrichment: fee type, period label
  // Future: merge p2Enrichment.feeType into managementFee when P2 is populated
  void p2Enrichment

  // P3 lifecycle enrichment: deposit status (held/applied/refunded)
  // Future: override depositHeld.status with p3Enrichment when P3 is populated
  void p3Enrichment

  // ── Expenses + Payments from RC3 (always canonical) ──────────────────────
  // Decision #6: Management Fee excluded from expenses (own section)
  const { expenses: ownerExpenses, total: totalExpenses } = buildOwnerExpenses(rc3.rentalRows)
  const { payments: ownerPayments, total: totalPayments } = buildOwnerPayments(rc3.rentalRows)

  // Opening balance from RC3 rental section (computed server-side by fetchRC3Report)
  const rc3Opening = rc3.rentalSection?.opening_balance ?? null
  const openingBalance: EuroAmount | null = rc3Opening != null ? toEur(rc3Opening) : null

  // Closing balance equation
  const opening = rc3Opening ?? 0
  const rentReceived = parseEur(rentalIncome.received)
  const mgmtFeeDue = managementFee ? parseEur(managementFee.due) : 0
  const closing = opening + rentReceived - mgmtFeeDue - totalExpenses - totalPayments

  return {
    propertyId,
    propertyName,
    ownerName,
    statementPeriod: { start: periodStart, end: periodEnd },

    rentalIncome,
    managementFee,

    ownerExpenses,
    totalOwnerExpenses: toEur(totalExpenses),

    tenantChargesRelevantToOwner,

    depositHeld,

    ownerPayments,
    totalOwnerPayments: toEur(totalPayments),

    openingBalance,
    closingBalance: toEur(closing),
    balanceDirection: balanceDir(closing),

    presentationOverrides: [],
  }
}
