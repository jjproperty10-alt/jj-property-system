/**
 * ownerLtrStatementAdapter — Composition layer for Owner LTR Statement.
 *
 * P8 LTR Operations — Owner LTR Statement Integration
 *
 * Architecture: ownerWorkspaceService → ownerLtrStatementAdapter → {
 *   P1 (rentPositionAdapter),
 *   P2 (managementFeeAdapter),
 *   P3 (depositAdapter),
 *   P5 (tenantChargeAdapter),
 *   RC3 (fetchRC3Report),
 *   statements schema (opening balance)
 * }
 *
 * Responsibility:
 * - Consumes P1–P7 authorities + RC3 engine
 * - Composes into unified OwnerLtrStatementDTO for owner-facing statement
 * - Does NOT recalculate anything — consumes and formats
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations beyond balance arithmetic
 * - No settlement logic (P7 authoritative)
 * - No rent logic (P1 authoritative)
 * - No fee logic (P2 authoritative)
 * - No deposit logic (P3 authoritative)
 * - No charge logic (P5 authoritative)
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
import type { RC3AccountRow } from '@/lib/report/types'
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
async function buildRentalIncome(
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
 * Build management fee section from P2 fee position.
 * Returns null if fee type is 'no_fee' (P-ARCH-1).
 */
async function buildManagementFee(
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
 * Build owner expenses section from RC3 engine.
 * Uses P-LEDGER-6: client_amount = COALESCE(client_charge, amount_eur).
 */
function buildOwnerExpenses(
  rows: readonly RC3AccountRow[],
): { expenses: readonly OwnerExpenseLineDTO[]; total: number } {
  const expenseRows = rows.filter(
    r => r.display_group === 'expense' &&
         !r.is_platform_tracking,
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
 * Fetch RC3 rows for the statement period, filtered to visible expense + BPO rows.
 */
async function fetchRC3RowsForPeriod(
  propertyName: string,
  periodStart: string,
  periodEnd: string,
): Promise<readonly RC3AccountRow[]> {
  try {
    const report = await fetchRC3Report({
      reportingName: propertyName,
      fromDate: periodStart,
      toDate: periodEnd,
    })

    return report.accounts.flatMap(section =>
      section.rows.filter(
        r => !r.is_platform_tracking && r.display_group !== 'reference',
      ),
    )
  } catch {
    return []
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch and compose a complete Owner LTR Statement.
 *
 * Calls each P1–P5 + RC3 authority in parallel, then composes into
 * a single OwnerLtrStatementDTO. Partial failure is tolerated —
 * each section defaults to empty/null independently.
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

  // Fetch all sources in parallel
  const [
    rentalIncome,
    managementFee,
    depositHeld,
    tenantChargesRelevantToOwner,
    rc3Rows,
  ] = await Promise.all([
    buildRentalIncome(propertyId, rentalContractId, periodStart, periodEnd),
    buildManagementFee(propertyId, periodStart, periodEnd),
    buildDepositHeld(rentalContractId),
    buildTenantChargesRelevantToOwner(propertyId),
    fetchRC3RowsForPeriod(propertyName, periodStart, periodEnd),
  ])

  // Build expense + payment sections from RC3 rows
  const { expenses: ownerExpenses, total: totalExpenses } = buildOwnerExpenses(rc3Rows)
  const { payments: ownerPayments, total: totalPayments } = buildOwnerPayments(rc3Rows)

  // Opening balance — null until statements schema integration
  const openingBalance: EuroAmount | null = null

  // Closing balance equation
  const opening = openingBalance != null ? parseEur(openingBalance) : 0
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
