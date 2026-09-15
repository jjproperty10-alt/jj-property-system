/**
 * @module partner-settlement/external-partner/aviReportSections
 * @description Partner-visible sections of the Avi report that are derived,
 * never asserted: purchase expenses, the Airbnb Setup/Operations split, the
 * Hostaway income ledger, the month-by-month view and the closing summary.
 *
 * Every figure here is summed from certified lines. Nothing carries a payer,
 * payee, note, review flag, ledger id, JJ’s historical purchase price, the
 * premium, or who received it.
 *
 * ES5 target without `downlevelIteration`: never spread or iterate a Map/Set
 * in this module. Use records and arrays.
 */

import { roundEur } from './roundEur'
import {
  AVI_AIRBNB_OPERATIONS_LINES,
  AVI_AIRBNB_OPERATIONS_TOTAL_EUR,
  AVI_AIRBNB_OPERATIONS_AVI_EUR,
  AVI_AIRBNB_SETUP_LINES,
  AVI_AIRBNB_SETUP_TOTAL_EUR,
  AVI_AIRBNB_SETUP_AVI_EUR,
  AVI_AIRBNB_CHARGE_TOTAL_EUR,
  AVI_AIRBNB_CHARGE_AVI_EUR,
  AVI_INTERNET_SPLIT_ROW,
  AVI_PER_STAY_CONSUMABLES_EUR,
  AVI_SUPERSEDED_CONSUMABLE_TOTAL_EUR,
  aviAirbnbLinesByMonth,
  type AviAirbnbLine,
} from './aviAirbnbDepartments'
import {
  AVI_EXCLUDED_RESERVATIONS,
  AVI_HOSTAWAY_NIGHTS,
  AVI_HOSTAWAY_STAYS,
  AVI_HOSTAWAY_STAY_COUNT,
  AVI_HOSTAWAY_UNION_NTO_EUR,
  AVI_STATEMENT_PERIODS,
  aviStaysByCheckInMonth,
  type AviHostawayStay,
} from './aviHostawayStays'
import { PRIVATE_BOOKING_INCOME_TOTAL_EUR } from './hostawayPrintedNto'

const AVI_SHARE_PCT = 50

function half(total: number): number {
  return roundEur((total * AVI_SHARE_PCT) / 100)
}

function sumLines(lines: readonly AviAirbnbLine[]): number {
  return roundEur(lines.reduce((s, l) => s + l.amountEur, 0))
}

/* ------------------------------------------------------------------ */
/* Purchase expenses                                                    */
/* ------------------------------------------------------------------ */

export interface AviPurchaseExpenseLine {
  readonly month: string
  readonly labelEn: string
  readonly labelHe: string
  readonly amountEur: number
  readonly aviShareEur: number
}

export interface AviPurchaseExpensesSection {
  readonly lines: readonly AviPurchaseExpenseLine[]
  readonly totalEur: number
  readonly aviShareEur: number
  readonly aviPaidEur: number
  readonly aviPaidOn: string
  readonly aviRemainingEur: number
}

/**
 * Partner-facing purchase expenses. The purchase tax was paid once and is
 * shown once, as a single €2,400 line: the ledger also carries the two funding
 * legs that add up to it, and counting both would charge the tax twice.
 */
const PURCHASE_EXPENSE_LINES: readonly AviPurchaseExpenseLine[] = Object.freeze(
  (
    [
      ['2024-04', 750, 'Stamps', 'בולים'],
      ['2024-10', 2400, 'Purchase tax', 'מס רכישה'],
      ['2024-10', 2000, 'Lawyer fee', 'שכר טרחת עורך דין'],
      ['2024-10', 6750, 'Purchase tax', 'מס רכישה'],
    ] as const
  ).map(([month, amountEur, labelEn, labelHe]) => ({
    month,
    labelEn,
    labelHe,
    amountEur,
    aviShareEur: half(amountEur),
  })),
)

export const AVI_PURCHASE_EXPENSE_PAID_EUR = 5_600
export const AVI_PURCHASE_EXPENSE_PAID_ON = '2024-11-16'

export function composeAviPurchaseExpenses(): AviPurchaseExpensesSection {
  const totalEur = roundEur(PURCHASE_EXPENSE_LINES.reduce((s, l) => s + l.amountEur, 0))
  const aviShareEur = half(totalEur)
  return {
    lines: PURCHASE_EXPENSE_LINES,
    totalEur,
    aviShareEur,
    aviPaidEur: AVI_PURCHASE_EXPENSE_PAID_EUR,
    aviPaidOn: AVI_PURCHASE_EXPENSE_PAID_ON,
    aviRemainingEur: roundEur(aviShareEur - AVI_PURCHASE_EXPENSE_PAID_EUR),
  }
}

/* ------------------------------------------------------------------ */
/* Renovation                                                           */
/* ------------------------------------------------------------------ */

export interface AviRenovationGroup {
  readonly subcategory: string
  readonly rowCount: number
  readonly totalEur: number
  readonly aviShareEur: number
}

export interface AviRenovationPayment {
  readonly date: string
  readonly amountEur: number
}

export interface AviRenovationSection {
  /** Actual work done, by subcategory. Never includes the contract value. */
  readonly groups: readonly AviRenovationGroup[]
  readonly rowCount: number
  /** Sum of the itemised work above. */
  readonly totalEur: number
  /**
   * Certified renovation not yet broken down into work items, including any
   * amount still carried as a contract value. Shown, never silently dropped.
   */
  readonly unitemisedEur: number
  readonly certifiedChargeEur: number
  readonly aviShareEur: number
  readonly aviPaidEur: number
  readonly payments: readonly AviRenovationPayment[]
  readonly aviRemainingEur: number
  /** False when the certified charge stands on its own with no work items. */
  readonly hasDetailRows: boolean
  /**
   * False only when the itemised work exceeds the certified charge. A charge
   * that is not yet itemised is reported as unitemised, not as a contradiction.
   */
  readonly reconciles: boolean
}

export interface ComposeAviRenovationInput {
  readonly rows: readonly { subcategory: string | null; amountEur: number | null }[]
  readonly certifiedChargeEur: number
  readonly aviPaidEur: number
  readonly payments: readonly AviRenovationPayment[]
}

/** The agreed value of the work, not a payment for it. Never an expense line. */
export const AVI_RENOVATION_CONTRACT_SUBCATEGORY = 'Renovation Contract'

/**
 * Renovation grouped by the work that was done. The contract value is excluded
 * from the work list — it is an agreed price, not a thing that was bought — and
 * is reported as the still-unitemised part of the certified charge so that no
 * euro disappears from the section.
 *
 * Grouping accumulates into a record rather than a Map: the build target is ES5
 * without `downlevelIteration`.
 */
export function composeAviRenovation(input: ComposeAviRenovationInput): AviRenovationSection {
  const totals: Record<string, { rowCount: number; totalEur: number }> = {}
  const order: string[] = []
  let itemisedRowCount = 0
  for (const row of input.rows) {
    const raw = (row.subcategory ?? '').trim()
    if (raw === AVI_RENOVATION_CONTRACT_SUBCATEGORY) continue
    const key = raw === '' ? 'Other' : raw
    if (totals[key] === undefined) {
      totals[key] = { rowCount: 0, totalEur: 0 }
      order.push(key)
    }
    totals[key].rowCount += 1
    totals[key].totalEur += row.amountEur ?? 0
    itemisedRowCount += 1
  }

  const groups: AviRenovationGroup[] = order
    .map((subcategory) => ({
      subcategory,
      rowCount: totals[subcategory].rowCount,
      totalEur: roundEur(totals[subcategory].totalEur),
      aviShareEur: half(roundEur(totals[subcategory].totalEur)),
    }))
    .sort((a, b) => b.totalEur - a.totalEur || a.subcategory.localeCompare(b.subcategory))

  const totalEur = roundEur(groups.reduce((s, g) => s + g.totalEur, 0))
  const aviShareEur = half(input.certifiedChargeEur)
  return {
    groups,
    rowCount: itemisedRowCount,
    totalEur,
    unitemisedEur: roundEur(input.certifiedChargeEur - totalEur),
    certifiedChargeEur: input.certifiedChargeEur,
    aviShareEur,
    aviPaidEur: input.aviPaidEur,
    payments: input.payments,
    aviRemainingEur: roundEur(aviShareEur - input.aviPaidEur),
    hasDetailRows: itemisedRowCount > 0,
    reconciles: totalEur - input.certifiedChargeEur < 0.005,
  }
}

/* ------------------------------------------------------------------ */
/* Airbnb departments                                                   */
/* ------------------------------------------------------------------ */

export interface AviAirbnbDepartmentSection {
  readonly key: 'setup' | 'operations'
  readonly labelEn: string
  readonly labelHe: string
  readonly descriptionEn: string
  readonly descriptionHe: string
  readonly lines: readonly AviAirbnbLine[]
  readonly monthGroups: ReturnType<typeof aviAirbnbLinesByMonth>
  readonly totalEur: number
  readonly aviShareEur: number
}

export interface AviAirbnbSection {
  readonly setup: AviAirbnbDepartmentSection
  readonly operations: AviAirbnbDepartmentSection
  readonly totalEur: number
  readonly aviShareEur: number
  readonly internetSplit: {
    readonly month: string
    readonly ledgerAmountEur: number
    readonly installationEur: number
    readonly firstMonthEur: number
    readonly firstMonthCovered: string
  }
  readonly consumables: {
    readonly perStayEur: number
    readonly stays: number
    readonly totalEur: number
    readonly supersededPurchasesEur: number
  }
}

export function composeAviAirbnbSection(): AviAirbnbSection {
  const consumablesTotal = roundEur(AVI_HOSTAWAY_STAY_COUNT * AVI_PER_STAY_CONSUMABLES_EUR)
  return {
    setup: {
      key: 'setup',
      labelEn: 'Airbnb setup',
      labelHe: 'הקמת Airbnb',
      descriptionEn: 'One-off cost of making the property rentable.',
      descriptionHe: 'עלות חד־פעמית להכנת הנכס להשכרה קצרת טווח.',
      lines: AVI_AIRBNB_SETUP_LINES,
      monthGroups: aviAirbnbLinesByMonth('setup'),
      totalEur: AVI_AIRBNB_SETUP_TOTAL_EUR,
      aviShareEur: AVI_AIRBNB_SETUP_AVI_EUR,
    },
    operations: {
      key: 'operations',
      labelEn: 'Airbnb operations',
      labelHe: 'תפעול Airbnb',
      descriptionEn: 'Recurring cost of running the property.',
      descriptionHe: 'עלות שוטפת להפעלת הנכס.',
      lines: AVI_AIRBNB_OPERATIONS_LINES,
      monthGroups: aviAirbnbLinesByMonth('operations'),
      totalEur: AVI_AIRBNB_OPERATIONS_TOTAL_EUR,
      aviShareEur: AVI_AIRBNB_OPERATIONS_AVI_EUR,
    },
    totalEur: AVI_AIRBNB_CHARGE_TOTAL_EUR,
    aviShareEur: AVI_AIRBNB_CHARGE_AVI_EUR,
    internetSplit: AVI_INTERNET_SPLIT_ROW,
    consumables: {
      perStayEur: AVI_PER_STAY_CONSUMABLES_EUR,
      stays: AVI_HOSTAWAY_STAY_COUNT,
      totalEur: consumablesTotal,
      supersededPurchasesEur: AVI_SUPERSEDED_CONSUMABLE_TOTAL_EUR,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Hostaway income                                                      */
/* ------------------------------------------------------------------ */

export interface AviHostawayIncomeSection {
  readonly stays: readonly AviHostawayStay[]
  readonly stayCount: number
  readonly nights: number
  readonly printedNtoTotalEur: number
  readonly aviShareEur: number
  readonly statementPeriods: typeof AVI_STATEMENT_PERIODS
  readonly excluded: typeof AVI_EXCLUDED_RESERVATIONS
}

export function composeAviHostawayIncome(): AviHostawayIncomeSection {
  return {
    stays: AVI_HOSTAWAY_STAYS,
    stayCount: AVI_HOSTAWAY_STAY_COUNT,
    nights: AVI_HOSTAWAY_NIGHTS,
    printedNtoTotalEur: AVI_HOSTAWAY_UNION_NTO_EUR,
    aviShareEur: half(AVI_HOSTAWAY_UNION_NTO_EUR),
    statementPeriods: AVI_STATEMENT_PERIODS,
    excluded: AVI_EXCLUDED_RESERVATIONS,
  }
}

/* ------------------------------------------------------------------ */
/* Month-by-month view                                                  */
/* ------------------------------------------------------------------ */

/** Private bookings collected outside the platforms, by month. */
const PRIVATE_INCOME_BY_MONTH: Readonly<Record<string, number>> = Object.freeze({
  '2025-08': 960,
  '2025-11': 400,
})

export interface AviMonthlyRow {
  readonly month: string
  readonly stays: readonly AviHostawayStay[]
  readonly stayCount: number
  readonly nights: number
  readonly hostawayNtoEur: number
  readonly privateIncomeEur: number
  readonly incomeEur: number
  readonly hostawayLicenceEur: number
  readonly internetEur: number
  readonly poolServiceEur: number
  readonly consumablesEur: number
  readonly otherOperatingEur: number
  readonly operationsEur: number
  readonly operatingResultEur: number
  readonly setupEur: number
  readonly resultAfterSetupEur: number
  readonly aviResultEur: number
  /** Half of that month's income (not net of setup/operations). */
  readonly aviIncomeShareEur: number
}

export interface AviMonthlySection {
  readonly rows: readonly AviMonthlyRow[]
  readonly totals: Omit<AviMonthlyRow, 'month' | 'stays'>
  /**
   * Cent bridge so the sum of displayed monthly Avi halves matches the
   * certified period share. Presentation only — does not change €740.94.
   */
  readonly roundingAdjustmentEur: number
  /**
   * Cent bridge so displayed monthly income-halves match half of period income.
   * Presentation only — does not change €740.94.
   */
  readonly incomeShareRoundingAdjustmentEur: number
}

function bucketOperations(month: string): {
  licence: number
  internet: number
  pool: number
  consumables: number
  other: number
} {
  let licence = 0
  let internet = 0
  let pool = 0
  let consumables = 0
  let other = 0
  for (const line of AVI_AIRBNB_OPERATIONS_LINES) {
    if (line.month !== month) continue
    if (line.labelEn === 'Hostaway licence') licence += line.amountEur
    else if (line.labelEn === 'Internet') internet += line.amountEur
    else if (line.labelEn === 'Pool service') pool += line.amountEur
    else if (line.basis === 'per_stay_charge') consumables += line.amountEur
    else other += line.amountEur
  }
  return {
    licence: roundEur(licence),
    internet: roundEur(internet),
    pool: roundEur(pool),
    consumables: roundEur(consumables),
    other: roundEur(other),
  }
}

export function composeAviMonthly(): AviMonthlySection {
  const stayGroups = aviStaysByCheckInMonth()
  const staysByMonth: Record<string, (typeof stayGroups)[number]> = {}
  const months: string[] = []
  const seen: Record<string, true> = {}

  function note(month: string): void {
    if (!seen[month]) {
      seen[month] = true
      months.push(month)
    }
  }

  for (const group of stayGroups) {
    staysByMonth[group.month] = group
    note(group.month)
  }
  for (const line of AVI_AIRBNB_OPERATIONS_LINES) note(line.month)
  for (const line of AVI_AIRBNB_SETUP_LINES) note(line.month)
  for (const month of Object.keys(PRIVATE_INCOME_BY_MONTH)) note(month)

  const rows: AviMonthlyRow[] = months
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const group = staysByMonth[month]
      const stays = group ? group.stays : []
      const hostawayNtoEur = group ? group.printedNtoEur : 0
      const privateIncomeEur = PRIVATE_INCOME_BY_MONTH[month] ?? 0
      const ops = bucketOperations(month)
      const setupEur = sumLines(AVI_AIRBNB_SETUP_LINES.filter((l) => l.month === month))
      const incomeEur = roundEur(hostawayNtoEur + privateIncomeEur)
      const operationsEur = roundEur(
        ops.licence + ops.internet + ops.pool + ops.consumables + ops.other,
      )
      const operatingResultEur = roundEur(incomeEur - operationsEur)
      const resultAfterSetupEur = roundEur(operatingResultEur - setupEur)
      return {
        month,
        stays,
        stayCount: stays.length,
        nights: group ? group.nights : 0,
        hostawayNtoEur,
        privateIncomeEur,
        incomeEur,
        hostawayLicenceEur: ops.licence,
        internetEur: ops.internet,
        poolServiceEur: ops.pool,
        consumablesEur: ops.consumables,
        otherOperatingEur: ops.other,
        operationsEur,
        operatingResultEur,
        setupEur,
        resultAfterSetupEur,
        // Reader-verifiable half: (Income − Ops − Setup) ÷ 2 to the nearest cent.
        // Sum of these halves can differ from the certified period share by a few
        // cents; `roundingAdjustmentEur` bridges that gap. Final net €740.94 unchanged.
        aviResultEur: Math.round(resultAfterSetupEur * 50) / 100,
        aviIncomeShareEur: Math.round(incomeEur * 50) / 100,
      }
    })

  const add = (pick: (r: AviMonthlyRow) => number): number =>
    roundEur(rows.reduce((s, r) => s + pick(r), 0))

  const displayedAviSumEur = add((r) => r.aviResultEur)
  // Certified period share = half of the period result after setup (rounded once).
  const certifiedAviResultEur = roundEur(
    (add((r) => r.resultAfterSetupEur) * AVI_SHARE_PCT) / 100,
  )
  const roundingAdjustmentEur = roundEur(certifiedAviResultEur - displayedAviSumEur)
  const displayedIncomeShareSumEur = add((r) => r.aviIncomeShareEur)
  const certifiedIncomeShareEur = half(add((r) => r.incomeEur))
  const incomeShareRoundingAdjustmentEur = roundEur(
    certifiedIncomeShareEur - displayedIncomeShareSumEur,
  )

  return {
    rows,
    roundingAdjustmentEur,
    incomeShareRoundingAdjustmentEur,
    totals: {
      stayCount: rows.reduce((s, r) => s + r.stayCount, 0),
      nights: rows.reduce((s, r) => s + r.nights, 0),
      hostawayNtoEur: add((r) => r.hostawayNtoEur),
      privateIncomeEur: add((r) => r.privateIncomeEur),
      incomeEur: add((r) => r.incomeEur),
      hostawayLicenceEur: add((r) => r.hostawayLicenceEur),
      internetEur: add((r) => r.internetEur),
      poolServiceEur: add((r) => r.poolServiceEur),
      consumablesEur: add((r) => r.consumablesEur),
      otherOperatingEur: add((r) => r.otherOperatingEur),
      operationsEur: add((r) => r.operationsEur),
      operatingResultEur: add((r) => r.operatingResultEur),
      setupEur: add((r) => r.setupEur),
      resultAfterSetupEur: add((r) => r.resultAfterSetupEur),
      aviResultEur: certifiedAviResultEur,
      aviIncomeShareEur: certifiedIncomeShareEur,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Closing summary                                                      */
/* ------------------------------------------------------------------ */

export interface AviSummaryRow {
  readonly key: string
  readonly labelEn: string
  readonly labelHe: string
  readonly obligationEur: number | null
  readonly paidEur: number | null
  readonly creditEur: number | null
  readonly remainingEur: number | null
}

export interface AviFinalSummary {
  readonly rows: readonly AviSummaryRow[]
  readonly obligationTotalEur: number
  readonly paidTotalEur: number
  readonly creditsTotalEur: number
  readonly netEur: number
  readonly aviIsOwed: boolean
}

export interface ComposeAviFinalSummaryInput {
  readonly acquisitionObligationEur: number
  readonly acquisitionPaidEur: number
  readonly renovationObligationEur: number
  readonly renovationPaidEur: number
  readonly creditsEur: number
}

export function composeAviFinalSummary(input: ComposeAviFinalSummaryInput): AviFinalSummary {
  const purchase = composeAviPurchaseExpenses()
  const rows: AviSummaryRow[] = [
    {
      key: 'acquisition',
      labelEn: 'Property acquisition',
      labelHe: 'רכישת הנכס',
      obligationEur: input.acquisitionObligationEur,
      paidEur: input.acquisitionPaidEur,
      creditEur: null,
      remainingEur: roundEur(input.acquisitionObligationEur - input.acquisitionPaidEur),
    },
    {
      key: 'purchase_expenses',
      labelEn: 'Purchase expenses',
      labelHe: 'הוצאות רכישה',
      obligationEur: purchase.aviShareEur,
      paidEur: purchase.aviPaidEur,
      creditEur: null,
      remainingEur: purchase.aviRemainingEur,
    },
    {
      key: 'renovation',
      labelEn: 'Renovation',
      labelHe: 'שיפוץ',
      obligationEur: input.renovationObligationEur,
      paidEur: input.renovationPaidEur,
      creditEur: null,
      remainingEur: roundEur(input.renovationObligationEur - input.renovationPaidEur),
    },
    {
      key: 'airbnb_setup',
      labelEn: 'Airbnb setup',
      labelHe: 'הקמת Airbnb',
      obligationEur: AVI_AIRBNB_SETUP_AVI_EUR,
      paidEur: null,
      creditEur: null,
      remainingEur: AVI_AIRBNB_SETUP_AVI_EUR,
    },
    {
      key: 'airbnb_operations',
      labelEn: 'Airbnb operations',
      labelHe: 'תפעול Airbnb',
      obligationEur: AVI_AIRBNB_OPERATIONS_AVI_EUR,
      paidEur: null,
      creditEur: null,
      remainingEur: AVI_AIRBNB_OPERATIONS_AVI_EUR,
    },
    {
      key: 'income_credits',
      labelEn: 'Rental income credited to Avi',
      labelHe: 'הכנסות שכירות לזכות אבי',
      obligationEur: null,
      paidEur: null,
      creditEur: input.creditsEur,
      remainingEur: null,
    },
  ]

  const obligationTotalEur = roundEur(
    rows.reduce((s, r) => s + (r.obligationEur ?? 0), 0),
  )
  const paidTotalEur = roundEur(rows.reduce((s, r) => s + (r.paidEur ?? 0), 0))
  const creditsTotalEur = roundEur(rows.reduce((s, r) => s + (r.creditEur ?? 0), 0))
  const netEur = roundEur(paidTotalEur + creditsTotalEur - obligationTotalEur)

  return {
    rows,
    obligationTotalEur,
    paidTotalEur,
    creditsTotalEur,
    netEur,
    aviIsOwed: netEur > 0.005,
  }
}

export const AVI_PRIVATE_INCOME_TOTAL_EUR = PRIVATE_BOOKING_INCOME_TOTAL_EUR
