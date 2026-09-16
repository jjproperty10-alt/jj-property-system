/**
 * @module partner-settlement/external-partner/externalPartnerAviVisible
 * @description Avi-visible presentation classification.
 *
 * Maps certified engine outputs into the object the UI may receive.
 * Acquisition is shown as an agreed partnership value and Avi’s 50% share.
 * The historical purchase-contract row and a separate premium line never
 * appear on this projection.
 *
 * Expense whitelist (partner-chargeable layers only):
 * renovation / Airbnb / management / deal (Purchase Expenses).
 * Avi is charged the certified partner obligation. Internal JJ execution
 * costs, payers, and payment movements are not exposed.
 *
 * Purchase Contract, Premium, funding, conduit, Client Payment, platform
 * income, the renovation contract value, the duplicated purchase-tax row,
 * superseded guest-supply purchases, and the unsplit €325 internet row are
 * excluded. Actual renovation work is listed. Airbnb billing-only pool
 * invoices are included; cashbox pool execution of those invoices is not.
 * Payments never appear in the expense list.
 *
 * Charge per expense row: a positive client_charge replaces amount; they are
 * never added. Missing or zero client_charge is billed at cost (live `null`
 * and CSV `0.00` both mean “no separate markup”).
 */

import {
  AVI_INTERNET_SPLIT_ROW_ID,
  AVI_SUPERSEDED_CONSUMABLE_IDS,
} from './aviAirbnbDepartments'
import { applyAviApprovedExpenseOverlay } from './aviExpenseOverlay'
import { AVI_VM1_DUPLICATE_PURCHASE_EXPENSE } from './externalPartnerAviConfig'
import { deriveExternalPartnerBillableCharge } from './billedActivity'
import { roundEur } from './roundEur'
import type { ExternalPartnerInternalRow } from './externalPartnerReadTypes'
import type { ExternalPartnerShare } from './types'
import type { ExternalPartnerActivityLine } from './billedActivity'
import type { ExternalPartnerDealExpenseLine } from './dealExpense'
import type {
  AviReportAcquisitionPresentation,
  AviReportExpenseCompleteness,
  AviReportLayerBreakdown,
  AviReportPartnerExpense,
  AviReportPartnerPayment,
  AviVisibleExpenseLayer,
} from './externalPartnerAviReportTypes'

export function formatAviEur(amountEur: number): string {
  return `\u20AC${Math.abs(amountEur).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatAviOwes(amountEur: number): string {
  return `Avi owes ${formatAviEur(amountEur)}`
}

export function formatAviIsOwed(amountEur: number): string {
  return `Avi is owed ${formatAviEur(amountEur)}`
}

/**
 * Renovation rows Avi may see (Yossi 2026-09-08):
 * - Actual work rows are the expenses. The contract value is an agreed price,
 *   not a thing that was bought, and is never listed beside them.
 * - `Client Payment` is funding, not an expense.
 */
const HIDDEN_PRESENTATION_IDS: ReadonlySet<string> = new Set([
  AVI_VM1_DUPLICATE_PURCHASE_EXPENSE.id,
  AVI_INTERNET_SPLIT_ROW_ID,
  ...AVI_SUPERSEDED_CONSUMABLE_IDS,
])

const MANAGEMENT_NON_CHARGE_SUBCATEGORIES: ReadonlySet<string> = new Set([
  'Tenant Payment',
  'Management Fee',
  'Deposit',
  'Deposit refund',
  'Bank Payment to Owner',
])

export interface AviVisibleExpenseAmounts {
  readonly amountEur?: number | null
  readonly clientCharge?: number | null
}

function hasPositiveClientCharge(clientCharge: number | null | undefined): boolean {
  return clientCharge != null && Number.isFinite(clientCharge) && clientCharge > 0
}

/**
 * Airbnb monthly pool invoices (amount 0, client_charge 120) are the partner
 * charge. Cashbox payments to the pool vendor are internal execution of those
 * invoices and must not be listed beside them.
 * A pool row with a positive client_charge is a billed markup, not execution.
 */
function isAirbnbInternalPoolExecution(
  subcategory: string,
  amounts: AviVisibleExpenseAmounts | undefined,
): boolean {
  if (subcategory !== 'Pool Service') return false
  const amount = amounts?.amountEur ?? 0
  return amount > 0 && !hasPositiveClientCharge(amounts?.clientCharge)
}

/**
 * Positive client_charge replaces cost. Missing/zero client_charge → cost.
 * `deriveExternalPartnerBillableCharge` still applies; zero is adapted to
 * “no markup” so CSV `0.00` matches live `null`.
 */
function partnerVisibleChargeEur(row: ExternalPartnerInternalRow): number | null {
  const amount = row.amountEur ?? 0
  const clientCharge = hasPositiveClientCharge(row.clientCharge) ? row.clientCharge : null
  const billable = deriveExternalPartnerBillableCharge([
    { id: row.id, amountEur: amount, clientCharge },
  ])
  const per = billable.perRow[0]
  if (!per || per.charge === null || per.basis === 'invalid_review') return null
  if (per.charge <= 0) return null
  return per.charge
}

/**
 * 50% of each certified charge, with leftover cents allocated so the line
 * shares in a layer sum to `roundEur(layerCharge × 50%)`. Independent
 * half-cent rounding on odd-cent Airbnb rows otherwise overshoots the
 * certified Avi share. Allocation is in integer cents so the layer total
 * cannot drift.
 */
function eurToCents(value: number): number {
  return Math.round(roundEur(value) * 100)
}

function allocateAviShares(
  items: readonly { charge: number; date: string; id: string }[],
  ownershipPct: number,
): number[] {
  if (items.length === 0) return []
  const totalCharge = roundEur(items.reduce((s, it) => s + it.charge, 0))
  const targetCents = eurToCents(totalCharge * ownershipPct / 100)
  const exact = items.map((it) => it.charge * ownershipPct / 100)
  const shareCents = exact.map((v) => eurToCents(v))
  let diffCents = targetCents - shareCents.reduce((s, c) => s + c, 0)
  if (diffCents === 0) return shareCents.map((c) => c / 100)

  const order = items.map((_, i) => i)
  const byDateId = (a: number, b: number) => {
    const byDate = items[a].date.localeCompare(items[b].date)
    if (byDate !== 0) return byDate
    return items[a].id.localeCompare(items[b].id)
  }
  if (diffCents < 0) {
    order.sort((a, b) => {
      const da = shareCents[a] / 100 - exact[a]
      const db = shareCents[b] / 100 - exact[b]
      if (db !== da) return db - da
      return byDateId(a, b)
    })
    for (let k = 0; k < -diffCents && k < order.length; k++) {
      shareCents[order[k]] -= 1
    }
  } else {
    order.sort((a, b) => {
      const da = exact[a] - shareCents[a] / 100
      const db = exact[b] - shareCents[b] / 100
      if (db !== da) return db - da
      return byDateId(a, b)
    })
    for (let k = 0; k < diffCents && k < order.length; k++) {
      shareCents[order[k]] += 1
    }
  }
  return shareCents.map((c) => c / 100)
}

export function classifyAviVisibleExpenseLayer(
  category: string | null,
  subcategory: string | null,
  amounts?: AviVisibleExpenseAmounts,
): AviVisibleExpenseLayer | null {
  const cat = (category ?? '').trim()
  const sub = (subcategory ?? '').trim()

  if (cat === 'Purchase' && sub === 'Purchase Expenses') return 'deal_expense'
  if (cat === 'Renovation') {
    if (sub === 'Client Payment') return null
    if (sub === 'Renovation Contract') return null
    return 'renovation'
  }
  if (cat === 'Airbnb') {
    if (sub === 'Platform Income') return null
    if (isAirbnbInternalPoolExecution(sub, amounts)) return null
    return 'airbnb'
  }
  if (cat === 'Management') {
    if (MANAGEMENT_NON_CHARGE_SUBCATEGORIES.has(sub)) return null
    return 'management'
  }
  return null
}

export function projectAviVisibleExpenses(
  internalRows: readonly ExternalPartnerInternalRow[],
  paymentIds: ReadonlySet<string>,
  aviOwnershipPct: number,
): AviReportPartnerExpense[] {
  if (aviOwnershipPct !== 50) return []
  const overlayRows = applyAviApprovedExpenseOverlay(internalRows)
  const staged: AviReportPartnerExpense[] = []
  for (const row of overlayRows) {
    if (paymentIds.has(row.id)) continue
    if (HIDDEN_PRESENTATION_IDS.has(row.id)) continue
    const layer = classifyAviVisibleExpenseLayer(row.category, row.subcategory, {
      amountEur: row.amountEur,
      clientCharge: row.clientCharge,
    })
    if (layer === null) continue
    const charge = partnerVisibleChargeEur(row)
    if (charge === null) continue
    staged.push({
      id: row.id,
      date: row.date,
      amountEur: charge,
      aviSharePct: 50,
      aviShareEur: null,
      category: row.category,
      subcategory: row.subcategory,
      layer,
    })
  }

  const byLayer: Record<AviVisibleExpenseLayer, AviReportPartnerExpense[]> = {
    renovation: [],
    airbnb: [],
    management: [],
    deal_expense: [],
  }
  for (let i = 0; i < staged.length; i++) {
    const row = staged[i]
    byLayer[row.layer].push(row)
  }

  const shareById = new Map<string, number>()
  const layerKeys: AviVisibleExpenseLayer[] = ['renovation', 'airbnb', 'management', 'deal_expense']
  for (let li = 0; li < layerKeys.length; li++) {
    const layer = layerKeys[li]
    const items = byLayer[layer]
    items.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.id.localeCompare(b.id)
    })
    if (items.length === 0) continue
    const shares = allocateAviShares(
      items.map((e) => ({ charge: e.amountEur ?? 0, date: e.date, id: e.id })),
      aviOwnershipPct,
    )
    if (shares.length !== items.length) {
      throw new Error(`avi_share_alloc_length:${layer}:${items.length}:${shares.length}`)
    }
    for (let i = 0; i < items.length; i++) {
      const share = shares[i]
      if (share === undefined) {
        throw new Error(`avi_share_alloc_missing:${layer}:${items[i].id}`)
      }
      shareById.set(items[i].id, share)
    }
  }

  const ordered: AviReportPartnerExpense[] = []
  for (let li = 0; li < layerKeys.length; li++) {
    const items = byLayer[layerKeys[li]]
    for (let i = 0; i < items.length; i++) {
      ordered.push(items[i])
    }
  }

  return ordered.map((e) => ({
    ...e,
    aviShareEur: shareById.get(e.id) ?? roundEur((e.amountEur ?? 0) * aviOwnershipPct / 100),
  }))
}

export function projectAviVisiblePayments(
  payments: readonly AviReportPartnerPayment[],
): AviReportPartnerPayment[] {
  return payments
    .map((p): AviReportPartnerPayment => ({
      id: p.id,
      date: p.date,
      amountEur: p.amountEur,
      label: 'Partner funding',
      payer: 'Avi',
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/**
 * Combine purchase-cost share + premium into one Avi-visible acquisition line.
 * Inputs come from the certified share; the two internal components are not
 * copied onto the returned object.
 */
export function projectAviVisibleAcquisition(
  aviShare: ExternalPartnerShare,
): AviReportAcquisitionPresentation | { status: 'failed'; reason: string } {
  if (aviShare.ownershipPct !== 50) {
    return { status: 'failed', reason: 'acquisition_ownership_not_50' }
  }
  const purchaseCostShare = aviShare.obligation.chargeShares['purchase_cost']
  if (purchaseCostShare === undefined || !Number.isFinite(purchaseCostShare)) {
    return { status: 'failed', reason: 'acquisition_purchase_cost_share_missing' }
  }
  const premiumEur = aviShare.obligation.premiumEur
  if (!Number.isFinite(premiumEur)) {
    return { status: 'failed', reason: 'acquisition_premium_component_missing' }
  }
  const aviObligationEur = roundEur(purchaseCostShare + premiumEur)
  const agreedTransactionValueEur = roundEur(aviObligationEur * (100 / aviShare.ownershipPct))
  if (!Number.isFinite(aviShare.paidEur)) {
    return { status: 'failed', reason: 'acquisition_paid_missing' }
  }
  const remainingEur = roundEur(Math.max(0, aviObligationEur - aviShare.paidEur))
  return {
    agreedTransactionValueEur,
    aviOwnershipPct: 50,
    aviObligationEur,
    remainingEur,
    presentationLine:
      `Acquisition of 50% interest — agreed value ${formatAviEur(agreedTransactionValueEur)} — Avi share ${formatAviEur(aviObligationEur)}`,
  }
}

function semanticFromBalance(balance: number | null): string | null {
  if (balance === null) return null
  if (Math.abs(balance) < 0.005) return 'Settled'
  if (balance < 0) return formatAviOwes(balance)
  return formatAviIsOwed(balance)
}

function billedLayer(
  key: 'renovation' | 'airbnb' | 'management',
  label: string,
  totalChargeEur: number | null,
  line: ExternalPartnerActivityLine | undefined,
): AviReportLayerBreakdown {
  const funding = line?.funding ?? null
  const showFunding = funding !== null && funding !== 0
  return {
    key,
    label,
    totalChargeEur,
    aviShareEur: line?.chargeShareGross ?? null,
    aviFundingEur: showFunding ? funding : null,
    semanticNet: semanticFromBalance(line?.balance ?? null),
  }
}

/**
 * Certified visible-expense totals from already-projected layer DTO fields
 * and the partner-visible expense list. Does not recompute 50% shares.
 */
export function projectAviVisibleExpenseTotals(
  layers: readonly AviReportLayerBreakdown[],
  expenses: readonly AviReportPartnerExpense[],
): { rowCount: number; totalChargeEur: number; aviShareEur: number } | { status: 'failed'; reason: string } {
  const operating = layers.filter((l) => l.key !== 'acquisition')
  if (operating.length === 0) {
    return { status: 'failed', reason: 'visible_expense_layers_missing' }
  }
  let charge = 0
  let share = 0
  for (let i = 0; i < operating.length; i++) {
    const layer = operating[i]
    if (layer.totalChargeEur == null || layer.aviShareEur == null) {
      return { status: 'failed', reason: `visible_expense_layer_incomplete:${layer.key}` }
    }
    charge += layer.totalChargeEur
    share += layer.aviShareEur
  }
  return {
    rowCount: expenses.length,
    totalChargeEur: roundEur(charge),
    aviShareEur: roundEur(share),
  }
}

export function projectAviVisibleLayers(
  acquisition: AviReportAcquisitionPresentation,
  renovation: { clientCharge: number | null; lines: readonly ExternalPartnerActivityLine[] },
  airbnb: { clientCharge: number | null; lines: readonly ExternalPartnerActivityLine[] },
  management: { clientCharge: number | null; lines: readonly ExternalPartnerActivityLine[] },
  dealExpense: {
    totalDealExpenses: number | null
    lines: readonly ExternalPartnerDealExpenseLine[]
  },
): AviReportLayerBreakdown[] {
  const renoLine = renovation.lines.find((l) => l.partner === 'Avi')
  const airbnbLine = airbnb.lines.find((l) => l.partner === 'Avi')
  const mgmtLine = management.lines.find((l) => l.partner === 'Avi')
  const dealLine = dealExpense.lines.find((l) => l.partner === 'Avi')
  const dealFunding = dealLine?.paidTowardExpenses ?? 0
  return [
    {
      key: 'acquisition',
      label: 'Acquisition',
      totalChargeEur: acquisition.agreedTransactionValueEur,
      aviShareEur: acquisition.aviObligationEur,
      aviFundingEur: null,
      semanticNet: null,
    },
    {
      key: 'deal_expense',
      label: 'Acquisition / Deal expenses',
      totalChargeEur: dealExpense.totalDealExpenses,
      aviShareEur: dealLine?.expenseObligation ?? null,
      aviFundingEur: dealFunding !== 0 ? dealFunding : null,
      semanticNet: semanticFromBalance(dealLine?.balance ?? null),
    },
    billedLayer('renovation', 'Renovation', renovation.clientCharge, renoLine),
    billedLayer('airbnb', 'Airbnb', airbnb.clientCharge, airbnbLine),
    billedLayer('management', 'Management', management.clientCharge, mgmtLine),
  ]
}

const EXPENSE_DEPARTMENT_ORDER: readonly AviVisibleExpenseLayer[] = [
  'deal_expense',
  'renovation',
  'airbnb',
  'management',
]

/**
 * Certified layer totals with no detail rows. Pure. Does not invent expenses.
 */
export function projectAviExpenseCompleteness(
  layers: readonly AviReportLayerBreakdown[],
  expenses: readonly AviReportPartnerExpense[],
): AviReportExpenseCompleteness {
  const present = new Set(expenses.map((e) => e.layer))
  const departmentsMissingDetailRows: AviVisibleExpenseLayer[] = []
  for (let i = 0; i < EXPENSE_DEPARTMENT_ORDER.length; i++) {
    const key = EXPENSE_DEPARTMENT_ORDER[i]
    const layer = layers.find((l) => l.key === key)
    if (!layer || layer.totalChargeEur == null || layer.totalChargeEur === 0) continue
    if (!present.has(key)) departmentsMissingDetailRows.push(key)
  }
  return {
    complete: departmentsMissingDetailRows.length === 0,
    departmentsMissingDetailRows,
  }
}
