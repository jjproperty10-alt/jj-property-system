/**
 * Avi Villa Mazotos external-partner formula snapshot.
 * LEGACY_PRE_HOSTAWAY_BASELINE only — no routes, UI, adapters, or Production I/O.
 * This file must not feed composeExternalPartnerAviReport.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  composeExternalPartnerBilledActivity,
  composeExternalPartnerDealExpense,
  composeExternalPartnerLayerComponents,
  composeExternalPartnerSettlement,
  deriveExternalPartnerBillableCharge,
  EXTERNAL_PARTNER_SETTLEMENT_BRAND,
  reconcileExternalPartnerControls,
  roundEur,
} from '@/lib/partner-settlement/external-partner'
import { equalizationHeadline, type Headline } from '@/lib/partner-settlement/partnerReportBFormulas'
import { externalPartnerSettlementIsNotHeadline } from './isolation.types'
import {
  AMOUNTS,
  AVI_OWNERS,
  CONTROL_PROVENANCE,
  PURCHASE_EXPENSE_ROWS,
  TX,
  VM1_CANONICAL_CLASSIFICATION,
  aviComposeInput,
  aviGoldenControlInput,
  aviGoldenPresentIds,
} from './aviGoldenFixture'

const line = (
  r: ReturnType<typeof composeExternalPartnerBilledActivity>,
  partner: string,
) => r.lines.find((l) => l.partner === partner)!

function aviLayers() {
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
    clientCharge: AMOUNTS.airbnbCharge,
    actualCost: AMOUNTS.airbnbCost,
    distributableJjProfit: AMOUNTS.jjAirbnbProfit,
    funding: { Avi: AMOUNTS.platformCreditAvi, Yossi: null, Jacob: null },
    owners: AVI_OWNERS,
  })
  const management = composeExternalPartnerBilledActivity({
    kind: 'management',
    clientCharge: AMOUNTS.management,
    actualCost: AMOUNTS.management,
    distributableJjProfit: 0,
    funding: { Avi: 0, Yossi: null, Jacob: null },
    owners: AVI_OWNERS,
  })
  const dealExpense = composeExternalPartnerDealExpense({
    totalDealExpenses: AMOUNTS.purchaseExpenses,
    owners: AVI_OWNERS,
    paymentsTowardExpenses: { Avi: AMOUNTS.aviToJacob },
    conduitReceipts: { Jacob: AMOUNTS.aviToJacob },
  })
  return { renovation, airbnb, management, dealExpense }
}

const NEW_FILES = [
  'src/lib/partner-settlement/external-partner/types.ts',
  'src/lib/partner-settlement/external-partner/roundEur.ts',
  'src/lib/partner-settlement/external-partner/billedActivity.ts',
  'src/lib/partner-settlement/external-partner/dealExpense.ts',
  'src/lib/partner-settlement/external-partner/premiumOffset.ts',
  'src/lib/partner-settlement/external-partner/controlReconciliation.ts',
  'src/lib/partner-settlement/external-partner/compose.ts',
  'src/lib/partner-settlement/external-partner/index.ts',
  'src/__tests__/partner-settlement/external-partner/aviGoldenFixture.ts',
  'src/__tests__/partner-settlement/external-partner/aviGolden.test.ts',
  'src/__tests__/partner-settlement/external-partner/isolation.types.ts',
]

describe('Avi golden — provenance is attached to every control amount', () => {
  const requiredIds = [
    'purchase_contract',
    'purchase_expenses',
    'purchase_expense_jacob_1400',
    'purchase_expense_yossi_1000',
    'purchase_expense_anastasia_2400',
    'renovation',
    'german_worker_included_once',
    'german_worker_deleted_duplicate',
    'avi_renovation_financing_5000',
    'avi_renovation_financing_20000',
    'avi_purchase_funding',
    'avi_payment_to_jacob',
    'avi_premium_payment',
    'airbnb_cost',
    'jj_airbnb_profit',
    'jj_airbnb_markup',
    'jj_airbnb_pool_net',
    'airbnb_property_charge',
    'platform_credit_avi',
    'management',
    'deal_expense_net_avi',
    'avi_paid_total',
    'avi_credits',
    'avi_obligation',
    'avi_final_net',
  ]

  it('covers every required control with complete provenance metadata', () => {
    for (const id of requiredIds) {
      const row = CONTROL_PROVENANCE.find((p) => p.id === id)
      expect(row).toBeDefined()
      expect(row!.businessMeaning.length).toBeGreaterThan(10)
      expect(Number.isFinite(row!.approvedAmountEur)).toBe(true)
      expect(row!.sourceType.length).toBeGreaterThan(3)
      expect(row!.calculationFormula.length).toBeGreaterThan(5)
      expect(row!.inclusionExclusionRule.length).toBeGreaterThan(5)
      expect(row!.approvalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['APPROVED', 'VERIFIED', 'DECISION_BACKED']).toContain(row!.status)
    }
  })

  it('purchase expenses 14300 is the sum of the six itemised rows', () => {
    const sum = PURCHASE_EXPENSE_ROWS.reduce((s, r) => s + r.amountEur, 0)
    expect(sum).toBe(AMOUNTS.purchaseExpenses)
    expect(CONTROL_PROVENANCE.find((p) => p.id === 'purchase_expenses')!.transactionIds).toHaveLength(6)
  })

  it('references the canonical 202-row artifact by hash/version, without embedding 202 rows', () => {
    expect(VM1_CANONICAL_CLASSIFICATION.rowCount).toBe(202)
    expect(VM1_CANONICAL_CLASSIFICATION.sha256).toBe(
      '0477bfc5f2285425d55af6793f9d09bf829ee62387fb5b2a42bc0958478baf97',
    )
    expect(CONTROL_PROVENANCE.find((p) => p.id === 'renovation')!.canonicalClassification?.sha256).toBe(
      VM1_CANONICAL_CLASSIFICATION.sha256,
    )
    expect(PURCHASE_EXPENSE_ROWS.length).toBeLessThan(202)
  })
})

describe('LEGACY_PRE_HOSTAWAY_BASELINE — historical formula nets', () => {
  const layers = aviLayers()
  const settlement = composeExternalPartnerSettlement(aviComposeInput())
  const components = composeExternalPartnerLayerComponents('Avi', layers)

  it('1. historical formula net is exactly −18900.84 (not a Certified Avi report)', () => {
    expect(settlement.status).toBe('computed')
    if (settlement.status !== 'computed') return
    const avi = settlement.shares.find((s) => s.partner === 'Avi')!
    expect(avi.netEur).toBe(AMOUNTS.aviNet)
    expect(avi.paidEur).toBe(AMOUNTS.aviPaidTotal)
    expect(avi.credits.totalEur).toBe(AMOUNTS.aviCredits)
    expect(avi.obligation.totalEur).toBe(AMOUNTS.aviObligation)
    expect(roundEur(avi.paidEur + avi.credits.totalEur - avi.obligation.totalEur)).toBe(AMOUNTS.aviNet)
    expect(avi.direction).toBe('to_pay')
  })

  it('2–6. renovation / airbnb / management / deal-expense components and their sum', () => {
    expect(components).not.toHaveProperty('status')
    if ('status' in components) return
    expect(line(layers.renovation, 'Avi').balance).toBe(AMOUNTS.renoComponent)
    expect(line(layers.airbnb, 'Avi').balance).toBe(AMOUNTS.airbnbComponent)
    expect(line(layers.management, 'Avi').balance).toBe(AMOUNTS.managementComponent)
    expect(layers.dealExpense.lines.find((l) => l.partner === 'Avi')!.balance).toBe(
      AMOUNTS.dealExpenseComponent,
    )
    expect(components.renovation).toBe(-11107.07)
    expect(components.airbnb).toBe(-5897.87)
    expect(components.management).toBe(-345.9)
    expect(components.dealExpense).toBe(-1550)
    expect(components.total).toBe(-18900.84)
    expect(
      roundEur(
        components.renovation + components.airbnb + components.management + components.dealExpense,
      ),
    ).toBe(-18900.84)
  })

  it('7. Avi receives none of JJ profit 514', () => {
    expect(settlement.status).toBe('computed')
    if (settlement.status !== 'computed') return
    const avi = settlement.shares.find((s) => s.partner === 'Avi')!
    expect(avi.credits.jjProfitShareEur).toBe(0)
    expect(line(layers.airbnb, 'Avi').jjProfitOffset).toBe(0)
    expect(line(layers.airbnb, 'Yossi').jjProfitOffset).toBe(257)
    expect(line(layers.airbnb, 'Jacob').jjProfitOffset).toBe(257)
    expect(
      roundEur(
        (line(layers.airbnb, 'Yossi').jjProfitOffset as number) +
          (line(layers.airbnb, 'Jacob').jjProfitOffset as number),
      ),
    ).toBe(AMOUNTS.jjAirbnbProfit)
  })
})

describe('Avi golden — charge basis, inclusion, and reconciliation gate', () => {
  it('8. amount_eur and client_charge are never added for the same economic role', () => {
    const markup = deriveExternalPartnerBillableCharge([
      { id: TX.airbnbMarkup200, amountEur: 250, clientCharge: 450 },
      { id: TX.airbnbMarkup70, amountEur: 250, clientCharge: 320 },
    ])
    expect(markup.actualCost).toBe(500)
    expect(markup.billableCharge).toBe(770)
    expect(markup.grossMargin).toBe(270)
    expect(markup.billableCharge).not.toBe(500 + 770)
    expect(markup.perRow.every((r) => r.basis === 'client_charge')).toBe(true)

    const missingChargeUsesCost = deriveExternalPartnerBillableCharge([
      { id: 'cost-only', amountEur: 100, clientCharge: null },
    ])
    expect(missingChargeUsesCost.billableCharge).toBe(100)
    expect(missingChargeUsesCost.perRow[0].basis).toBe('cost')
  })

  it('9. f807dbf2 is included once', () => {
    const ids = aviGoldenPresentIds().filter((id) => id.startsWith('f807dbf2'))
    expect(ids).toHaveLength(1)
    expect(reconcileExternalPartnerControls(aviGoldenControlInput()).status).toBe('passed')
  })

  it('10. ca1448db is excluded', () => {
    expect(aviGoldenPresentIds().some((id) => id.startsWith('ca1448db'))).toBe(false)
    const gate = reconcileExternalPartnerControls(aviGoldenControlInput())
    expect(gate.failures.join(',')).not.toMatch(/must_exclude_failed/)
  })

  it('11. removing the 1400 or the 1000 purchase-expense payment fails the gate', () => {
    const without1400 = reconcileExternalPartnerControls(
      aviGoldenControlInput({
        purchaseExpenseRows: PURCHASE_EXPENSE_ROWS.filter((r) => r.id !== TX.purchaseExpJacob1400),
      }),
    )
    expect(without1400.status).toBe('failed')
    expect(without1400.failures.some((f) => f.includes('9363b7c1') || f.includes('purchase_expenses'))).toBe(
      true,
    )

    const without1000 = reconcileExternalPartnerControls(
      aviGoldenControlInput({
        purchaseExpenseRows: PURCHASE_EXPENSE_ROWS.filter((r) => r.id !== TX.purchaseExpYossi1000),
      }),
    )
    expect(without1000.status).toBe('failed')
    expect(without1000.failures.some((f) => f.includes('c2a9dff0') || f.includes('purchase_expenses'))).toBe(
      true,
    )
  })

  it('12. adding the deleted 650 duplicate fails the gate', () => {
    const added = reconcileExternalPartnerControls(
      aviGoldenControlInput({
        presentIds: [...aviGoldenPresentIds(), TX.germanWorkerDeletedDuplicate],
        renovationTotalEur: roundEur(AMOUNTS.renovation + AMOUNTS.germanWorker),
      }),
    )
    expect(added.status).toBe('failed')
    expect(added.failures.some((f) => f.includes('must_exclude_failed') || f.includes('renovation_total'))).toBe(
      true,
    )
  })
})

describe('Avi golden — type isolation and fail-closed', () => {
  it('13. external-partner output cannot be passed into the Yossi–Jacob headline by type/API design', () => {
    expect(externalPartnerSettlementIsNotHeadline).toBe(true)
    const settlement = composeExternalPartnerSettlement(aviComposeInput())
    expect(settlement.status).toBe('computed')
    expect(settlement[EXTERNAL_PARTNER_SETTLEMENT_BRAND]).toBe('ExternalPartnerSettlement')
    expect('debtor' in settlement).toBe(false)
    expect('creditor' in settlement).toBe(false)
    expect('amountEur' in settlement).toBe(false)

    function takeHeadline(_h: Headline): void {
      /* Partner B headline consumer */
    }
    // @ts-expect-error ExternalPartnerSettlement is not a Partner B Headline
    takeHeadline(settlement)
    // @ts-expect-error settlement is not an economic-position number
    equalizationHeadline(settlement, settlement)
  })

  it('14. missing ownership, paid amount, evidence, or required control fails closed (never invented 0)', () => {
    const noOwnership = composeExternalPartnerSettlement(aviComposeInput({ owners: [] }))
    expect(noOwnership.status).toBe('failed')
    if (noOwnership.status === 'failed') {
      expect(noOwnership.failureReasons.some((r) => r.includes('ownership'))).toBe(true)
      expect(noOwnership).not.toHaveProperty('shares')
    }

    const noPaid = composeExternalPartnerSettlement(aviComposeInput({ paid: {} }))
    expect(noPaid.status).toBe('failed')
    if (noPaid.status === 'failed') {
      expect(noPaid.failureReasons.some((r) => r.includes('paid_amount'))).toBe(true)
    }

    const nullPaid = composeExternalPartnerSettlement(aviComposeInput({ paid: { Avi: null } }))
    expect(nullPaid.status).toBe('failed')

    const noEvidence = composeExternalPartnerSettlement(aviComposeInput({ evidence: null }))
    expect(noEvidence.status).toBe('failed')
    if (noEvidence.status === 'failed') {
      expect(noEvidence.failureReasons).toContain('evidence_missing')
    }

    const noVersion = composeExternalPartnerSettlement(
      aviComposeInput({
        evidence: { ...VM1_CANONICAL_CLASSIFICATION, version: '' },
      }),
    )
    expect(noVersion.status).toBe('failed')

    const missingControl = composeExternalPartnerSettlement(
      aviComposeInput({
        charges: aviComposeInput().charges.filter((c) => c.key !== 'renovation'),
      }),
    )
    expect(missingControl.status).toBe('failed')
    if (missingControl.status === 'failed') {
      expect(missingControl.failureReasons.some((r) => r.includes('renovation'))).toBe(true)
    }

    for (const result of [noOwnership, noPaid, nullPaid, noEvidence, noVersion, missingControl]) {
      expect(result.status).toBe('failed')
      expect(JSON.stringify(result)).not.toMatch(/"netEur":/)
      expect(result).not.toHaveProperty('shares')
    }
  })

  it('15–16. new files do not contain forbidden names or copied sister-property money', () => {
    const forbidden = [['Si', 'ma', 'wi'].join(''), ['Mor', '\u00e1', 'n'].join('')]
    const sisterProperty = ['Villa Mazotos', ' 2'].join('')
    const copiedSisterPremium = 42 * 1000
    for (const rel of NEW_FILES) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      for (const needle of forbidden) {
        expect(text.includes(needle)).toBe(false)
      }
      expect(text.includes(sisterProperty)).toBe(false)
      expect(text.includes(String(copiedSisterPremium))).toBe(false)
    }
  })
})

describe('Avi golden — recovered billed-activity identities still hold', () => {
  it('Airbnb charge identity 12641.74 + 514 = 13155.74 and markup 270', () => {
    expect(roundEur(AMOUNTS.airbnbCost + AMOUNTS.jjAirbnbProfit)).toBe(AMOUNTS.airbnbCharge)
    expect(roundEur(AMOUNTS.jjAirbnbMarkup + AMOUNTS.jjAirbnbPoolNet)).toBe(AMOUNTS.jjAirbnbProfit)
  })

  it('Avi paid identity 200000 + 50000 + 5600 + 25000 = 280600', () => {
    expect(
      AMOUNTS.aviPurchaseFunding + AMOUNTS.aviPremium + AMOUNTS.aviToJacob + AMOUNTS.aviRenoFinancing,
    ).toBe(AMOUNTS.aviPaidTotal)
    expect(AMOUNTS.aviReno5000 + AMOUNTS.aviReno20000).toBe(AMOUNTS.aviRenoFinancing)
  })
})
