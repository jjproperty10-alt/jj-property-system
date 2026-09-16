/**
 * @module partner-settlement/external-partner/externalPartnerAviConfig
 * @description Approved production configuration for the Avi (Villa Mazotos)
 * external-partner settlement.
 *
 * Certified Avi partner-report amounts after Yossi’s 2026-09-08 decisions:
 * Hostaway credit is the union of both printed owner statements; purchase
 * expenses are €11,900 after removing a duplicated €2,400 purchase-tax row;
 * the Airbnb charge is the sum of the certified Setup and Operations lines;
 * approved balance is Avi is owed €594.25. The 202-row classification hash is
 * unchanged. No Production ledger writes.
 *
 * Not imported by Partner B, RC3, lifecycle, or PDF.
 * Server-only: never shipped to the browser bundle.
 */

import 'server-only'
import type { ExternalPartnerOwner, ExternalPartnerChargeLayer } from './types'
import type { ComposeAviReportInput } from './externalPartnerAviService'
import type { ExternalPartnerControlInput } from './controlReconciliation'
import {
  AVI_AIRBNB_INCOME_TOTAL_EUR,
  AVI_TOTAL_INCOME_CREDIT_EUR,
} from './hostawayPrintedNto'
import { AVI_AIRBNB_CHARGE_TOTAL_EUR } from './aviAirbnbDepartments'

export const AVI_VM1_OWNERS: readonly ExternalPartnerOwner[] = Object.freeze([
  { partner: 'Avi', ownershipPct: 50, isJjPrincipal: false },
  { partner: 'Yossi', ownershipPct: 25, isJjPrincipal: true },
  { partner: 'Jacob', ownershipPct: 25, isJjPrincipal: true },
])

const VM1_AMOUNTS = {
  purchaseContract: 400_000,
  purchaseExpenses: 11_900,
  renovation: 72_214.14,
  /** Setup + Operations are pass-through cost; JJ takes no Airbnb margin. */
  airbnbCost: AVI_AIRBNB_CHARGE_TOTAL_EUR,
  jjAirbnbProfit: 0,
  airbnbCharge: AVI_AIRBNB_CHARGE_TOTAL_EUR,
  platformIncomeTotal: AVI_AIRBNB_INCOME_TOTAL_EUR,
  platformCreditAvi: AVI_TOTAL_INCOME_CREDIT_EUR,
  management: 0,
  aviPremium: 50_000,
  aviRenoFinancing: 25_000,
  aviToJacob: 5_600,
} as const

export const AVI_VM1_CHARGES: readonly ExternalPartnerChargeLayer[] = Object.freeze([
  { key: 'purchase_cost', label: 'Purchase cost', total: VM1_AMOUNTS.purchaseContract },
  { key: 'deal_expenses', label: 'Deal expenses', total: VM1_AMOUNTS.purchaseExpenses },
  { key: 'renovation', label: 'Renovation', total: VM1_AMOUNTS.renovation, jjProfit: 0 },
  {
    key: 'airbnb',
    label: 'Airbnb',
    total: VM1_AMOUNTS.airbnbCharge,
    jjProfit: VM1_AMOUNTS.jjAirbnbProfit,
    income: VM1_AMOUNTS.platformIncomeTotal,
  },
  { key: 'management', label: 'Management', total: VM1_AMOUNTS.management, jjProfit: 0 },
])

export const AVI_VM1_PREMIUM = Object.freeze({
  totalEur: VM1_AMOUNTS.aviPremium,
  paidBy: 'Avi' as const,
  receivedBy: { Yossi: VM1_AMOUNTS.aviPremium },
})

export const AVI_VM1_REQUIRED_CONTROLS: Readonly<Record<string, number>> = Object.freeze({
  purchase_cost: VM1_AMOUNTS.purchaseContract,
  deal_expenses: VM1_AMOUNTS.purchaseExpenses,
  renovation: VM1_AMOUNTS.renovation,
  airbnb: VM1_AMOUNTS.airbnbCharge,
  management: VM1_AMOUNTS.management,
  premium: VM1_AMOUNTS.aviPremium,
})

export const AVI_VM1_LAYER_INPUTS: ComposeAviReportInput['layerInputs'] = Object.freeze({
  renovation: {
    clientCharge: VM1_AMOUNTS.renovation,
    actualCost: VM1_AMOUNTS.renovation,
    jjProfit: 0,
    aviFunding: VM1_AMOUNTS.aviRenoFinancing,
  },
  airbnb: {
    clientCharge: VM1_AMOUNTS.airbnbCharge,
    actualCost: VM1_AMOUNTS.airbnbCost,
    jjProfit: VM1_AMOUNTS.jjAirbnbProfit,
    aviCredit: VM1_AMOUNTS.platformCreditAvi,
  },
  management: {
    clientCharge: VM1_AMOUNTS.management,
    actualCost: VM1_AMOUNTS.management,
    jjProfit: 0,
  },
  dealExpense: {
    total: VM1_AMOUNTS.purchaseExpenses,
    aviPayment: VM1_AMOUNTS.aviToJacob,
    jacobConduit: VM1_AMOUNTS.aviToJacob,
  },
})

/** Transaction IDs that the attribution overlay reclassifies from Client → AVI. */
export const AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS = Object.freeze([
  { id: 'b71e4098-39fb-4562-a0b4-1d8db9fbdfd1', amountEur: VM1_AMOUNTS.aviToJacob },
  { id: 'c51df847-5275-47b2-b104-1a57aea0c293', amountEur: 5_000 },
  { id: '3afd3b3f-b6de-4e6e-8476-2b07bbd09ea7', amountEur: 20_000 },
])

/**
 * Avi's two renovation funding payments. Only the identity is configured; the
 * dates and amounts shown to Avi are read from the ledger rows themselves.
 */
export const AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS: readonly string[] = Object.freeze([
  'c51df847-5275-47b2-b104-1a57aea0c293',
  '3afd3b3f-b6de-4e6e-8476-2b07bbd09ea7',
])

/** IDs that must be present exactly once in the scope binding. */
export const AVI_VM1_MUST_INCLUDE_ONCE = Object.freeze([
  'f807dbf2-5d87-415f-9d57-842ddae0ad1a',
])

/** IDs that must be absent from the scope binding. */
export const AVI_VM1_MUST_EXCLUDE = Object.freeze([
  'ca1448db-27a6-41c8-b3bf-424f52969d88',
])

/**
 * Purchase-expense rows for control input.
 *
 * Yossi 2026-09-08: the purchase tax was paid once, €2,400. The ledger carries
 * both the single €2,400 row and the two legs (€1,000 + €1,400) that make it
 * up, so one of the two records is a duplicate. The two legs are kept because
 * they preserve which principal funded which part; the aggregate €2,400 row is
 * dropped from the report. Presentation only — no ledger row is flagged,
 * edited or deleted.
 */
export const AVI_VM1_PURCHASE_EXPENSE_ROWS = Object.freeze([
  { id: 'a8305608-a424-49ac-8194-feb5e84b00b6', amountEur: 750 },
  { id: '9363b7c1-c536-4e35-b3ed-98bff7c3db40', amountEur: 1400 },
  { id: 'c2a9dff0-83f4-441b-96ca-01cb272993ff', amountEur: 1000 },
  { id: 'dd58af71-1765-438e-936c-a77fbffa2448', amountEur: 2000 },
  { id: '52996647-a802-42ca-9964-677a58ef4c06', amountEur: 6750 },
])

/** The duplicated aggregate purchase-tax row removed from the report. */
export const AVI_VM1_DUPLICATE_PURCHASE_EXPENSE = Object.freeze({
  id: '38e137db-b89d-492f-9bd8-7ffa37066e9f',
  amountEur: 2400,
  reason: 'duplicate_of_purchase_tax_legs',
})

export const AVI_VM1_REQUIRED_PURCHASE_EXPENSE_PAYMENTS = Object.freeze([
  { id: '9363b7c1-c536-4e35-b3ed-98bff7c3db40', amountEur: 1400 },
  { id: 'c2a9dff0-83f4-441b-96ca-01cb272993ff', amountEur: 1000 },
])

export function buildAviVm1ControlInput(
  evidence: ComposeAviReportInput['evidence'],
  presentIds: string[],
): ExternalPartnerControlInput {
  return {
    evidence,
    expectedEvidence: evidence,
    purchaseExpenseRows: [...AVI_VM1_PURCHASE_EXPENSE_ROWS],
    requiredPurchaseExpensePayments: [...AVI_VM1_REQUIRED_PURCHASE_EXPENSE_PAYMENTS],
    purchaseExpensesAuthoritativeEur: VM1_AMOUNTS.purchaseExpenses,
    renovationTotalEur: VM1_AMOUNTS.renovation,
    renovationAuthoritativeEur: VM1_AMOUNTS.renovation,
    presentIds,
    mustIncludeOnce: [...AVI_VM1_MUST_INCLUDE_ONCE],
    mustExclude: [...AVI_VM1_MUST_EXCLUDE],
  }
}
