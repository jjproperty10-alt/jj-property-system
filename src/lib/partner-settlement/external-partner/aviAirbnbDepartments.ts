/**
 * @module partner-settlement/external-partner/aviAirbnbDepartments
 * @description Certified Airbnb decomposition for the Avi partner report:
 * Setup (one-off, making the property rentable) vs Operations (recurring cost
 * of running it). Yossi 2026-09-08.
 *
 * Every total on this module is summed from its lines. Nothing is asserted.
 * Lines carry a safe purpose label only — no payer, payee, note or ledger id.
 *
 * Closed decisions encoded here:
 * - The 05/2025 internet charge of €325 is one payment covering two different
 *   things. It is presented as €295 Internet installation (Setup, in 06/2025
 *   with the first covered month) plus €30 Internet for 06/2025 (Operations).
 *   Presentation only; the ledger row is untouched and the €325 is never
 *   counted twice. June Setup is therefore €347.99 (€295 + €52.99 already
 *   in that month).
 * - Recurring partner charges are billed per calendar month whether or not the
 *   supplier invoice has reached the ledger: Hostaway licence €40 from 07/2025,
 *   internet €30 from 06/2025, pool service €120 from 02/2025. Supplier cash
 *   payments are absorbed by the monthly charge and never charged again.
 * - Guest consumables are billed at €15 per completed stay instead of the
 *   individual guest-supply purchases, which are therefore superseded.
 *   Durable and maintenance items are not consumables and remain charged.
 */

import { roundEur } from './roundEur'
import { AVI_HOSTAWAY_STAYS, aviStayCheckInMonth } from './aviHostawayStays'

export type AviAirbnbDepartment = 'setup' | 'operations'

/** How a charge reached the report. */
export type AviChargeBasis =
  /** A single dated cost on the JJ ledger. */
  | 'ledger'
  /** Part of a ledger row, split by purpose for presentation only. */
  | 'ledger_split'
  /** An approved recurring monthly charge for a month with no ledger row yet. */
  | 'monthly_charge'
  /** €15 per completed stay, replacing individual guest-supply purchases. */
  | 'per_stay_charge'

export interface AviAirbnbLine {
  readonly department: AviAirbnbDepartment
  /** Charge month, YYYY-MM. Expenses are presented by month, not by day. */
  readonly month: string
  readonly labelEn: string
  readonly labelHe: string
  readonly amountEur: number
  readonly basis: AviChargeBasis
}

export const AVI_AIRBNB_START_MONTH = '2025-02'
export const AVI_AIRBNB_END_MONTH = '2026-08'

export const AVI_MONTHLY_HOSTAWAY_LICENCE_EUR = 40
export const AVI_MONTHLY_INTERNET_EUR = 30
export const AVI_MONTHLY_POOL_SERVICE_EUR = 120
export const AVI_PER_STAY_CONSUMABLES_EUR = 15

export const AVI_HOSTAWAY_LICENCE_FIRST_MONTH = '2025-07'
export const AVI_INTERNET_FIRST_MONTH = '2025-06'
export const AVI_POOL_SERVICE_FIRST_MONTH = '2025-02'

/** The single ledger row split by purpose. */
export const AVI_INTERNET_SPLIT_ROW = Object.freeze({
  month: '2025-05',
  ledgerAmountEur: 325,
  installationEur: 295,
  firstMonthEur: 30,
  firstMonthCovered: '2025-06',
})

/**
 * Guest-supply purchases superseded by the €15 per-stay charge. Presentation
 * exclusion only; the ledger rows are not modified, deleted or re-flagged.
 */
export const AVI_SUPERSEDED_CONSUMABLE_IDS: readonly string[] = Object.freeze([
  'bdb1b4dd-2d3f-4c69-be3c-0821fa17f508',
  '34eb9ed4-52b2-405e-9de5-33917b4a2eaf',
  '05dd8da5-a198-4db0-8e7e-741f98c66cd3',
  '7d72020a-9ca6-44fa-a5d5-43aecd19a63b',
  '0aa8e8a8-25dd-44a7-b01c-f7aac0889ca3',
  '339508af-efd7-40d9-81f8-9759012126cc',
  '65418030-9d5e-4134-a9d1-365c3bf3be67',
  'beb035f9-e001-45db-92e6-dc0cea644662',
  '87c5b23a-9d17-4692-a9de-5902100e37bf',
  '2d2a8825-2361-4757-a9b3-c298904f8183',
])

export const AVI_SUPERSEDED_CONSUMABLE_TOTAL_EUR = 729.67

/** Durable / maintenance items that stay charged even if labelled like supplies. */
export const AVI_KEPT_MAINTENANCE_AMOUNTS_EUR: readonly number[] = Object.freeze([
  86, 49.3, 21.5, 34.46, 48.55, 11.63, 16.33,
])

export const AVI_KEPT_MAINTENANCE_TOTAL_EUR = 267.77

/** The ledger row presented as €295 Setup + €30 Operations. */
export const AVI_INTERNET_SPLIT_ROW_ID = '33e5e4ce-7e54-4aa8-8bc0-8fcec00eb7c5'

function monthRange(firstMonth: string, lastMonth: string): string[] {
  const out: string[] = []
  let [y, m] = firstMonth.split('-').map(Number)
  const [ly, lm] = lastMonth.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function monthlySeries(
  firstMonth: string,
  amountEur: number,
  labelEn: string,
  labelHe: string,
  skipMonths: readonly string[] = [],
): AviAirbnbLine[] {
  const skip = new Set(skipMonths)
  return monthRange(firstMonth, AVI_AIRBNB_END_MONTH)
    .filter((month) => !skip.has(month))
    .map((month) => ({
      department: 'operations' as const,
      month,
      labelEn,
      labelHe,
      amountEur,
      basis: 'monthly_charge' as const,
    }))
}

/** One-off costs of making Villa Mazotos rentable. */
const SETUP_LEDGER_LINES: readonly AviAirbnbLine[] = Object.freeze(
  (
    [
      ['2025-05', 600, 'Initial linen and duvets', 'מצעים ושמיכות ראשוניים'],
      ['2025-06', 7.99, 'Initial hosting equipment', 'ציוד אירוח ראשוני'],
      ['2025-06', 45, 'Initial appliance (iron)', 'מכשיר ראשוני (מגהץ)'],
      ['2025-07', 1200, 'Initial linen and towels', 'מצעים ומגבות ראשוניים'],
      ['2025-07', 65.57, 'Initial styling and decoration', 'עיצוב וסטיילינג ראשוני'],
      ['2025-07', 350, 'Initial styling', 'סטיילינג ראשוני'],
      ['2025-07', 240.5, 'Initial styling', 'סטיילינג ראשוני'],
      ['2025-07', 249, 'Initial kitchen (plates, glasses)', 'מטבח ראשוני (צלחות, כוסות)'],
      ['2025-07', 102.25, 'Initial linen (bed sheets)', 'מצעים ראשוניים (סדינים)'],
      ['2025-07', 240, 'Initial hosting equipment (baby cot, chair)', 'ציוד אירוח ראשוני (לול, כיסא)'],
      ['2025-07', 110, 'Initial kitchen (pots and pans)', 'מטבח ראשוני (סירים ומחבתות)'],
      ['2025-07', 46.36, 'Initial styling and decoration', 'עיצוב וסטיילינג ראשוני'],
      ['2025-07', 335, 'Listing photography', 'צילומי נכס לפרסום'],
      ['2025-07', 150, 'Listing photography', 'צילומי נכס לפרסום'],
      ['2025-07', 11.27, 'Initial hosting items', 'פריטי אירוח ראשוניים'],
      ['2025-07', 110.55, 'Initial safety equipment', 'ציוד בטיחות ראשוני'],
      ['2025-08', 60, 'Initial appliances (ironing board, hair dryer)', 'מכשירים ראשוניים (קרש גיהוץ, מייבש שיער)'],
      ['2025-08', 545, 'Listing photography', 'צילומי נכס לפרסום'],
      ['2025-08', 85.5, 'Initial exterior signage', 'שילוט חיצוני ראשוני'],
      ['2025-08', 350, 'Listing photography', 'צילומי נכס לפרסום'],
      ['2025-10', 122, 'Sleeping capacity completion (extra mattress)', 'השלמת מקומות לינה (מזרן נוסף)'],
      ['2026-01', 53.99, 'Initial safe', 'כספת ראשונית'],
      ['2026-01', 11.08, 'Initial safety equipment', 'ציוד בטיחות ראשוני'],
      ['2026-05', 320, 'One-off lighting installation', 'התקנת תאורה חד-פעמית'],
    ] as const
  ).map(([month, amountEur, labelEn, labelHe]) => ({
    department: 'setup' as const,
    month,
    labelEn,
    labelHe,
    amountEur,
    basis: 'ledger' as const,
  })),
)

const SETUP_INTERNET_INSTALLATION: AviAirbnbLine = Object.freeze({
  department: 'setup',
  month: AVI_INTERNET_SPLIT_ROW.firstMonthCovered,
  labelEn: 'Internet installation (one-off)',
  labelHe: 'התקנת אינטרנט (חד-פעמי)',
  amountEur: AVI_INTERNET_SPLIT_ROW.installationEur,
  basis: 'ledger_split',
})

/** Recurring cost of running the property. Excludes the €325 internet row. */
const OPERATIONS_LEDGER_LINES: readonly AviAirbnbLine[] = Object.freeze(
  (
    [
      ['2024-12', 154.1, 'Electricity', 'חשמל'],
      ['2025-04', 195.76, 'Electricity', 'חשמל'],
      ['2025-04', 185.47, 'Water', 'מים'],
      ['2025-05', 37.77, 'Plumbing repair', 'תיקון אינסטלציה'],
      ['2025-06', 127.15, 'Electricity', 'חשמל'],
      ['2025-06', 11.63, 'Cleaning materials', 'חומרי ניקוי'],
      ['2025-06', 16.33, 'Site supplies', 'ציוד לנכס'],
      ['2025-08', 243.09, 'Electricity', 'חשמל'],
      ['2025-09', 700.86, 'Electricity', 'חשמל'],
      ['2025-10', 21.5, 'Replacement soft goods', 'החלפת פריטי טקסטיל'],
      ['2025-10', 34.46, 'Replacement soft goods', 'החלפת פריטי טקסטיל'],
      ['2025-11', 1005.04, 'Electricity', 'חשמל'],
      ['2025-12', 280, 'Garden maintenance', 'תחזוקת גינה'],
      ['2025-12', 393.54, 'Electricity', 'חשמל'],
      ['2026-01', 10.5, 'Key duplication', 'שכפול מפתחות'],
      ['2026-01', 165.4, 'Electricity', 'חשמל'],
      ['2026-03', 48.55, 'Replacement goods', 'החלפת ציוד'],
      ['2026-04', 199.87, 'Electricity', 'חשמל'],
      ['2026-04', 450, 'Pool pump replacement', 'החלפת משאבת בריכה'],
      ['2026-04', 86, 'Cleaning equipment', 'ציוד ניקיון'],
      ['2026-04', 60.54, 'Storage boxes', 'ארגזי אחסון'],
      ['2026-05', 49.3, 'Deck maintenance oil', 'שמן לתחזוקת דק'],
      ['2026-05', 316.15, 'Water', 'מים'],
      ['2026-06', 497, 'Property insurance', 'ביטוח נכס'],
      ['2026-08', 181.79, 'Electricity', 'חשמל'],
    ] as const
  ).map(([month, amountEur, labelEn, labelHe]) => ({
    department: 'operations' as const,
    month,
    labelEn,
    labelHe,
    amountEur,
    basis: 'ledger' as const,
  })),
)

const OPERATIONS_INTERNET_FIRST_MONTH: AviAirbnbLine = Object.freeze({
  department: 'operations',
  month: AVI_INTERNET_SPLIT_ROW.firstMonthCovered,
  labelEn: 'Internet',
  labelHe: 'אינטרנט',
  amountEur: AVI_INTERNET_SPLIT_ROW.firstMonthEur,
  basis: 'ledger_split',
})

/**
 * €15 per completed stay, in the check-in month.
 *
 * Counting uses a plain record rather than a Map: the build target is ES5
 * without `downlevelIteration`, so spreading a Map iterator compiles to an
 * empty array in the Jest transform while working under the Next compiler.
 * Same rule applies anywhere else in this module.
 */
function consumablesLines(): AviAirbnbLine[] {
  const staysByMonth: Record<string, number> = {}
  const months: string[] = []
  for (const stay of AVI_HOSTAWAY_STAYS) {
    const month = aviStayCheckInMonth(stay)
    if (staysByMonth[month] === undefined) {
      staysByMonth[month] = 0
      months.push(month)
    }
    staysByMonth[month] += 1
  }
  return months
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const stays = staysByMonth[month]
      return {
        department: 'operations' as const,
        month,
        labelEn: `Guest consumables (${stays} ${stays === 1 ? 'stay' : 'stays'})`,
        labelHe: `מתכלים לאורחים (${stays} ${stays === 1 ? 'שהייה' : 'שהיות'})`,
        amountEur: roundEur(stays * AVI_PER_STAY_CONSUMABLES_EUR),
        basis: 'per_stay_charge' as const,
      }
    })
}

export const AVI_AIRBNB_SETUP_LINES: readonly AviAirbnbLine[] = Object.freeze(
  [...SETUP_LEDGER_LINES, SETUP_INTERNET_INSTALLATION].sort((a, b) => a.month.localeCompare(b.month)),
)

export const AVI_AIRBNB_OPERATIONS_LINES: readonly AviAirbnbLine[] = Object.freeze(
  [
    ...OPERATIONS_LEDGER_LINES,
    OPERATIONS_INTERNET_FIRST_MONTH,
    ...monthlySeries(AVI_INTERNET_FIRST_MONTH, AVI_MONTHLY_INTERNET_EUR, 'Internet', 'אינטרנט', [
      AVI_INTERNET_SPLIT_ROW.firstMonthCovered,
    ]),
    ...monthlySeries(
      AVI_HOSTAWAY_LICENCE_FIRST_MONTH,
      AVI_MONTHLY_HOSTAWAY_LICENCE_EUR,
      'Hostaway licence',
      'רישיון Hostaway',
    ),
    ...monthlySeries(
      AVI_POOL_SERVICE_FIRST_MONTH,
      AVI_MONTHLY_POOL_SERVICE_EUR,
      'Pool service',
      'שירות בריכה',
    ),
    ...consumablesLines(),
  ].sort((a, b) => a.month.localeCompare(b.month)),
)

function sum(lines: readonly AviAirbnbLine[]): number {
  return roundEur(lines.reduce((s, l) => s + l.amountEur, 0))
}

export const AVI_AIRBNB_SETUP_TOTAL_EUR = sum(AVI_AIRBNB_SETUP_LINES)
export const AVI_AIRBNB_OPERATIONS_TOTAL_EUR = sum(AVI_AIRBNB_OPERATIONS_LINES)
export const AVI_AIRBNB_CHARGE_TOTAL_EUR = roundEur(
  AVI_AIRBNB_SETUP_TOTAL_EUR + AVI_AIRBNB_OPERATIONS_TOTAL_EUR,
)

export const AVI_AIRBNB_SETUP_AVI_EUR = roundEur(AVI_AIRBNB_SETUP_TOTAL_EUR / 2)
export const AVI_AIRBNB_OPERATIONS_AVI_EUR = roundEur(AVI_AIRBNB_OPERATIONS_TOTAL_EUR / 2)
export const AVI_AIRBNB_CHARGE_AVI_EUR = roundEur(AVI_AIRBNB_CHARGE_TOTAL_EUR / 2)

export interface AviAirbnbMonthGroup {
  readonly month: string
  readonly lines: readonly AviAirbnbLine[]
  readonly totalEur: number
}

export function aviAirbnbLinesByMonth(
  department: AviAirbnbDepartment,
): readonly AviAirbnbMonthGroup[] {
  const lines = department === 'setup' ? AVI_AIRBNB_SETUP_LINES : AVI_AIRBNB_OPERATIONS_LINES
  const byMonth: Record<string, AviAirbnbLine[]> = {}
  const months: string[] = []
  for (const line of lines) {
    if (byMonth[line.month] === undefined) {
      byMonth[line.month] = []
      months.push(line.month)
    }
    byMonth[line.month].push(line)
  }
  return months
    .sort((a, b) => a.localeCompare(b))
    .map((month) => ({ month, lines: byMonth[month], totalEur: sum(byMonth[month]) }))
}

/** Recurring months billed for one label, used by the monthly view. */
export function aviMonthlyChargeMonths(labelEn: string): string[] {
  return AVI_AIRBNB_OPERATIONS_LINES.filter(
    (l) => l.labelEn === labelEn && (l.basis === 'monthly_charge' || l.basis === 'ledger_split'),
  ).map((l) => l.month)
}
