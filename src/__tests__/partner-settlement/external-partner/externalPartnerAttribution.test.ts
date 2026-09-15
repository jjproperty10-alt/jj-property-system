/**
 * Commit 2B — Avi Client→AVI funding attribution overlay (no UI, no Production write).
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  AVI_CLIENT_TO_AVI_ATTRIBUTION,
  YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
  applyAviFundingAttribution,
  composeExternalPartnerSettlement,
  composeExternalPartnerSettlementFromAttributedFunding,
  readExternalPartnerTransactionViewsFromAttribution,
  reconcileExternalPartnerControls,
} from '@/lib/partner-settlement/external-partner'
import type { RawExternalPartnerTransaction } from '@/lib/partner-settlement/external-partner'
import {
  AMOUNTS,
  TX,
  aviComposeInput,
  aviGoldenControlInput,
} from './aviGoldenFixture'

const SRC_FILES = [
  'src/lib/partner-settlement/external-partner/externalPartnerAttribution.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerScope.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerReader.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerReadTypes.ts',
  'src/lib/partner-settlement/external-partner/compose.ts',
  'src/lib/partner-settlement/external-partner/controlReconciliation.ts',
  'src/lib/partner-settlement/external-partner/index.ts',
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

function attributedAmountControls() {
  return [
    { id: TX.aviToJacob, amountEur: AMOUNTS.aviToJacob },
    { id: TX.aviReno5000, amountEur: AMOUNTS.aviReno5000 },
    { id: TX.aviReno20000, amountEur: AMOUNTS.aviReno20000 },
  ]
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
      description: null,
    }),
    raw({
      id: TX.platformYossi960,
      payer: 'Client',
      payee: 'Airbnb',
      amount_eur: 960,
      category: 'Airbnb',
      subcategory: 'Platform Income',
      description: 'not Avi funding',
    }),
  ]
}

function assertFailed(result: ReturnType<typeof applyAviFundingAttribution>, fragment: string) {
  expect(result.status).toBe('failed')
  if (result.status !== 'failed') return
  expect(result.failures.some((f) => f.includes(fragment))).toBe(true)
  expect(result).not.toHaveProperty('paidEurAvi')
}

describe('external-partner attribution — mapping has ids and fingerprints, not amounts', () => {
  it('maps the three Client ids to AVI without embedding the euro amounts', () => {
    expect(AVI_CLIENT_TO_AVI_ATTRIBUTION).toHaveLength(3)
    expect(AVI_CLIENT_TO_AVI_ATTRIBUTION.map((r) => r.id).sort()).toEqual(
      [TX.aviToJacob, TX.aviReno5000, TX.aviReno20000].sort(),
    )
    expect(
      AVI_CLIENT_TO_AVI_ATTRIBUTION.every(
        (r) =>
          r.expectedRawPayer === 'Client' &&
          r.attributedPayer === 'AVI' &&
          r.attributionSource === YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
      ),
    ).toBe(true)
    expect(AVI_CLIENT_TO_AVI_ATTRIBUTION.every((r) => !('amountEur' in r) && !('amount' in r))).toBe(
      true,
    )

    const mapSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/externalPartnerAttribution.ts'),
      'utf8',
    )
    expect(mapSrc).not.toMatch(/\b5600\b/)
    expect(mapSrc).not.toMatch(/\b5000\b/)
    expect(mapSrc).not.toMatch(/\b20000\b/)
    expect(mapSrc).not.toMatch(/\b280600\b/)
  })
})

describe('external-partner attribution — Avi paid from transaction amounts', () => {
  it('counts the three Client rows once each and yields paid 280600 from the rows', () => {
    const attribution = applyAviFundingAttribution(aviFundingRows(), {
      expectedAttributedAmounts: attributedAmountControls(),
    })
    expect(attribution.status).toBe('ok')
    if (attribution.status !== 'ok') return

    expect(attribution.paidEurAvi).toBe(AMOUNTS.aviPaidTotal)
    expect(attribution.attributedLines).toHaveLength(3)
    expect(new Set(attribution.attributedLines.map((l) => l.id)).size).toBe(3)
    expect(attribution.directAviPayerIds).toHaveLength(2)
    expect(attribution.countedIds).toHaveLength(5)
    expect(attribution.countedIds.filter((id) => id === TX.aviToJacob)).toHaveLength(1)
    expect(attribution.countedIds.filter((id) => id === TX.aviReno5000)).toHaveLength(1)
    expect(attribution.countedIds.filter((id) => id === TX.aviReno20000)).toHaveLength(1)

    for (const line of attribution.attributedLines) {
      expect(line.rawPayer).toBe('Client')
      expect(line.attributedPayer).toBe('AVI')
      expect(line.attributionSource).toBe(YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE)
    }
    expect(attribution.attributedLines.find((l) => l.id === TX.aviToJacob)?.amountEur).toBe(
      AMOUNTS.aviToJacob,
    )
    expect(attribution.attributedLines.find((l) => l.id === TX.aviReno5000)?.amountEur).toBe(
      AMOUNTS.aviReno5000,
    )
    expect(attribution.attributedLines.find((l) => l.id === TX.aviReno20000)?.amountEur).toBe(
      AMOUNTS.aviReno20000,
    )
  })

  it('does not count the unmapped Client €960 platform row as Avi funding', () => {
    const attribution = applyAviFundingAttribution(aviFundingRows(), {
      expectedAttributedAmounts: attributedAmountControls(),
    })
    expect(attribution.status).toBe('ok')
    if (attribution.status !== 'ok') return
    expect(attribution.countedIds).not.toContain(TX.platformYossi960)
  })

  it('changing Description or Notes does not change attribution', () => {
    const mutated = aviFundingRows().map((row) => ({
      ...row,
      description: 'rewritten description that mentions Jacob and Client',
      notes: 'rewritten notes that mention Avi paid',
      k_note: 'k rewritten',
    }))
    const attribution = applyAviFundingAttribution(mutated, {
      expectedAttributedAmounts: attributedAmountControls(),
    })
    expect(attribution.status).toBe('ok')
    if (attribution.status !== 'ok') return
    expect(attribution.paidEurAvi).toBe(AMOUNTS.aviPaidTotal)
    expect(attribution.attributedLines.map((l) => l.rawPayer)).toEqual(['Client', 'Client', 'Client'])
  })
})

describe('external-partner attribution — compose and control gate', () => {
  it('LEGACY_PRE_HOSTAWAY_BASELINE composes paid 280600, credits 680, obligation 300180.84, net −18900.84', () => {
    const { paid: _paid, ...rest } = aviComposeInput()
    void _paid
    const settlement = composeExternalPartnerSettlementFromAttributedFunding(
      rest,
      aviFundingRows(),
      { expectedAttributedAmounts: attributedAmountControls() },
    )
    expect(settlement.status).toBe('computed')
    if (settlement.status !== 'computed') return
    const avi = settlement.shares.find((s) => s.partner === 'Avi')!
    expect(avi.paidEur).toBe(280600)
    expect(avi.credits.totalEur).toBe(680)
    expect(avi.obligation.totalEur).toBe(300180.84)
    expect(avi.netEur).toBe(-18900.84)
  })

  it('Commit 1 compose without fundingAttribution still computes the same nets', () => {
    const settlement = composeExternalPartnerSettlement(aviComposeInput())
    expect(settlement.status).toBe('computed')
    if (settlement.status !== 'computed') return
    const avi = settlement.shares.find((s) => s.partner === 'Avi')!
    expect(avi.paidEur).toBe(AMOUNTS.aviPaidTotal)
    expect(avi.netEur).toBe(AMOUNTS.aviNet)
  })

  it('wires attribution into the reconciliation gate without changing the Commit 1 default', () => {
    expect(reconcileExternalPartnerControls(aviGoldenControlInput()).status).toBe('passed')

    const withOverlay = reconcileExternalPartnerControls(
      aviGoldenControlInput({
        expectedAttributedAmounts: attributedAmountControls(),
        attributedFundingRows: aviFundingRows(),
      }),
    )
    expect(withOverlay.status).toBe('passed')

    const missingRows = reconcileExternalPartnerControls(
      aviGoldenControlInput({
        expectedAttributedAmounts: attributedAmountControls(),
      }),
    )
    expect(missingRows.status).toBe('failed')
    expect(missingRows.failures.some((f) => f.startsWith('attributed_id_missing:'))).toBe(true)
  })

  it('fails compose closed when paid.Avi does not match attributed paidEurAvi', () => {
    const attribution = applyAviFundingAttribution(aviFundingRows(), {
      expectedAttributedAmounts: attributedAmountControls(),
    })
    expect(attribution.status).toBe('ok')
    const settlement = composeExternalPartnerSettlement(
      aviComposeInput({ paid: { Avi: 250000 }, fundingAttribution: attribution }),
    )
    expect(settlement.status).toBe('failed')
    if (settlement.status !== 'failed') return
    expect(settlement.failureReasons).toContain('paid_amount_attribution_mismatch:Avi')
    expect(settlement).not.toHaveProperty('shares')
  })
})

describe('external-partner attribution — fail closed', () => {
  it('fails when a mapped id is missing', () => {
    const rows = aviFundingRows().filter((r) => r.id !== TX.aviReno5000)
    assertFailed(
      applyAviFundingAttribution(rows, { expectedAttributedAmounts: attributedAmountControls() }),
      `attributed_id_missing:${TX.aviReno5000}`,
    )
  })

  it('fails when a mapped id is duplicated in the read set', () => {
    const rows = [...aviFundingRows(), ...aviFundingRows().filter((r) => r.id === TX.aviToJacob)]
    assertFailed(
      applyAviFundingAttribution(rows, { expectedAttributedAmounts: attributedAmountControls() }),
      `attributed_id_duplicate:${TX.aviToJacob}`,
    )
  })

  it('fails when amount control does not match the transaction amount', () => {
    const rows = aviFundingRows().map((r) =>
      r.id === TX.aviToJacob ? { ...r, amount_eur: AMOUNTS.aviToJacob + 1 } : r,
    )
    assertFailed(
      applyAviFundingAttribution(rows, { expectedAttributedAmounts: attributedAmountControls() }),
      `attributed_amount_mismatch:${TX.aviToJacob}`,
    )
  })

  it('fails when property fingerprint changes', () => {
    const sister = ['Villa Mazotos', ' 2'].join('')
    const rows = aviFundingRows().map((r) =>
      r.id === TX.aviReno20000 ? { ...r, property_name: sister } : r,
    )
    assertFailed(
      applyAviFundingAttribution(rows, { expectedAttributedAmounts: attributedAmountControls() }),
      `attributed_property_mismatch:${TX.aviReno20000}`,
    )
  })

  it('fails when category fingerprint changes', () => {
    const rows = aviFundingRows().map((r) =>
      r.id === TX.aviReno5000 ? { ...r, category: 'Airbnb' } : r,
    )
    assertFailed(
      applyAviFundingAttribution(rows, { expectedAttributedAmounts: attributedAmountControls() }),
      `attributed_category_mismatch:${TX.aviReno5000}`,
    )
  })

  it('fails when raw payer is no longer Client', () => {
    const rows = aviFundingRows().map((r) => (r.id === TX.aviToJacob ? { ...r, payer: 'Jacob' } : r))
    assertFailed(
      applyAviFundingAttribution(rows, { expectedAttributedAmounts: attributedAmountControls() }),
      `attributed_raw_payer_mismatch:${TX.aviToJacob}`,
    )
  })

  it('fails closed on future correction lineage and does not double-count a rebook', () => {
    const rebookId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const rows = [
      ...aviFundingRows(),
      raw({
        id: rebookId,
        payer: 'AVI',
        amount_eur: AMOUNTS.aviToJacob,
        category: 'Purchase',
        subcategory: 'Purchase Payment',
      }),
    ]
    const attribution = applyAviFundingAttribution(rows, {
      expectedAttributedAmounts: attributedAmountControls(),
      correctionLineage: [
        {
          originalTransactionId: TX.aviToJacob,
          appliedTransactionId: rebookId,
          entryRole: 'rebook',
        },
      ],
    })
    expect(attribution.status).toBe('failed')
    if (attribution.status !== 'failed') return
    expect(attribution.failures.some((f) => f.startsWith('correction_lineage_present:'))).toBe(true)
    expect(attribution.failures.some((f) => f.startsWith('correction_lineage_applied_row_present:'))).toBe(
      true,
    )
    expect(attribution).not.toHaveProperty('paidEurAvi')

    const settlement = composeExternalPartnerSettlementFromAttributedFunding(
      (() => {
        const { paid: _paid, ...rest } = aviComposeInput()
        void _paid
        return rest
      })(),
      rows,
      {
        expectedAttributedAmounts: attributedAmountControls(),
        correctionLineage: [
          {
            originalTransactionId: TX.aviToJacob,
            appliedTransactionId: rebookId,
            entryRole: 'rebook',
          },
        ],
      },
    )
    expect(settlement.status).toBe('failed')
    if (settlement.status !== 'failed') return
    expect(settlement).not.toHaveProperty('shares')
  })
})

describe('external-partner attribution — partner-visible leak guard', () => {
  it('shows Partner funding + Avi payment only; no raw payer, payee, description, or notes', () => {
    const rows = aviFundingRows()
    const attribution = applyAviFundingAttribution(rows, {
      expectedAttributedAmounts: attributedAmountControls(),
    })
    expect(attribution.status).toBe('ok')
    const views = readExternalPartnerTransactionViewsFromAttribution(rows, attribution)

    const attributedIds = [TX.aviToJacob, TX.aviReno5000, TX.aviReno20000]
    const payments = views.partnerVisible.payments
    expect(payments.map((p) => p.id).sort()).toEqual(
      [TX.aviPurchaseFunding, TX.aviPremium, ...attributedIds].sort(),
    )
    expect(payments).toHaveLength(5)
    expect(payments.every((p) => p.label === 'Partner funding' && p.payer === 'Avi')).toBe(true)

    const payJson = JSON.stringify(views.partnerVisible)
    expect(payJson).not.toContain('Client')
    expect(payJson).not.toContain('Jacob')
    expect(payJson).not.toContain('"JJ"')
    expect(payJson).not.toContain('אבי נתן ליעקוב')
    expect(payJson).not.toContain('עח השיפוץ')
    expect(payJson).not.toContain('internal conduit note')
    expect(payJson).not.toContain('staff reno note')
    expect(payJson).not.toContain('not Avi funding')
    expect(payJson).not.toMatch(/"notes"/)
    expect(payJson).not.toMatch(/"description"/)
    expect(payJson).not.toMatch(/"payee"/)
    expect(payJson).not.toMatch(/"rawPayer"/)
    expect(payJson).toContain('Partner funding')

    for (const id of attributedIds) {
      const internal = views.internal.rows.find((r) => r.id === id)!
      expect(internal.rawPayer).toBe('Client')
      expect(internal.attributedPayer).toBe('AVI')
      expect(internal.attributionSource).toBe(YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE)
    }

    expect(views.partnerVisible.expenses.some((e) => e.id === TX.platformYossi960)).toBe(true)
    expect(views.partnerVisible.payments.some((p) => p.id === TX.platformYossi960)).toBe(false)
  })
})

describe('external-partner attribution — isolation', () => {
  it('does not import Partner B ledger, RC3, or lifecycle, and does not write', () => {
    const forbiddenImports = [
      'readPartnerLedger',
      'isCertifiedLedgerRow',
      'partnerStatementService',
      'partnerLedgerEngine',
      "from '@/lib/lifecycle",
      "from '@/lib/report/",
      'v_rc3_classified',
      'apply_correction_case',
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
