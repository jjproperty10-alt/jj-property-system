/**
 * Commit 2C — External Partner Avi report service/DTO (read-only).
 * Uses Commit 1 golden fixture and 2B attribution rows.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  composeExternalPartnerAviReport,
  VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT,
  roundEur,
} from '@/lib/partner-settlement/external-partner'
import type {
  ComposeAviReportInput,
  ExternalPartnerAviReport,
  RawExternalPartnerTransaction,
} from '@/lib/partner-settlement/external-partner'
import {
  AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS,
  AVI_VM1_CHARGES,
  AVI_VM1_LAYER_INPUTS,
  AVI_VM1_OWNERS,
  AVI_VM1_PREMIUM,
  AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  AVI_VM1_REQUIRED_CONTROLS,
  buildAviVm1ControlInput,
} from '@/lib/partner-settlement/external-partner/externalPartnerAviConfig'
import {
  AMOUNTS,
  AVI_OWNERS,
  PURCHASE_EXPENSE_ROWS,
  REQUIRED_CONTROLS,
  REQUIRED_PURCHASE_EXPENSE_PAYMENTS,
  TX,
  VM1_CANONICAL_CLASSIFICATION,
  aviGoldenPresentIds,
} from './aviGoldenFixture'

const SRC_FILES = [
  'src/lib/partner-settlement/external-partner/externalPartnerAviService.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerAviReportTypes.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerAviVisible.ts',
]

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

function aviFundingRows(): RawExternalPartnerTransaction[] {
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
      notes: 'internal conduit note',
    }),
    raw({
      id: TX.aviReno5000,
      payer: 'Client',
      payee: 'Jacob',
      amount_eur: AMOUNTS.aviReno5000,
      category: 'Renovation',
      subcategory: 'Client Payment',
      description: 'עח השיפוץ',
      notes: 'staff reno note',
    }),
    raw({
      id: TX.aviReno20000,
      payer: 'Client',
      payee: 'JJ',
      amount_eur: AMOUNTS.aviReno20000,
      category: 'Renovation',
      subcategory: 'Client Payment',
    }),
    raw({
      id: TX.platformYossi960,
      payer: 'Client',
      payee: 'Airbnb',
      amount_eur: 960,
      category: 'Airbnb',
      subcategory: 'Platform Income',
    }),
    raw({
      id: TX.purchaseExpJacob1400,
      payer: 'Jacob',
      payee: 'Yanis',
      amount_eur: 1400,
      category: 'Purchase',
      subcategory: 'Purchase Expenses',
      description: 'Avi paid Yanis',
    }),
  ]
}

function attributedAmountControls() {
  return [
    { id: TX.aviToJacob, amountEur: AMOUNTS.aviToJacob },
    { id: TX.aviReno5000, amountEur: AMOUNTS.aviReno5000 },
    { id: TX.aviReno20000, amountEur: AMOUNTS.aviReno20000 },
  ]
}

function certifiedInput(transactionRows: RawExternalPartnerTransaction[] = aviFundingRows()): ComposeAviReportInput {
  const evidence = VM1_CANONICAL_CLASSIFICATION
  return {
    owners: AVI_VM1_OWNERS,
    charges: [...AVI_VM1_CHARGES],
    premium: AVI_VM1_PREMIUM,
    evidence,
    requiredControls: AVI_VM1_REQUIRED_CONTROLS,
    controlInput: buildAviVm1ControlInput(evidence, aviGoldenPresentIds()),
    expectedAttributedAmounts: [...AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS],
    transactionRows,
    layerInputs: AVI_VM1_LAYER_INPUTS,
    renovationFundingPaymentIds: AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  }
}

function goldenInput(): ComposeAviReportInput {
  return {
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
    evidence: VM1_CANONICAL_CLASSIFICATION,
    requiredControls: REQUIRED_CONTROLS,
    controlInput: {
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
    },
    expectedAttributedAmounts: attributedAmountControls(),
    transactionRows: aviFundingRows(),
    layerInputs: {
      renovation: {
        clientCharge: AMOUNTS.renovation,
        actualCost: AMOUNTS.renovation,
        jjProfit: 0,
        aviFunding: AMOUNTS.aviRenoFinancing,
      },
      airbnb: {
        clientCharge: AMOUNTS.airbnbCharge,
        actualCost: AMOUNTS.airbnbCost,
        jjProfit: AMOUNTS.jjAirbnbProfit,
        aviCredit: AMOUNTS.platformCreditAvi,
      },
      management: {
        clientCharge: AMOUNTS.management,
        actualCost: AMOUNTS.management,
        jjProfit: 0,
      },
      dealExpense: {
        total: AMOUNTS.purchaseExpenses,
        aviPayment: AMOUNTS.aviToJacob,
        jacobConduit: AMOUNTS.aviToJacob,
      },
    },
  }
}

describe('external-partner Avi report service — certified golden', () => {
  const report = composeExternalPartnerAviReport(certifiedInput())

  it('produces a certified report', () => {
    expect(report.status).toBe('certified')
    expect(report.property).toBe('Villa Mazotos')
  })

  it('has correct snapshot metadata', () => {
    if (report.status !== 'certified') return
    expect(report.snapshot.propertyName).toBe('Villa Mazotos')
    expect(report.snapshot.approvedRowCount).toBe(202)
    expect(report.snapshot.sha256).toBe(VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256)
    expect(report.snapshot.version).toBe('vm1-classification-202-v1')
  })

  it('control status is all green', () => {
    if (report.status !== 'certified') return
    expect(report.controlStatus.reconciliationPassed).toBe(true)
    expect(report.controlStatus.settlementComputed).toBe(true)
    expect(report.controlStatus.attributionOk).toBe(true)
    expect(report.controlStatus.failures).toHaveLength(0)
  })

  it('Avi partner summary: paid 280600, credits 19495.25, obligation 2995010, net +594.25', () => {
    if (report.status !== 'certified') return
    const avi = report.partners.find((p) => p.partner === 'Avi')!
    expect(avi.ownershipPct).toBe(50)
    expect(avi.isJjPrincipal).toBe(false)
    expect(avi.status).toBe('CERTIFIED')
    expect(avi.paidEur).toBe(280600)
    expect(avi.creditsEur).toBe(19495.25)
    expect(avi.obligationEur).toBe(299501)
    expect(avi.netEur).toBe(594.25)
    expect(avi.direction).toBe('to_refund')
    expect(avi.semanticNet).toBe('Avi is owed €594.25')
  })

  it('Yossi and Jacob are PROVISIONAL with no amounts', () => {
    if (report.status !== 'certified') return
    for (const name of ['Yossi', 'Jacob']) {
      const p = report.partners.find((s) => s.partner === name)!
      expect(p.status).toBe('PROVISIONAL')
      expect(p.paidEur).toBeNull()
      expect(p.creditsEur).toBeNull()
      expect(p.obligationEur).toBeNull()
      expect(p.netEur).toBeNull()
      expect(p.direction).toBeNull()
      expect(p.semanticNet).toBeNull()
    }
  })

  it('layer breakdown includes acquisition then the four operating layers', () => {
    if (report.status !== 'certified') return
    expect(report.layers.map((l) => l.key)).toEqual([
      'acquisition', 'deal_expense', 'renovation', 'airbnb', 'management',
    ])
    expect(report.layers.find((l) => l.key === 'deal_expense')!.label).toBe(
      'Acquisition / Deal expenses',
    )
    const reno = report.layers.find((l) => l.key === 'renovation')!
    expect(reno.totalChargeEur).toBe(AMOUNTS.renovation)
    expect(reno.aviShareEur).toBe(36107.07)
    expect(reno.aviFundingEur).toBe(25000)
    expect(reno.semanticNet).toContain('Avi owes')
    expect(reno.semanticNet).toContain('11,107.07')
  })

  it('Avi-visible acquisition is 500000 agreed value and 250000 Avi share', () => {
    if (report.status !== 'certified') return
    expect(report.acquisition.agreedTransactionValueEur).toBe(500000)
    expect(report.acquisition.aviOwnershipPct).toBe(50)
    expect(report.acquisition.aviObligationEur).toBe(250000)
    expect(report.acquisition.remainingEur).toBe(0)
    expect(report.acquisition.presentationLine).toContain('500,000.00')
    expect(report.acquisition.presentationLine).toContain('250,000.00')
    expect(report.acquisition.presentationLine).toContain('Acquisition of 50% interest')
  })

  it('partner payments contain only Avi attributed payments with Partner funding label', () => {
    if (report.status !== 'certified') return
    expect(report.partnerPayments.length).toBeGreaterThanOrEqual(5)
    expect(report.partnerPayments.every((p) => p.label === 'Partner funding' && p.payer === 'Avi')).toBe(true)
    const payIds = report.partnerPayments.map((p) => p.id)
    expect(payIds).toContain(TX.aviPurchaseFunding)
    expect(payIds).toContain(TX.aviPremium)
    expect(payIds).toContain(TX.aviToJacob)
    expect(payIds).toContain(TX.aviReno5000)
    expect(payIds).toContain(TX.aviReno20000)
  })

  it('partner expenses include Avi 50% share', () => {
    if (report.status !== 'certified') return
    expect(report.partnerExpenses.length).toBeGreaterThan(0)
    expect(report.partnerExpenses.every((e) => e.aviSharePct === 50)).toBe(true)
    const jacob1400 = report.partnerExpenses.find((e) => e.id === TX.purchaseExpJacob1400)
    if (jacob1400) {
      expect(jacob1400.amountEur).toBe(1400)
      expect(jacob1400.aviShareEur).toBe(700)
    }
  })

  it('marks funding-only compose as incomplete for certified layers without detail rows', () => {
    if (report.status !== 'certified') return
    expect(report.expenseCompleteness.complete).toBe(false)
    expect(report.expenseCompleteness.departmentsMissingDetailRows).toEqual([
      'renovation',
    ])
  })
})

describe('external-partner Avi report service — no leaks in partner-visible', () => {
  const report = composeExternalPartnerAviReport(certifiedInput())

  it('no raw payer, payee, Notes, k_note, or descriptions in partner payments', () => {
    if (report.status !== 'certified') return
    const json = JSON.stringify(report.partnerPayments)
    expect(json).not.toContain('Client')
    expect(json).not.toContain('Jacob')
    expect(json).not.toContain('"JJ"')
    expect(json).not.toContain('אבי נתן ליעקוב')
    expect(json).not.toContain('עח השיפוץ')
    expect(json).not.toContain('internal conduit note')
    expect(json).not.toContain('staff reno note')
    expect(json).not.toMatch(/"notes"/)
    expect(json).not.toMatch(/"description"/)
    expect(json).not.toMatch(/"payee"/)
    expect(json).not.toMatch(/"rawPayer"/)
    expect(json).not.toMatch(/"kNote"/)
    expect(json).not.toMatch(/"k_note"/)
    expect(json).not.toMatch(/"review_status"/)
    expect(json).toContain('Partner funding')
  })

  it('no raw payer, payee, Notes, or descriptions in partner expenses', () => {
    if (report.status !== 'certified') return
    const json = JSON.stringify(report.partnerExpenses)
    expect(json).not.toMatch(/"payer"/)
    expect(json).not.toMatch(/"payee"/)
    expect(json).not.toMatch(/"notes"/)
    expect(json).not.toMatch(/"kNote"/)
    expect(json).not.toMatch(/"k_note"/)
    expect(json).not.toMatch(/"description"/)
    expect(json).not.toMatch(/"rawPayer"/)
    expect(json).not.toContain('Avi paid Yanis')
  })
})

describe('external-partner Avi report service — fail closed', () => {
  it('fails when snapshot evidence is missing', () => {
    const input = goldenInput()
    const result = composeExternalPartnerAviReport({ ...input, evidence: null as any })
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.failures.some((f) => f.includes('evidence'))).toBe(true)
    expect(result).not.toHaveProperty('partners')
    expect(result).not.toHaveProperty('layers')
  })

  it('fails when attribution control amount is wrong', () => {
    const input = goldenInput()
    const result = composeExternalPartnerAviReport({
      ...input,
      expectedAttributedAmounts: [
        { id: TX.aviToJacob, amountEur: 999 },
        { id: TX.aviReno5000, amountEur: AMOUNTS.aviReno5000 },
        { id: TX.aviReno20000, amountEur: AMOUNTS.aviReno20000 },
      ],
    })
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.failures.some((f) => f.includes('attributed_amount_mismatch'))).toBe(true)
    expect(result).not.toHaveProperty('partners')
  })

  it('fails when ownership is wrong', () => {
    const result = composeExternalPartnerAviReport({ ...goldenInput(), owners: [] })
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.failures.some((f) => f.includes('ownership'))).toBe(true)
  })

  it('fails when golden reconciliation does not match (renovation total mismatch)', () => {
    const input = goldenInput()
    const result = composeExternalPartnerAviReport({
      ...input,
      controlInput: {
        ...input.controlInput,
        renovationTotalEur: 99999,
      },
    })
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.failures.some((f) => f.includes('renovation'))).toBe(true)
  })

  it('fails with correction lineage on attributed id', () => {
    const result = composeExternalPartnerAviReport({
      ...goldenInput(),
      correctionLineage: [
        {
          originalTransactionId: TX.aviToJacob,
          appliedTransactionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          entryRole: 'rebook' as const,
        },
      ],
    })
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.failures.some((f) => f.startsWith('correction_lineage_present:'))).toBe(true)
  })

  it('never returns partial amounts on failure (no fallback to 280600)', () => {
    const result = composeExternalPartnerAviReport({ ...goldenInput(), evidence: null as any })
    expect(result.status).toBe('failed')
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/"paidEur"/)
    expect(json).not.toMatch(/"netEur"/)
    expect(json).not.toMatch(/280600/)
    expect(json).not.toMatch(/-18900/)
    expect(json).not.toMatch(/18,900/)
    expect(result).not.toHaveProperty('partners')
    expect(result).not.toHaveProperty('layers')
    expect(result).not.toHaveProperty('acquisition')
    expect(result).not.toHaveProperty('partnerPayments')
    expect(result).not.toHaveProperty('partnerExpenses')
  })

  it('LEGACY_PRE_HOSTAWAY_BASELINE cannot produce a Certified Avi report DTO', () => {
    const result = composeExternalPartnerAviReport(goldenInput())
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.failures).toContain('certified_identity_mismatch')
    expect(result.failures).toContain('certified_identity_mismatch:credits')
    expect(result.failures).toContain('certified_identity_mismatch:obligation')
    expect(result.failures).toContain('certified_identity_mismatch:net')
    expect(result).not.toHaveProperty('partners')
    expect(result).not.toHaveProperty('layers')
    expect(result).not.toHaveProperty('airbnbCredits')
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/18,900/)
    expect(json).not.toMatch(/-18900/)
    expect(json).not.toMatch(/"paidEur"/)
    expect(json).not.toMatch(/"netEur"/)
    expect(json).not.toMatch(/380\.50/)
  })
})

function completeVisibleRows(): RawExternalPartnerTransaction[] {
  const funding = aviFundingRows()
  const extraDeal = PURCHASE_EXPENSE_ROWS.filter((r) => r.id !== TX.purchaseExpJacob1400).map((r) =>
    raw({
      id: r.id,
      payer: 'Yossi',
      payee: 'supplier',
      amount_eur: r.amountEur,
      category: 'Purchase',
      subcategory: 'Purchase Expenses',
      description: 'internal deal note',
      notes: 'staff only',
    }),
  )
  return [
    ...funding,
    raw({
      id: TX.purchaseContract,
      payer: 'Owner',
      payee: 'Owner',
      amount_eur: AMOUNTS.purchaseContract,
      category: 'Purchase',
      subcategory: 'Purchase Contract',
      description: 'Villa purchase contract',
    }),
    ...extraDeal,
    raw({
      id: TX.germanWorkerOnce,
      payer: 'JJ',
      payee: 'Workers',
      amount_eur: 2000,
      category: 'Renovation',
      subcategory: 'Workers',
    }),
    raw({
      id: '8257e2f4-88f0-45aa-be63-4512680e29ad',
      payer: null,
      payee: null,
      amount_eur: 72199.14,
      category: 'Renovation',
      subcategory: 'Renovation Contract',
    }),
    raw({
      id: 'fa51910c-67f8-4782-97b4-f7ad332ac5d1',
      date: '2024-10-10',
      payer: 'Yossi',
      payee: 'company',
      amount_eur: 15,
      category: 'Renovation',
      subcategory: 'Plumber',
    }),
    raw({
      id: '02183eec-0936-4043-9f07-1264013ae855',
      payer: 'Anastasia',
      payee: 'company',
      amount_eur: 476,
      category: 'Airbnb',
      subcategory: 'Pool Service',
    }),
    raw({
      id: 'airbnb-certified-charge',
      payer: 'JJ',
      payee: 'vendor',
      amount_eur: AMOUNTS.airbnbCost,
      client_charge: AMOUNTS.airbnbCharge,
      category: 'Airbnb',
      subcategory: 'Operations',
    }),
    raw({
      id: TX.mgmtPool480,
      payer: 'JJ',
      payee: 'pool',
      amount_eur: 480,
      category: 'Management',
      subcategory: 'Pool',
    }),
    raw({
      id: TX.mgmtInternet30,
      payer: 'JJ',
      payee: 'isp',
      amount_eur: 30,
      category: 'Management',
      subcategory: 'Internet',
    }),
    raw({
      id: TX.mgmtElectricity181,
      payer: 'JJ',
      payee: 'utility',
      amount_eur: 181.79,
      category: 'Management',
      subcategory: 'Electricity',
    }),
  ]
}

describe('external-partner Avi report service — Avi-visible presentation', () => {
  const report = composeExternalPartnerAviReport({
    ...certifiedInput(),
    transactionRows: completeVisibleRows(),
  })

  it('is certified with the approved Avi identity', () => {
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    const avi = report.partners.find((p) => p.partner === 'Avi')!
    expect(avi.paidEur).toBe(280600)
    expect(avi.creditsEur).toBe(19495.25)
    expect(avi.obligationEur).toBe(299501)
    expect(avi.netEur).toBe(594.25)
    expect(avi.direction).toBe('to_refund')
    expect(avi.semanticNet).toBe('Avi is owed €594.25')
  })

  it('shows agreed value 500000 and Avi acquisition obligation 250000', () => {
    if (report.status !== 'certified') return
    expect(report.acquisition.agreedTransactionValueEur).toBe(500000)
    expect(report.acquisition.aviObligationEur).toBe(250000)
  })

  it('serialized Avi-visible DTO does not contain 400000 or a separate premium', () => {
    if (report.status !== 'certified') return
    const json = JSON.stringify(report)
    expect(json).not.toMatch(/\b400000\b/)
    expect(json).not.toMatch(/400,000/)
    expect(json.toLowerCase()).not.toContain('premium')
    expect(json).not.toContain('receivedBy')
    expect(json).not.toMatch(/Yossi[\s\S]{0,60}premium|premium[\s\S]{0,60}Yossi/i)
    expect(json).not.toContain('Purchase Contract')
    expect(json).not.toContain('rawPayer')
    expect(json).not.toContain('payee')
    expect(json).not.toMatch(/"notes"/)
    expect(json).not.toMatch(/"k_note"/)
    expect(json).not.toMatch(/"review_status"/)
    expect(json).not.toContain('confirmed_duplicate')
    expect(json).not.toContain('attributionSource')
    expect(json).not.toMatch(/18,900/)
    expect(json).not.toMatch(/-18900/)
  })

  it('keeps the contract as engine input but omits it from visible expenses', () => {
    if (report.status !== 'certified') return
    expect(certifiedInput().charges.some((c) => c.key === 'purchase_cost' && c.total === AMOUNTS.purchaseContract)).toBe(true)
    expect(report.partnerExpenses.some((e) => e.id === TX.purchaseContract)).toBe(false)
    expect(report.partnerPayments.some((p) => p.id === TX.purchaseContract)).toBe(false)
  })

  it('keeps 11900 deal expenses visible after removing the duplicate tax', () => {
    if (report.status !== 'certified') return
    const deal = report.partnerExpenses.filter((e) => e.layer === 'deal_expense')
    const dealSum = deal.reduce((s, e) => s + (e.amountEur ?? 0), 0)
    expect(dealSum).toBe(11900)
    expect(deal.some((e) => e.id === TX.purchaseExpAnastasia2400)).toBe(false)
    expect(deal.map((e) => e.id).sort()).toEqual(
      PURCHASE_EXPENSE_ROWS.filter((r) => r.id !== TX.purchaseExpAnastasia2400).map((r) => r.id).sort(),
    )
  })

  it('certified layer totals stay on AVI_VM1; expense overlay is presentation-only', () => {
    if (report.status !== 'certified') return
    const sumLayer = (layer: string) =>
      report.partnerExpenses
        .filter((e) => e.layer === layer)
        .reduce((s, e) => s + (e.amountEur ?? 0), 0)
    expect(sumLayer('renovation')).toBe(2015)
    expect(sumLayer('airbnb')).toBe(14327.53)
    expect(sumLayer('management')).toBe(0)
    expect(sumLayer('deal_expense')).toBe(11900)
    const total = roundEur(report.partnerExpenses.reduce((s, e) => s + (e.amountEur ?? 0), 0))
    expect(total).toBe(28242.53)
    const layerAviShare = roundEur(
      report.layers
        .filter((l) => l.key !== 'acquisition')
        .reduce((s, l) => s + (l.aviShareEur ?? 0), 0),
    )
    expect(layerAviShare).toBe(49501)
    expect(roundEur(report.partnerExpenses.reduce((s, e) => s + (e.aviShareEur ?? 0), 0))).toBe(14121.27)
    expect(report.partnerExpenses).toHaveLength(18)
    expect(report.visibleExpenseTotals.rowCount).toBe(18)
    expect(report.visibleExpenseTotals.totalChargeEur).toBe(99002)
    expect(report.visibleExpenseTotals.aviShareEur).toBe(49501)
    expect(report.partnerExpenses.some((e) => e.id === TX.mgmtPool480)).toBe(false)
  })

  it('hides the renovation contract and lists the real work rows', () => {
    if (report.status !== 'certified') return
    const reno = report.partnerExpenses.filter((e) => e.layer === 'renovation')
    expect(reno).toHaveLength(2)
    const contract = reno.find((e) => e.id === '8257e2f4-88f0-45aa-be63-4512680e29ad')
    const plumber = reno.find((e) => e.id === 'fa51910c-67f8-4782-97b4-f7ad332ac5d1')
    expect(contract).toBeUndefined()
    expect(plumber?.amountEur).toBe(15)
    expect(plumber?.subcategory).toBe('Plumber')
    expect(report.partnerExpenses.some((e) => e.id === TX.germanWorkerOnce)).toBe(true)
    expect(report.partnerExpenses.some((e) => e.subcategory === 'Workers')).toBe(true)
    expect(report.renovation.groups.some((g) => g.subcategory === 'Workers')).toBe(true)
    expect(report.airbnb.setup.totalEur).toBe(5706.06)
    expect(report.airbnb.operations.totalEur).toBe(9181.8)
    expect(report.finalSummary.netEur).toBe(594.25)
  })

  it('does not list internal Airbnb pool cash; overlay recodes utilities and pending pool invoices', () => {
    if (report.status !== 'certified') return
    expect(report.partnerExpenses.some((e) => e.id === '02183eec-0936-4043-9f07-1264013ae855')).toBe(false)
    const airbnb = report.partnerExpenses.filter((e) => e.layer === 'airbnb')
    expect(airbnb).toHaveLength(11)
    expect(airbnb.find((e) => e.id === 'airbnb-certified-charge')?.amountEur).toBe(AMOUNTS.airbnbCharge)
    expect(airbnb.find((e) => e.id === TX.mgmtInternet30)?.amountEur).toBe(30)
    expect(airbnb.find((e) => e.id === TX.mgmtElectricity181)?.amountEur).toBe(181.79)
    expect(airbnb.filter((e) => e.id.startsWith('pending-ledger:pool-'))).toHaveLength(8)
    expect(airbnb.some((e) => e.id === 'pending-ledger:pool-2026-09')).toBe(false)
  })

  it('shows exactly five Avi funding payments and no overlap with expenses', () => {
    if (report.status !== 'certified') return
    expect(report.partnerPayments).toHaveLength(5)
    const payIds = report.partnerPayments.map((p) => p.id).sort()
    expect(payIds).toEqual([
      TX.aviPurchaseFunding,
      TX.aviPremium,
      TX.aviToJacob,
      TX.aviReno5000,
      TX.aviReno20000,
    ].sort())
    expect(report.partnerPayments.every((p) => p.label === 'Partner funding' && p.payer === 'Avi')).toBe(true)
    const expenseIds = new Set(report.partnerExpenses.map((e) => e.id))
    for (const id of payIds) {
      expect(expenseIds.has(id)).toBe(false)
    }
  })

  it('Yossi and Jacob remain PROVISIONAL with no monetary balances', () => {
    if (report.status !== 'certified') return
    for (const name of ['Yossi', 'Jacob']) {
      const p = report.partners.find((s) => s.partner === name)!
      expect(p.status).toBe('PROVISIONAL')
      expect(p.paidEur).toBeNull()
      expect(p.creditsEur).toBeNull()
      expect(p.obligationEur).toBeNull()
      expect(p.netEur).toBeNull()
    }
  })

  it('four post-acquisition layer nets sum to the certified Avi balance', () => {
    if (report.status !== 'certified') return
    const reno = report.layers.find((l) => l.key === 'renovation')!
    const airbnb = report.layers.find((l) => l.key === 'airbnb')!
    const mgmt = report.layers.find((l) => l.key === 'management')!
    const deal = report.layers.find((l) => l.key === 'deal_expense')!
    expect(reno.semanticNet).toBe('Avi owes €11,107.07')
    expect(airbnb.semanticNet).toBe('Avi is owed €12,051.32')
    expect(mgmt.semanticNet).toBe('Settled')
    expect(deal.semanticNet).toBe('Avi owes €350.00')
    expect(report.layers.find((l) => l.key === 'acquisition')!.semanticNet).toBeNull()
  })
})

describe('external-partner Avi report service — isolation', () => {
  it('does not import Partner B, RC3, lifecycle, or PDF', () => {
    const forbiddenImports = [
      'readPartnerLedger',
      'isCertifiedLedgerRow',
      'partnerStatementService',
      'partnerLedgerEngine',
      "from '@/lib/lifecycle",
      "from '@/lib/report/",
      'v_rc3_classified',
      'apply_correction_case',
      '@react-pdf',
    ]
    const mutation = /\.(insert|update|delete|upsert|rpc)\s*\(/
    const forbiddenNames = [['Si', 'ma', 'wi'].join(''), ['Mor', '\u00e1', 'n'].join('')]
    const sisterProperty = ['Villa Mazotos', ' 2'].join('')

    for (const rel of SRC_FILES) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      for (const needle of forbiddenImports) {
        expect(text.includes(needle)).toBe(false)
      }
      expect(text).not.toMatch(mutation)
      for (const needle of forbiddenNames) {
        expect(text.includes(needle)).toBe(false)
      }
      expect(text.includes(sisterProperty)).toBe(false)
    }
  })
})
