/**
 * Approved Avi partner-report balance after Yossi 2026-09-08.
 * Printed Hostaway NTO unioned across both owner statements, no tax-line
 * certification, no Production writes.
 */
import {
  applyAviApprovedExpenseOverlay,
  AVI_APPROVED_BUSINESS_OVERLAY,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_PAID_EUR,
  AVI_MONTHLY_POOL_CHARGE_EUR,
  composeAviAirbnbCredits,
  composeExternalPartnerAviReport,
  composeExternalPartnerBilledActivity,
  composeExternalPartnerDealExpense,
  composeExternalPartnerLayerComponents,
  composeExternalPartnerSettlement,
  HOSTAWAY_PRINTED_DIRECT_STAY,
  HOSTAWAY_PRINTED_DIRECT_STAY_ID,
  HOSTAWAY_PRINTED_AVI_SHARE_EUR,
  HOSTAWAY_PRINTED_NTO_TOTAL_EUR,
  pendingPoolInvoiceId,
  PRIVATE_BOOKING_AVI_CREDIT_EUR,
  roundEur,
  VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT,
} from '@/lib/partner-settlement/external-partner'
import {
  AVI_VM1_CHARGES,
  AVI_VM1_LAYER_INPUTS,
  AVI_VM1_REQUIRED_CONTROLS,
} from '@/lib/partner-settlement/external-partner/externalPartnerAviConfig'
import type { ComposeAviReportInput } from '@/lib/partner-settlement/external-partner'
import {
  AVI_VM1_DUPLICATE_PURCHASE_EXPENSE,
  AVI_VM1_PURCHASE_EXPENSE_ROWS,
  AVI_VM1_REQUIRED_PURCHASE_EXPENSE_PAYMENTS,
} from '@/lib/partner-settlement/external-partner/externalPartnerAviConfig'
import { aviCertifiedIdentityIsSelfConsistent } from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import {
  AVI_EXCLUDED_RESERVATIONS,
  AVI_HOSTAWAY_STAYS,
  aviDuplicateStayIds,
} from '@/lib/partner-settlement/external-partner/aviHostawayStays'
import {
  AMOUNTS,
  AVI_OWNERS,
  TX,
  VM1_CANONICAL_CLASSIFICATION,
  aviGoldenPresentIds,
} from './aviGoldenFixture'
import type { RawExternalPartnerTransaction } from '@/lib/partner-settlement/external-partner'

const APPROVED = {
  airbnbCharge: 14887.86,
  airbnbCost: 14887.86,
  jjAirbnbProfit: 0,
  management: 0,
  income: 38990.5,
  aviCredit: 19495.25,
  purchaseExpenses: 11900,
  obligation: 299501,
  credits: 19495.25,
  net: 594.25,
} as const

function raw(overrides: Partial<RawExternalPartnerTransaction> = {}): RawExternalPartnerTransaction {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    date: '2025-01-16',
    property_name: 'Villa Mazotos',
    category: 'Purchase',
    subcategory: 'Purchase Payment',
    description: null,
    payer: 'Client',
    payee: null,
    amount_eur: 0,
    client_charge: null,
    notes: null,
    k_note: null,
    is_deleted: false,
    review_status: 'active',
    ...overrides,
  }
}

function fundingRows(): RawExternalPartnerTransaction[] {
  return [
    raw({
      id: TX.aviPurchaseFunding,
      payer: 'AVI',
      payee: 'Owner',
      amount_eur: AMOUNTS.aviPurchaseFunding,
      category: 'Purchase',
      subcategory: 'Purchase Payment',
    }),
    raw({
      id: TX.aviPremium,
      payer: 'AVI',
      payee: 'Yossi',
      amount_eur: AMOUNTS.aviPremium,
      category: 'Purchase',
      subcategory: 'Premium',
    }),
    raw({
      id: TX.aviToJacob,
      payer: 'Client',
      payee: 'Jacob',
      amount_eur: AMOUNTS.aviToJacob,
      category: 'Purchase',
      subcategory: 'Purchase Payment',
      description: 'אבי נתן ליעקוב',
    }),
    raw({
      id: TX.aviReno5000,
      payer: 'Client',
      payee: 'Jacob',
      amount_eur: AMOUNTS.aviReno5000,
      category: 'Renovation',
      subcategory: 'Client Payment',
    }),
    raw({
      id: TX.aviReno20000,
      payer: 'Client',
      payee: 'JJ',
      amount_eur: AMOUNTS.aviReno20000,
      category: 'Renovation',
      subcategory: 'Client Payment',
    }),
  ]
}

function approvedInput(): ComposeAviReportInput {
  return {
    owners: AVI_OWNERS,
    charges: [
      { key: 'purchase_cost', label: 'Purchase cost', total: AMOUNTS.purchaseContract },
      { key: 'deal_expenses', label: 'Deal expenses', total: APPROVED.purchaseExpenses },
      { key: 'renovation', label: 'Renovation', total: AMOUNTS.renovation, jjProfit: 0 },
      {
        key: 'airbnb',
        label: 'Airbnb',
        total: APPROVED.airbnbCharge,
        jjProfit: APPROVED.jjAirbnbProfit,
        income: APPROVED.income,
      },
      { key: 'management', label: 'Management', total: APPROVED.management, jjProfit: 0 },
    ],
    premium: { totalEur: AMOUNTS.aviPremium, paidBy: 'Avi', receivedBy: { Yossi: AMOUNTS.aviPremium } },
    evidence: VM1_CANONICAL_CLASSIFICATION,
    requiredControls: {
      purchase_cost: AMOUNTS.purchaseContract,
      deal_expenses: APPROVED.purchaseExpenses,
      renovation: AMOUNTS.renovation,
      airbnb: APPROVED.airbnbCharge,
      management: APPROVED.management,
      premium: AMOUNTS.aviPremium,
    },
    controlInput: {
      evidence: VM1_CANONICAL_CLASSIFICATION,
      expectedEvidence: VM1_CANONICAL_CLASSIFICATION,
      purchaseExpenseRows: [...AVI_VM1_PURCHASE_EXPENSE_ROWS],
      requiredPurchaseExpensePayments: [...AVI_VM1_REQUIRED_PURCHASE_EXPENSE_PAYMENTS],
      purchaseExpensesAuthoritativeEur: APPROVED.purchaseExpenses,
      renovationTotalEur: AMOUNTS.renovation,
      renovationAuthoritativeEur: AMOUNTS.renovation,
      presentIds: aviGoldenPresentIds(),
      mustIncludeOnce: [TX.germanWorkerOnce],
      mustExclude: [TX.germanWorkerDeletedDuplicate],
    },
    expectedAttributedAmounts: [
      { id: TX.aviToJacob, amountEur: AMOUNTS.aviToJacob },
      { id: TX.aviReno5000, amountEur: AMOUNTS.aviReno5000 },
      { id: TX.aviReno20000, amountEur: AMOUNTS.aviReno20000 },
    ],
    transactionRows: fundingRows(),
    layerInputs: {
      renovation: {
        clientCharge: AMOUNTS.renovation,
        actualCost: AMOUNTS.renovation,
        jjProfit: 0,
        aviFunding: AMOUNTS.aviRenoFinancing,
      },
      airbnb: {
        clientCharge: APPROVED.airbnbCharge,
        actualCost: APPROVED.airbnbCost,
        jjProfit: APPROVED.jjAirbnbProfit,
        aviCredit: APPROVED.aviCredit,
      },
      management: {
        clientCharge: APPROVED.management,
        actualCost: APPROVED.management,
        jjProfit: 0,
      },
      dealExpense: {
        total: APPROVED.purchaseExpenses,
        aviPayment: AMOUNTS.aviToJacob,
        jacobConduit: AMOUNTS.aviToJacob,
      },
    },
  }
}

describe('printed Hostaway NTO credits', () => {
  it('certifies stay 46340130 at printed NTO 1609.34 and Avi 804.67', () => {
    expect(HOSTAWAY_PRINTED_DIRECT_STAY.reservationId).toBe(HOSTAWAY_PRINTED_DIRECT_STAY_ID)
    expect(HOSTAWAY_PRINTED_DIRECT_STAY.checkIn).toBe('2025-09-19')
    expect(HOSTAWAY_PRINTED_DIRECT_STAY.printedNtoEur).toBe(1609.34)
    expect(HOSTAWAY_PRINTED_DIRECT_STAY.aviShareEur).toBe(804.67)
  })

  it('Hostaway Avi credit 18815.25 plus private 680 equals 19495.25', () => {
    expect(HOSTAWAY_PRINTED_NTO_TOTAL_EUR).toBe(37630.5)
    expect(HOSTAWAY_PRINTED_AVI_SHARE_EUR).toBe(18815.25)
    expect(PRIVATE_BOOKING_AVI_CREDIT_EUR).toBe(680)
    const credits = composeAviAirbnbCredits()
    expect(credits.totalAviEur).toBe(19495.25)
    expect(credits.otherHostawayPrintedNtoEur).toBe(36021.16)
    expect(credits.certifiedDirectStay.printedNtoEur).toBe(1609.34)
    expect(credits.certifiedDirectStay.aviShareEur).toBe(804.67)
  })

  it('unions the two printed statements without counting a stay twice', () => {
    const credits = composeAviAirbnbCredits()
    expect(credits.completedStayCount).toBe(28)
    expect(credits.completedNights).toBe(149)
    expect(credits.statementP1NtoEur).toBe(34115.8)
    expect(credits.statementP2TopUpNtoEur).toBe(3514.7)
    expect(roundEur(credits.statementP1NtoEur + credits.statementP2TopUpNtoEur)).toBe(37630.5)
    expect(aviDuplicateStayIds()).toEqual([])
  })

  it('excludes the request to book that never became a stay', () => {
    const excluded = AVI_EXCLUDED_RESERVATIONS.find((r) => r.reservationId === '47817104')
    expect(excluded).toBeDefined()
    expect(AVI_HOSTAWAY_STAYS.some((s) => s.reservationId === '47817104')).toBe(false)
    // It earns no payout, no night, and no per-stay consumables charge.
    expect(composeAviAirbnbCredits().completedStayCount).toBe(AVI_HOSTAWAY_STAYS.length)
  })

  it('does not certify or expose unprinted tax lines', () => {
    const json = JSON.stringify(composeAviAirbnbCredits())
    expect(json).not.toMatch(/190\.35/)
    expect(json).not.toMatch(/380\.70/)
    expect(json.toLowerCase()).not.toContain('totaltaxes')
    expect(json.toLowerCase()).not.toContain('taxesfv')
  })
})

describe('approved Avi partner report — Avi is owed €594.25', () => {
  const report = composeExternalPartnerAviReport(approvedInput())

  it('certifies Avi is owed 594.25 with printed-NTO credits', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    const avi = report.partners.find((p) => p.partner === 'Avi')!
    expect(avi.paidEur).toBe(280600)
    expect(avi.creditsEur).toBe(19495.25)
    expect(avi.obligationEur).toBe(299501)
    expect(avi.netEur).toBe(594.25)
    expect(avi.semanticNet).toBe('Avi is owed €594.25')
    expect(report.airbnbCredits.certifiedDirectStay.reservationId).toBe('46340130')
    expect(report.airbnbCredits.certifiedDirectStay.printedNtoEur).toBe(1609.34)
    expect(report.airbnbCredits.certifiedDirectStay.aviShareEur).toBe(804.67)
    expect(report.airbnbCredits.hostawayAviEur).toBe(18815.25)
    expect(report.snapshot.sha256).toBe(VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256)
    expect(report.acquisition.remainingEur).toBe(0)
    expect(report.airbnbCredits.privateBookingTotalEur).toBe(1360)
    expect(report.airbnbCredits.privateBookingAviEur).toBe(680)
    expect(report.layers.map((l) => l.key)).toEqual([
      'acquisition',
      'deal_expense',
      'renovation',
      'airbnb',
      'management',
    ])
    expect(report.expenseCompleteness.complete).toBe(false)
    expect(report.expenseCompleteness.departmentsMissingDetailRows).toEqual([
      'deal_expense',
      'renovation',
    ])
  })

  it('layer nets still sum to the certified Avi balance', () => {
    const renovation = composeExternalPartnerBilledActivity({
      kind: 'renovation',
      clientCharge: AMOUNTS.renovation,
      actualCost: AMOUNTS.renovation,
      distributableJjProfit: 0,
      funding: { Avi: AMOUNTS.aviRenoFinancing, Yossi: null, Jacob: null },
      owners: AVI_OWNERS,
    })
    const airbnb = composeExternalPartnerBilledActivity({
      kind: 'airbnb',
      clientCharge: APPROVED.airbnbCharge,
      actualCost: APPROVED.airbnbCost,
      distributableJjProfit: APPROVED.jjAirbnbProfit,
      funding: { Avi: APPROVED.aviCredit, Yossi: null, Jacob: null },
      owners: AVI_OWNERS,
    })
    const management = composeExternalPartnerBilledActivity({
      kind: 'management',
      clientCharge: 0,
      actualCost: 0,
      distributableJjProfit: 0,
      funding: { Avi: 0, Yossi: null, Jacob: null },
      owners: AVI_OWNERS,
    })
    const dealExpense = composeExternalPartnerDealExpense({
      totalDealExpenses: APPROVED.purchaseExpenses,
      owners: AVI_OWNERS,
      paymentsTowardExpenses: { Avi: AMOUNTS.aviToJacob },
      conduitReceipts: { Jacob: AMOUNTS.aviToJacob },
    })
    const components = composeExternalPartnerLayerComponents('Avi', {
      renovation, airbnb, management, dealExpense,
    })
    expect('total' in components).toBe(true)
    if (!('total' in components)) return
    expect(components.total).toBe(APPROVED.net)
    expect(components.management).toBe(0)
  })

  it('settlement identity: paid + credits − obligation = +594.25', () => {
    const settlement = composeExternalPartnerSettlement({
      property: 'Villa Mazotos',
      cutoffDate: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.cutoffDate,
      owners: AVI_OWNERS,
      charges: approvedInput().charges,
      premium: approvedInput().premium,
      paid: { Avi: 280600 },
      evidence: VM1_CANONICAL_CLASSIFICATION,
      requiredControls: approvedInput().requiredControls,
      settlePartners: ['Avi'],
    })
    expect(settlement.status).toBe('computed')
    if (settlement.status !== 'computed') return
    const avi = settlement.shares.find((s) => s.partner === 'Avi')!
    expect(roundEur(avi.paidEur + avi.credits.totalEur - avi.obligation.totalEur)).toBe(APPROVED.net)
    expect(avi.netEur).toBe(APPROVED.net)
    expect(avi.direction).toBe('to_refund')
  })

  it('report JSON does not certify unprinted tax amounts', () => {
    expect(report.status).toBe('certified')
    const json = JSON.stringify(report)
    expect(json).not.toMatch(/190\.35/)
    expect(json).not.toMatch(/380\.70/)
  })
})

describe('production Avi config is locked to the approved printed-NTO settlement', () => {
  it('uses Airbnb charge 14887.86, Hostaway credits 19495.25, and management 0', () => {
    const airbnb = AVI_VM1_CHARGES.find((c) => c.key === 'airbnb')!
    expect(airbnb.total).toBe(14887.86)
    expect(airbnb.income).toBe(38990.5)
    expect(AVI_VM1_LAYER_INPUTS.airbnb.aviCredit).toBe(19495.25)
    expect(AVI_VM1_LAYER_INPUTS.airbnb.clientCharge).toBe(14887.86)
    expect(AVI_VM1_LAYER_INPUTS.management.clientCharge).toBe(0)
    expect(AVI_VM1_REQUIRED_CONTROLS.airbnb).toBe(14887.86)
    expect(AVI_VM1_REQUIRED_CONTROLS.deal_expenses).toBe(11900)
    expect(AVI_VM1_REQUIRED_CONTROLS.management).toBe(0)
    expect(AVI_CERTIFIED_PAID_EUR).toBe(280600)
    expect(AVI_CERTIFIED_CREDITS_EUR).toBe(19495.25)
    expect(AVI_CERTIFIED_OBLIGATION_EUR).toBe(299501)
    expect(AVI_CERTIFIED_NET_EUR).toBe(594.25)
    expect(aviCertifiedIdentityIsSelfConsistent()).toBe(true)
  })

  it('charges the purchase tax once: 11900, with the duplicated 2400 row removed', () => {
    const rows = AVI_VM1_PURCHASE_EXPENSE_ROWS
    expect(roundEur(rows.reduce((s, r) => s + r.amountEur, 0))).toBe(11900)
    expect(rows.some((r) => r.id === AVI_VM1_DUPLICATE_PURCHASE_EXPENSE.id)).toBe(false)
    expect(AVI_VM1_DUPLICATE_PURCHASE_EXPENSE.amountEur).toBe(2400)
    // The two funding legs that make up the tax are kept, the aggregate is not.
    expect(rows.filter((r) => r.amountEur === 1400 || r.amountEur === 1000)).toHaveLength(2)
  })

  it('overlay recodes gardener, hides the pool vendor payment, and injects 2026 pool invoices', () => {
    const rows = applyAviApprovedExpenseOverlay([
      {
        visibility: 'internal',
        id: '98ce79c4-cb44-4dc0-a807-32010d529ac1',
        date: '2025-12-05',
        propertyName: 'Villa Mazotos',
        category: 'Airbnb',
        subcategory: 'Pool Service',
        description: null,
        payer: null,
        rawPayer: null,
        attributedPayer: null,
        attributionSource: null,
        payee: null,
        amountEur: 280,
        clientCharge: null,
        notes: null,
        kNote: null,
        isDeleted: false,
        reviewStatus: 'active',
        aviControl: null,
      },
      {
        visibility: 'internal',
        id: '00e84a59-7972-428b-bc54-7b3407c16754',
        date: '2026-03-14',
        propertyName: 'Villa Mazotos',
        category: 'Management',
        subcategory: 'Pool Service',
        description: null,
        payer: null,
        rawPayer: null,
        attributedPayer: null,
        attributionSource: null,
        payee: null,
        amountEur: 480,
        clientCharge: null,
        notes: null,
        kNote: null,
        isDeleted: false,
        reviewStatus: 'active',
        aviControl: null,
      },
      {
        visibility: 'internal',
        id: '4c40f610-c173-4027-b513-cffe12fcd288',
        date: '2026-04-20',
        propertyName: 'Villa Mazotos',
        category: 'Airbnb',
        subcategory: 'Pool Service',
        description: null,
        payer: null,
        rawPayer: null,
        attributedPayer: null,
        attributionSource: null,
        payee: null,
        amountEur: 250,
        clientCharge: 450,
        notes: null,
        kNote: null,
        isDeleted: false,
        reviewStatus: 'active',
        aviControl: null,
      },
    ])
    const gardener = rows.find((r) => r.id === '98ce79c4-cb44-4dc0-a807-32010d529ac1')!
    expect(gardener.subcategory).toBe('Garden Maintenance')
    expect(rows.some((r) => r.id === '00e84a59-7972-428b-bc54-7b3407c16754')).toBe(false)
    const equipment = rows.find((r) => r.id === '4c40f610-c173-4027-b513-cffe12fcd288')!
    expect(equipment.subcategory).toBe('Pool Equipment')
    const overlayPool = rows.filter((r) => r.id.startsWith('pending-ledger:pool-2026-'))
    expect(overlayPool).toHaveLength(8)
    expect(overlayPool.every((r) => r.reviewStatus === AVI_APPROVED_BUSINESS_OVERLAY)).toBe(true)
    expect(overlayPool.every((r) => r.overlayKind === AVI_APPROVED_BUSINESS_OVERLAY)).toBe(true)
    expect(overlayPool.every((r) => r.reviewStatus !== 'active')).toBe(true)
    expect(overlayPool.every((r) => r.clientCharge === AVI_MONTHLY_POOL_CHARGE_EUR)).toBe(true)
    expect(overlayPool.some((r) => r.id === 'pending-ledger:pool-2026-09')).toBe(false)
    expect(overlayPool.some((r) => r.id === 'pending-ledger:pool-2026-08')).toBe(true)
  })

  it('dedups overlay Pool Service months against later Production billing-only rows', () => {
    const rows = applyAviApprovedExpenseOverlay([
      {
        visibility: 'internal',
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1',
        date: '2026-01-01',
        propertyName: 'Villa Mazotos',
        category: 'Airbnb',
        subcategory: 'Pool Service',
        description: null,
        payer: null,
        rawPayer: null,
        attributedPayer: null,
        attributionSource: null,
        payee: null,
        amountEur: 0,
        clientCharge: 120,
        notes: null,
        kNote: null,
        isDeleted: false,
        reviewStatus: 'active',
        aviControl: null,
      },
      {
        visibility: 'internal',
        id: '4c40f610-c173-4027-b513-cffe12fcd288',
        date: '2026-04-20',
        propertyName: 'Villa Mazotos',
        category: 'Airbnb',
        subcategory: 'Pool Service',
        description: null,
        payer: null,
        rawPayer: null,
        attributedPayer: null,
        attributionSource: null,
        payee: null,
        amountEur: 250,
        clientCharge: 450,
        notes: null,
        kNote: null,
        isDeleted: false,
        reviewStatus: 'active',
        aviControl: null,
      },
    ])
    expect(rows.some((r) => r.id === pendingPoolInvoiceId('2026-01-01'))).toBe(false)
    expect(rows.some((r) => r.id === pendingPoolInvoiceId('2026-04-01'))).toBe(true)
    expect(rows.filter((r) => r.id.startsWith('pending-ledger:pool-'))).toHaveLength(7)
    const equipment = rows.find((r) => r.id === '4c40f610-c173-4027-b513-cffe12fcd288')!
    expect(equipment.subcategory).toBe('Pool Equipment')
    expect(equipment.clientCharge).toBe(450)
  })
})
