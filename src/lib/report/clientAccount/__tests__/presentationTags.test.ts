/**
 * Presentation tags turn DB-shaped Orit rows into the REVIEW-6 client lines.
 * Totals stay the certified figures. A missing or foreign tag blocks.
 */
import type { CertifiedClientSettlementAvailable } from '@/lib/finance/certifiedClientSettlementTypes'

import { buildClientAccountReport } from '../buildClientAccountReport'
import { compositionFromCertifiedSettlement, type RawTransactionRow } from '../certifiedSource'
import { ClientAccountBlock } from '../composeCertifiedAccount'
import { applyPresentationTags, assertPresentationEconomics, PRESENTATION_TAGS } from '../presentationTags'
import type { CompositionInput, LedgerRow } from '../types'
import {
  DEEP_CLEAN,
  ELECTRICITY,
  PREPARATION_LABEL,
  SUPPLIES,
  oritReview6Fixture,
} from './fixtures/review6TemplateFixture'

function rawFrom(row: LedgerRow): RawTransactionRow {
  return {
    id: row.id,
    date: row.date,
    property_name: row.propertyName,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    payer: row.payer,
    payee: row.payee,
    amount_eur: row.amountEur,
    client_charge: row.clientCharge,
    review_status: row.reviewStatus,
    is_deleted: row.isDeleted,
  }
}

function settlementFrom(input: CompositionInput): CertifiedClientSettlementAvailable {
  const credits = input.credits.reduce((sum, credit) => sum + credit.amount, 0)
  return {
    unavailable: false,
    certificationId: '00000000-0000-4000-8000-0000000000bb',
    entityId: '92ed1f7e-f7df-4529-b118-4aa63b2b15b2',
    asOf: input.asOf,
    certificationAsOf: input.asOf,
    openingDueToJj: input.openingDueToJj,
    propertyLines: input.lines.map((line) => ({
      lineOrder: line.lineOrder,
      propertyKey: line.propertyKey,
      propertyName: line.propertyName,
      componentCode: 'opening_property_obligation',
      amountDueToJj: line.amountDueToJj,
      reason: 'fixture',
      evidenceRef: line.evidenceRef,
      metadata: line.metadata,
    })),
    fifoCredits: input.credits.map((credit) => ({
      eventId: credit.id,
      eventType: credit.eventType,
      settlementAmount: credit.amount,
      effectiveDate: credit.effectiveDate,
      sourceTransactionId: credit.sourceTransactionId ?? null,
      cash: credit.eventType === 'include_transaction_in_settlement',
    })),
    exclusions: [],
    fifoCreditsTotal: credits,
    overlayClosingDueToJj: input.closingDueToJj,
    cashAllocationSignedTotal: input.cashAllocationSignedTotal,
    remainingR: -input.closingDueToJj,
    remainingS: input.closingDueToJj,
    obligationSlices: [],
    unboundLines: [],
    cashExecutions: [],
    closingDueToJj: input.closingDueToJj,
    closingDirection: 'client_owes_jj',
  }
}

function oritRequest(rows: RawTransactionRow[], clientSlug: string | undefined = 'orit-rob') {
  const source = oritReview6Fixture({ group: false, electricityLabel: false })
  return {
    settlement: settlementFrom(source),
    rows,
    clientSlug,
    clientDisplayName: source.clientDisplayName,
    reportTitle: source.reportTitle,
    reportLanguage: 'he' as const,
    reportType: source.reportType,
    period: source.period,
    evidence: { hebrewOwesForm: 'feminine' as const },
  }
}

describe('Orit presentation tags on DB-shaped rows', () => {
  const untagged = oritReview6Fixture({ group: false, electricityLabel: false })
  const rows = untagged.rows.map(rawFrom)

  test('one preparation line of 181.08 and the electricity label חשמל', () => {
    const composition = compositionFromCertifiedSettlement(oritRequest(rows))
    expect(composition.status).toBe('ready')
    if (composition.status !== 'ready') return
    const supplies = composition.input.rows.find((row) => row.id === SUPPLIES)
    const clean = composition.input.rows.find((row) => row.id === DEEP_CLEAN)
    expect(supplies).toMatchObject({ displayGroupKey: 'orit-preparation', displayGroupLabel: PREPARATION_LABEL })
    expect(clean).toMatchObject({ displayGroupKey: 'orit-preparation', displayGroupLabel: PREPARATION_LABEL })
    const electricityRow = composition.input.rows.find((row) => row.id === ELECTRICITY)
    expect(electricityRow).toMatchObject({
      clientLabel: 'חשמל',
      clientCharge: null,
      amountEur: 183.35,
      category: 'Management',
      date: '2026-08-11',
    })

    const report = buildClientAccountReport(composition.input)
    expect(report.gates.status).toBe('pass')
    const property = report.document.properties[0]
    const preparation = property.lines.filter((line) => line.sourceIds.includes(SUPPLIES) || line.sourceIds.includes(DEEP_CLEAN))
    expect(preparation).toHaveLength(1)
    expect(preparation[0]).toMatchObject({ clientText: PREPARATION_LABEL, amount: 181.08, sourceIds: [SUPPLIES, DEEP_CLEAN] })
    const electricity = property.lines.find((line) => line.sourceIds.includes(ELECTRICITY))
    expect(electricity).toMatchObject({ clientText: 'חשמל', amount: 183.35, clientChargeDefaulted: true })
  })

  test('totals stay 3,322.52 to 552.52, client_owes_jj, with and without tags', () => {
    const composition = compositionFromCertifiedSettlement(oritRequest(rows))
    expect(composition.status).toBe('ready')
    if (composition.status !== 'ready') return
    const withTags = buildClientAccountReport(composition.input).document
    const withoutTags = buildClientAccountReport({
      ...composition.input,
      rows: composition.input.rows.map((row) => {
        const { displayGroupKey: _group, displayGroupLabel: _label, clientLabel: _client, ...economic } = row
        return economic
      }),
    }).document
    expect(withTags.openingDueToJj).toBe(3322.52)
    expect(withTags.closingDueToJj).toBe(552.52)
    expect(withTags.closingDirection).toBe('client_owes_jj')
    expect(withoutTags.openingDueToJj).toBe(withTags.openingDueToJj)
    expect(withoutTags.closingDueToJj).toBe(withTags.closingDueToJj)
    expect(withoutTags.closingDirection).toBe(withTags.closingDirection)
    expect(withoutTags.settlementBridge.steps.map((step) => step.signedDueToJj)).toEqual(
      withTags.settlementBridge.steps.map((step) => step.signedDueToJj),
    )
  })

  test('a missing tagged row blocks', () => {
    const result = compositionFromCertifiedSettlement(oritRequest(rows.filter((row) => row.id !== SUPPLIES)))
    expect(result).toMatchObject({ status: 'blocked', code: 'BLOCKED_PRESENTATION' })
  })

  test('a tag for another client blocks', () => {
    const result = compositionFromCertifiedSettlement(oritRequest(rows, 'danny-levi'))
    expect(result).toMatchObject({ status: 'blocked', code: 'BLOCKED_PRESENTATION' })
  })

  test('wording outside the display whitelist blocks', () => {
    const sample = untagged.rows.find((row) => row.id === ELECTRICITY)
    expect(sample).toBeDefined()
    if (!sample) return
    expect(() => applyPresentationTags([sample], 'orit-rob', {
      [ELECTRICITY]: { client: 'orit-rob', clientLabel: 'יוסי', approvalRef: PRESENTATION_TAGS[ELECTRICITY].approvalRef },
    })).toThrow(ClientAccountBlock)
    try {
      applyPresentationTags([sample], 'orit-rob', {
        [ELECTRICITY]: { client: 'orit-rob', clientLabel: 'יוסי', approvalRef: 'review' },
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ClientAccountBlock)
      expect((err as ClientAccountBlock).code).toBe('BLOCKED_PRESENTATION')
    }
  })

  test('a presentation copy that moves amount, sign, category or date blocks', () => {
    const sample = untagged.rows.find((row) => row.id === ELECTRICITY)
    expect(sample).toBeDefined()
    if (!sample) return
    expect(() => assertPresentationEconomics(sample, { ...sample, amountEur: sample.amountEur + 1 })).toThrow(/amount/)
    expect(() => assertPresentationEconomics(sample, { ...sample, clientCharge: 0 })).toThrow(/amount/)
    expect(() => assertPresentationEconomics(sample, { ...sample, amountEur: -sample.amountEur })).toThrow(/sign/)
    expect(() => assertPresentationEconomics(sample, { ...sample, category: 'Sale' })).toThrow(/category/)
    expect(() => assertPresentationEconomics(sample, { ...sample, date: '2026-01-01' })).toThrow(/date/)
    const applied = applyPresentationTags([sample], 'orit-rob', { [ELECTRICITY]: PRESENTATION_TAGS[ELECTRICITY] })
    expect(applied[0]).toMatchObject({
      amountEur: sample.amountEur,
      clientCharge: null,
      category: sample.category,
      date: sample.date,
      clientLabel: 'חשמל',
    })
  })
})
