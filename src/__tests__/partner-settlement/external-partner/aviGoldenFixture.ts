/**
 * Test-only Avi (Villa Mazotos) fixture + provenance.
 * Not imported by production routes, adapters, or Partner B.
 *
 * `LEGACY_PRE_HOSTAWAY_BASELINE` (alias `AMOUNTS`) is the historical formula
 * snapshot: paid 280600 + credits 680 − obligation 300180.84 = −18900.84.
 * It must not produce a Certified Avi report DTO, screen, or print.
 *
 * Canonical classification (202 rows) is referenced by hash/version only.
 * This file does not embed those 202 rows.
 */
import type {
  ExternalPartnerControlInput,
  ExternalPartnerEvidence,
  ExternalPartnerOwner,
  ExternalPartnerSettlementInput,
  ProvenanceStatus,
} from '@/lib/partner-settlement/external-partner'

export interface ControlAmountProvenance {
  readonly id: string
  readonly businessMeaning: string
  readonly approvedAmountEur: number
  readonly sourceType: string
  readonly transactionIds: readonly string[]
  readonly calculationFormula: string
  readonly inclusionExclusionRule: string
  readonly approvalDate: string
  readonly status: ProvenanceStatus
  readonly canonicalClassification?: ExternalPartnerEvidence
}

/** Canonical 202-row classification artifact (handoff bundle). Do not embed the rows. */
export const VM1_CANONICAL_CLASSIFICATION: ExternalPartnerEvidence = {
  classificationArtifact:
    'docs/handoffs/JJ_CLAUDE_UNPUSHED_HANDOFF_2026-09-02/03_handoff_bundle/VM1_transaction_classification.csv',
  sha256: '0477bfc5f2285425d55af6793f9d09bf829ee62387fb5b2a42bc0958478baf97',
  rowCount: 202,
  version: 'vm1-classification-202-v1',
}

export const AVI_OWNERS: readonly ExternalPartnerOwner[] = [
  { partner: 'Avi', ownershipPct: 50, isJjPrincipal: false },
  { partner: 'Yossi', ownershipPct: 25, isJjPrincipal: true },
  { partner: 'Jacob', ownershipPct: 25, isJjPrincipal: true },
]

export const TX = {
  purchaseContract: '33b1e18c-7ca1-487b-b6fa-2e862461eea0',
  purchaseExpYossi750: 'a8305608-a424-49ac-8194-feb5e84b00b6',
  purchaseExpAnastasia2400: '38e137db-b89d-492f-9bd8-7ffa37066e9f',
  purchaseExpJacob1400: '9363b7c1-c536-4e35-b3ed-98bff7c3db40',
  purchaseExpYossi1000: 'c2a9dff0-83f4-441b-96ca-01cb272993ff',
  purchaseExpJacob2000: 'dd58af71-1765-438e-936c-a77fbffa2448',
  purchaseExpJacob6750: '52996647-a802-42ca-9964-677a58ef4c06',
  aviPurchaseFunding: '1cc117ba-94c7-463b-8e72-f9d021613ac5',
  aviPremium: '372cf021-f659-480a-8647-98a84e718d67',
  aviToJacob: 'b71e4098-39fb-4562-a0b4-1d8db9fbdfd1',
  aviReno5000: 'c51df847-5275-47b2-b104-1a57aea0c293',
  aviReno20000: '3afd3b3f-b6de-4e6e-8476-2b07bbd09ea7',
  germanWorkerOnce: 'f807dbf2-5d87-415f-9d57-842ddae0ad1a',
  germanWorkerDeletedDuplicate: 'ca1448db-27a6-41c8-b3bf-424f52969d88',
  airbnbMarkup200: '4c40f610-c173-4027-b513-cffe12fcd288',
  airbnbMarkup70: 'eb6b2423-1689-4a22-8696-42933999682c',
  platformYossi960: 'cc0ab3a1-33c2-41d3-8e12-82c3e5cdb7e2',
  platformAnastasia400: '01a920d1-016d-4e3d-b6c0-b0be13fb5105',
  mgmtPool480: '00e84a59-7972-428b-bc54-7b3407c16754',
  mgmtInternet30: '049dc8af-ea5a-4a0a-9e40-f85693866f85',
  mgmtElectricity181: '71d5f307-af4e-4194-83b3-7e9413dd4028',
} as const

export const PURCHASE_EXPENSE_ROWS = [
  { id: TX.purchaseExpYossi750, amountEur: 750 },
  { id: TX.purchaseExpAnastasia2400, amountEur: 2400 },
  { id: TX.purchaseExpJacob1400, amountEur: 1400 },
  { id: TX.purchaseExpYossi1000, amountEur: 1000 },
  { id: TX.purchaseExpJacob2000, amountEur: 2000 },
  { id: TX.purchaseExpJacob6750, amountEur: 6750 },
] as const

export const REQUIRED_PURCHASE_EXPENSE_PAYMENTS = [
  { id: TX.purchaseExpJacob1400, amountEur: 1400 },
  { id: TX.purchaseExpYossi1000, amountEur: 1000 },
  { id: TX.purchaseExpAnastasia2400, amountEur: 2400 },
] as const

/** Historical formula snapshot from before printed Hostaway NTO. Not a certified Avi report. */
export const LEGACY_PRE_HOSTAWAY_BASELINE = {
  purchaseContract: 400000,
  purchaseExpenses: 14300,
  renovation: 72214.14,
  airbnbCost: 12641.74,
  jjAirbnbProfit: 514,
  jjAirbnbMarkup: 270,
  jjAirbnbPoolNet: 244,
  airbnbCharge: 13155.74,
  platformIncomeTotal: 1360,
  platformCreditAvi: 680,
  management: 691.79,
  dealExpenseNetAvi: 1550,
  aviPurchaseFunding: 200000,
  aviToJacob: 5600,
  aviPremium: 50000,
  aviReno5000: 5000,
  aviReno20000: 20000,
  aviRenoFinancing: 25000,
  aviPaidTotal: 280600,
  aviCredits: 680,
  aviObligation: 300180.84,
  aviNet: -18900.84,
  renoComponent: -11107.07,
  airbnbComponent: -5897.87,
  managementComponent: -345.9,
  dealExpenseComponent: -1550,
  germanWorker: 650,
} as const

/** @deprecated Use LEGACY_PRE_HOSTAWAY_BASELINE. Alias for historical formula tests. */
export const AMOUNTS = LEGACY_PRE_HOSTAWAY_BASELINE

export const CONTROL_PROVENANCE: readonly ControlAmountProvenance[] = [
  {
    id: 'purchase_contract',
    businessMeaning: 'Villa Mazotos purchase contract price charged to owners by ownership %.',
    approvedAmountEur: AMOUNTS.purchaseContract,
    sourceType: 'self_artifact_contract_row',
    transactionIds: [TX.purchaseContract],
    calculationFormula: 'contract amount_eur = 400000 (not a cash movement; Owner→Owner 200000 mirror excluded)',
    inclusionExclusionRule: 'Include the Purchase Contract self-artifact. Exclude the Owner→Owner 200000 mirror.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
    canonicalClassification: VM1_CANONICAL_CLASSIFICATION,
  },
  {
    id: 'purchase_expenses',
    businessMeaning: 'Pass-through purchase/deal expenses split by ownership %.',
    approvedAmountEur: AMOUNTS.purchaseExpenses,
    sourceType: 'classified_property_expense_rows',
    transactionIds: PURCHASE_EXPENSE_ROWS.map((r) => r.id),
    calculationFormula: '750 + 2400 + 1400 + 1000 + 2000 + 6750 = 14300',
    inclusionExclusionRule:
      'Include all six Purchase Expenses property_expense rows in the 202-row active set. Do not drop the Jacob 1400 or Yossi 1000 rows. Do not add Avi 5600 conduit (that is funding, not an expense).',
    approvalDate: '2026-09-03',
    status: 'DECISION_BACKED',
    canonicalClassification: VM1_CANONICAL_CLASSIFICATION,
  },
  {
    id: 'purchase_expense_jacob_1400',
    businessMeaning: 'Jacob payment to Yanis toward purchase expenses. Payer field wins.',
    approvedAmountEur: 1400,
    sourceType: 'transaction',
    transactionIds: [TX.purchaseExpJacob1400],
    calculationFormula: 'amount_eur = 1400',
    inclusionExclusionRule: 'INCLUDED as its own payment. Not a duplicate of Anastasia 2400. Not replaced by notes.',
    approvalDate: '2026-09-03',
    status: 'DECISION_BACKED',
  },
  {
    id: 'purchase_expense_yossi_1000',
    businessMeaning: 'Yossi payment to company toward purchase expenses. Payer field wins.',
    approvedAmountEur: 1000,
    sourceType: 'transaction',
    transactionIds: [TX.purchaseExpYossi1000],
    calculationFormula: 'amount_eur = 1000',
    inclusionExclusionRule: 'INCLUDED as its own payment. Not a duplicate of Anastasia 2400. Not replaced by notes.',
    approvalDate: '2026-09-03',
    status: 'DECISION_BACKED',
  },
  {
    id: 'purchase_expense_anastasia_2400',
    businessMeaning: 'Anastasia purchase-tax payment via Daniela to company.',
    approvedAmountEur: 2400,
    sourceType: 'transaction',
    transactionIds: [TX.purchaseExpAnastasia2400],
    calculationFormula: 'amount_eur = 2400',
    inclusionExclusionRule: 'INCLUDED. Active purchase-expense row. Separate from Jacob 1400 and Yossi 1000.',
    approvalDate: '2026-09-03',
    status: 'DECISION_BACKED',
  },
  {
    id: 'renovation',
    businessMeaning: 'Renovation execution cost billed to owners at cost (no JJ profit).',
    approvedAmountEur: AMOUNTS.renovation,
    sourceType: 'classified_execution_cost_total',
    transactionIds: [TX.germanWorkerOnce],
    calculationFormula:
      'Sum of Renovation property_expense rows in the 202-row artifact = 72214.14. Sentinel German-worker row f807dbf2 = 650 is inside that total.',
    inclusionExclusionRule:
      'Include active f807dbf2 exactly once. Exclude deleted duplicate ca1448db. Do not add 650 again.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
    canonicalClassification: VM1_CANONICAL_CLASSIFICATION,
  },
  {
    id: 'german_worker_included_once',
    businessMeaning: 'German worker 16/01/2025 payment — one real row.',
    approvedAmountEur: AMOUNTS.germanWorker,
    sourceType: 'transaction',
    transactionIds: [TX.germanWorkerOnce],
    calculationFormula: 'amount_eur = 650 counted inside renovation 72214.14',
    inclusionExclusionRule: 'INCLUDED exactly once (active f807dbf2).',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
  },
  {
    id: 'german_worker_deleted_duplicate',
    businessMeaning: 'Deleted duplicate of the German worker payment. Not a second cost.',
    approvedAmountEur: AMOUNTS.germanWorker,
    sourceType: 'deleted_transaction_excluded',
    transactionIds: [TX.germanWorkerDeletedDuplicate],
    calculationFormula: 'not added; restoring it would raise renovation by 650 and Avi net by 325',
    inclusionExclusionRule: 'EXCLUDED (is_deleted duplicate ca1448db). Absent from the 202-row active artifact.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
  },
  {
    id: 'avi_renovation_financing_5000',
    businessMeaning: 'Avi renovation funding routed via Jacob.',
    approvedAmountEur: AMOUNTS.aviReno5000,
    sourceType: 'partner_funding',
    transactionIds: [TX.aviReno5000],
    calculationFormula: 'amount_eur = 5000 attributed to Avi (conduit through Jacob)',
    inclusionExclusionRule: 'INCLUDED as Avi paid/funding. Jacob is conduit, not the investor.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
  },
  {
    id: 'avi_renovation_financing_20000',
    businessMeaning: 'Avi renovation funding routed via JJ.',
    approvedAmountEur: AMOUNTS.aviReno20000,
    sourceType: 'partner_funding',
    transactionIds: [TX.aviReno20000],
    calculationFormula: 'amount_eur = 20000 attributed to Avi',
    inclusionExclusionRule: 'INCLUDED as Avi paid/funding.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
  },
  {
    id: 'avi_purchase_funding',
    businessMeaning: 'Avi payment to seller toward the 400000 purchase contract.',
    approvedAmountEur: AMOUNTS.aviPurchaseFunding,
    sourceType: 'partner_funding',
    transactionIds: [TX.aviPurchaseFunding],
    calculationFormula: 'amount_eur = 200000',
    inclusionExclusionRule: 'INCLUDED as Avi paid. Nets against Avi 50% of the 400000 contract.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
  },
  {
    id: 'avi_payment_to_jacob',
    businessMeaning: 'Avi conduit payment to Jacob toward deal expenses (not entry capital).',
    approvedAmountEur: AMOUNTS.aviToJacob,
    sourceType: 'partner_funding',
    transactionIds: [TX.aviToJacob],
    calculationFormula: 'amount_eur = 5600 reduces Avi deal-expense balance once',
    inclusionExclusionRule:
      'INCLUDED as Avi payment toward expenses. Jacob conduit receipt is audit-only and is not Avi income.',
    approvalDate: '2026-08-28',
    status: 'APPROVED',
  },
  {
    id: 'avi_premium_payment',
    businessMeaning: 'Avi entry premium paid to Yossi. External payer obligation.',
    approvedAmountEur: AMOUNTS.aviPremium,
    sourceType: 'partner_funding',
    transactionIds: [TX.aviPremium],
    calculationFormula: 'premium 50000 added to Avi obligation; Avi also paid 50000 so the premium layer nets to 0 for Avi',
    inclusionExclusionRule: 'INCLUDED. JJ principal internal 25000 offset is Yossi/Jacob only, not Avi.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
  },
  {
    id: 'airbnb_cost',
    businessMeaning: 'Airbnb actual execution cost on the property.',
    approvedAmountEur: AMOUNTS.airbnbCost,
    sourceType: 'classified_execution_cost_total',
    transactionIds: [TX.airbnbMarkup200, TX.airbnbMarkup70],
    calculationFormula:
      'Sum of Airbnb property_expense amount_eur in the 202-row artifact = 12641.74 (74 rows; full list is the artifact, not duplicated here).',
    inclusionExclusionRule: 'Include Airbnb property_expense rows. Do not add client_charge on top of amount_eur.',
    approvalDate: '2026-09-02',
    status: 'VERIFIED',
    canonicalClassification: VM1_CANONICAL_CLASSIFICATION,
  },
  {
    id: 'jj_airbnb_profit',
    businessMeaning: 'JJ Airbnb service profit. Credits JJ principals only. Avi receives none.',
    approvedAmountEur: AMOUNTS.jjAirbnbProfit,
    sourceType: 'approved_service_profit',
    transactionIds: [TX.airbnbMarkup200, TX.airbnbMarkup70],
    calculationFormula: 'markup 270 + pool net 244 = 514',
    inclusionExclusionRule: 'Included in the Airbnb client charge. Not credited to Avi. Not a missing cash row.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
  },
  {
    id: 'jj_airbnb_markup',
    businessMeaning: 'Utility/other markup inside the 514 JJ profit.',
    approvedAmountEur: AMOUNTS.jjAirbnbMarkup,
    sourceType: 'client_charge_minus_cost',
    transactionIds: [TX.airbnbMarkup200, TX.airbnbMarkup70],
    calculationFormula: '(450 − 250) + (320 − 250) = 200 + 70 = 270',
    inclusionExclusionRule: 'client_charge replaces amount_eur on those two rows; do not add both.',
    approvalDate: '2026-09-02',
    status: 'VERIFIED',
  },
  {
    id: 'jj_airbnb_pool_net',
    businessMeaning: 'Pool-service net inside the 514 JJ profit.',
    approvedAmountEur: AMOUNTS.jjAirbnbPoolNet,
    sourceType: 'billing_minus_cost',
    transactionIds: [],
    calculationFormula:
      '11 billing_only pool invoices × 120 = 1320 billed; pool execution cost excluding the markup row 4c40f610 = 1076; 1320 − 1076 = 244. Itemised billing rows live in the 202-row artifact.',
    inclusionExclusionRule: 'Billing-only client_charge is the charge basis (amount_eur is 0). Do not add amount_eur + client_charge.',
    approvalDate: '2026-09-02',
    status: 'VERIFIED',
    canonicalClassification: VM1_CANONICAL_CLASSIFICATION,
  },
  {
    id: 'airbnb_property_charge',
    businessMeaning: 'Airbnb amount billed to owners (cost plus JJ profit).',
    approvedAmountEur: AMOUNTS.airbnbCharge,
    sourceType: 'charge_layer',
    transactionIds: [TX.airbnbMarkup200, TX.airbnbMarkup70],
    calculationFormula: '12641.74 + 514 = 13155.74',
    inclusionExclusionRule: 'Charge is cost + profit, not cost + client_charge stacked on the same row.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
  },
  {
    id: 'platform_credit_avi',
    businessMeaning: 'Avi ownership share of platform income (credits, not JJ profit).',
    approvedAmountEur: AMOUNTS.platformCreditAvi,
    sourceType: 'platform_income_ownership_share',
    transactionIds: [TX.platformYossi960, TX.platformAnastasia400],
    calculationFormula: '50% × (960 + 400) = 50% × 1360 = 680',
    inclusionExclusionRule: 'Credit Avi by ownership % of platform income. Who held the cash does not change the credit.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
  },
  {
    id: 'management',
    businessMeaning: 'Management costs billed to owners at cost.',
    approvedAmountEur: AMOUNTS.management,
    sourceType: 'classified_execution_cost_total',
    transactionIds: [TX.mgmtPool480, TX.mgmtInternet30, TX.mgmtElectricity181],
    calculationFormula: '480 + 30 + 181.79 = 691.79',
    inclusionExclusionRule: 'Include the three Management property_expense rows. No JJ profit.',
    approvalDate: '2026-09-02',
    status: 'VERIFIED',
  },
  {
    id: 'deal_expense_net_avi',
    businessMeaning: 'Avi net on deal expenses after his 5600 payment.',
    approvedAmountEur: AMOUNTS.dealExpenseNetAvi,
    sourceType: 'derived_layer_balance',
    transactionIds: [TX.aviToJacob, ...PURCHASE_EXPENSE_ROWS.map((r) => r.id)],
    calculationFormula: '50% × 14300 − 5600 = 7150 − 5600 = 1550 owed (layer balance −1550)',
    inclusionExclusionRule: 'Payment reduces Avi only. Does not shrink the 14300 expense pool.',
    approvalDate: '2026-08-28',
    status: 'APPROVED',
  },
  {
    id: 'avi_paid_total',
    businessMeaning: 'Verified Avi outlays credited in the settlement.',
    approvedAmountEur: AMOUNTS.aviPaidTotal,
    sourceType: 'sum_of_verified_funding',
    transactionIds: [TX.aviPurchaseFunding, TX.aviPremium, TX.aviToJacob, TX.aviReno5000, TX.aviReno20000],
    calculationFormula: '200000 + 50000 + 5600 + 5000 + 20000 = 280600',
    inclusionExclusionRule: 'Cost-covering Avi outlays only. Conduit receipts to Jacob are not Avi credits.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
  },
  {
    id: 'avi_credits',
    businessMeaning: 'Avi credits from platform income share. No JJ profit.',
    approvedAmountEur: AMOUNTS.aviCredits,
    sourceType: 'derived_credit',
    transactionIds: [TX.platformYossi960, TX.platformAnastasia400],
    calculationFormula: 'income share 680 + jjProfit share 0 = 680',
    inclusionExclusionRule: 'Avi is not a JJ principal, so 514 is excluded from his credits.',
    approvalDate: '2026-08-29',
    status: 'APPROVED',
  },
  {
    id: 'avi_obligation',
    businessMeaning: 'Avi total obligation: ownership share of charge layers plus premium.',
    approvedAmountEur: AMOUNTS.aviObligation,
    sourceType: 'derived_obligation',
    transactionIds: [TX.purchaseContract, TX.aviPremium],
    calculationFormula:
      '50%×(400000 + 14300 + 72214.14 + 13155.74 + 691.79) + 50000 = 250180.84 + 50000 = 300180.84',
    inclusionExclusionRule: 'Premium is added only for the external payer (Avi). Residual-corrected allocation; Avi is not the last owner.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
    canonicalClassification: VM1_CANONICAL_CLASSIFICATION,
  },
  {
    id: 'avi_final_net',
    businessMeaning: 'Certified Avi external-partner net (to pay).',
    approvedAmountEur: AMOUNTS.aviNet,
    sourceType: 'derived_settlement',
    transactionIds: [TX.aviPurchaseFunding, TX.aviPremium, TX.aviToJacob, TX.aviReno5000, TX.aviReno20000],
    calculationFormula: 'paid 280600 + credits 680 − obligation 300180.84 = −18900.84',
    inclusionExclusionRule: 'Print-final for Avi only. Yossi/Jacob lines are not certified here.',
    approvalDate: '2026-09-02',
    status: 'APPROVED',
  },
]

export const REQUIRED_CONTROLS: Readonly<Record<string, number>> = {
  purchase_cost: AMOUNTS.purchaseContract,
  deal_expenses: AMOUNTS.purchaseExpenses,
  renovation: AMOUNTS.renovation,
  airbnb: AMOUNTS.airbnbCharge,
  management: AMOUNTS.management,
  premium: AMOUNTS.aviPremium,
}

export function aviGoldenPresentIds(): string[] {
  return [
    TX.germanWorkerOnce,
    ...PURCHASE_EXPENSE_ROWS.map((r) => r.id),
    TX.aviPurchaseFunding,
    TX.aviPremium,
    TX.aviToJacob,
    TX.aviReno5000,
    TX.aviReno20000,
  ]
}

export function aviGoldenControlInput(
  overrides: Partial<ExternalPartnerControlInput> = {},
): ExternalPartnerControlInput {
  return {
    evidence: VM1_CANONICAL_CLASSIFICATION,
    expectedEvidence: VM1_CANONICAL_CLASSIFICATION,
    purchaseExpenseRows: [...PURCHASE_EXPENSE_ROWS],
    requiredPurchaseExpensePayments: [...REQUIRED_PURCHASE_EXPENSE_PAYMENTS],
    purchaseExpensesAuthoritativeEur: AMOUNTS.purchaseExpenses,
    renovationTotalEur: AMOUNTS.renovation,
    renovationAuthoritativeEur: AMOUNTS.renovation,
    presentIds: aviGoldenPresentIds(),
    mustIncludeOnce: [TX.germanWorkerOnce],
    mustExclude: [TX.germanWorkerDeletedDuplicate],
    ...overrides,
  }
}

export function aviComposeInput(
  overrides: Partial<ExternalPartnerSettlementInput> = {},
): ExternalPartnerSettlementInput {
  return {
    property: 'Villa Mazotos',
    cutoffDate: '2026-08-29',
    owners: AVI_OWNERS,
    charges: [
      { key: 'purchase_cost', label: 'Purchase cost', total: AMOUNTS.purchaseContract },
      { key: 'deal_expenses', label: 'Deal expenses', total: AMOUNTS.purchaseExpenses },
      { key: 'renovation', label: 'Renovation', total: AMOUNTS.renovation, jjProfit: 0 },
      {
        key: 'airbnb',
        label: 'Airbnb',
        total: AMOUNTS.airbnbCharge,
        jjProfit: AMOUNTS.jjAirbnbProfit,
        income: AMOUNTS.platformIncomeTotal,
      },
      { key: 'management', label: 'Management', total: AMOUNTS.management, jjProfit: 0 },
    ],
    premium: { totalEur: AMOUNTS.aviPremium, paidBy: 'Avi', receivedBy: { Yossi: AMOUNTS.aviPremium } },
    paid: { Avi: AMOUNTS.aviPaidTotal },
    evidence: VM1_CANONICAL_CLASSIFICATION,
    requiredControls: REQUIRED_CONTROLS,
    settlePartners: ['Avi'],
    ...overrides,
  }
}
