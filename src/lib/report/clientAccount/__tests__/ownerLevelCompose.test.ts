import { buildClientAccountReport } from '../buildClientAccountReport'
import { ClientAccountBlock, composeCertifiedClientAccount } from '../composeCertifiedAccount'
import type { CompositionInput, LedgerRow } from '../types'

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'amountEur'>): LedgerRow {
  return {
    date: '2026-03-15',
    propertyName: 'House A',
    category: 'Management',
    subcategory: 'Repairs',
    description: 'תיקון',
    payer: null,
    payee: null,
    clientCharge: null,
    reviewStatus: 'active',
    isDeleted: false,
    ...partial,
  }
}

function single(): CompositionInput {
  return {
    asOf: '2026-10-02',
    clientDisplayName: 'לקוח',
    reportTitle: 'סיכום חשבון לקוח מלא',
    openingDueToJj: 30,
    closingDueToJj: 30,
    cashAllocationSignedTotal: 0,
    lines: [{
      lineOrder: 1,
      propertyKey: 'p1',
      propertyName: 'House A',
      amountDueToJj: 30,
      evidenceRef: 'sample',
      metadata: {},
    }],
    credits: [],
    rows: [
      row({ id: 'a', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
    ],
  }
}

function sequence(): CompositionInput {
  return {
    asOf: '2026-10-02',
    clientDisplayName: 'לקוח',
    reportTitle: 'סיכום חשבון לקוח מלא',
    openingDueToJj: -3968.75,
    closingDueToJj: -518.75,
    cashAllocationSignedTotal: -3450,
    lines: [
      {
        lineOrder: 1,
        propertyKey: 'house-a',
        propertyName: 'House A',
        amountDueToJj: -8000,
        evidenceRef: 'ev-a',
        metadata: { str_credit: 8000 },
      },
      {
        lineOrder: 2,
        propertyKey: 'house-b',
        propertyName: 'House B',
        amountDueToJj: -5968.75,
        evidenceRef: 'ev-b',
        metadata: { str_credit: 5968.75 },
      },
    ],
    ownerLevelObligations: [{
      id: '01000000-0000-4000-8000-000000000001',
      effectiveDate: '2026-08-24',
      amountDueToJj: 10000,
    }],
    credits: [],
    rows: [],
  }
}

describe('owner-level obligations in the certified client account', () => {
  test('property lines plus a separate owner-level section reconcile to the opening', () => {
    const { document, gates } = buildClientAccountReport(sequence())
    expect(gates.status).toBe('pass')
    const propertyTotal = document.properties.reduce((sum, property) => sum + property.amountDueToJj, 0)
    expect(propertyTotal).toBe(-13968.75)
    expect(document.properties.map((property) => property.amountDueToJj)).toEqual([-8000, -5968.75])
    expect(document.ownerLevelObligations).toEqual([{
      id: '01000000-0000-4000-8000-000000000001',
      effectiveDate: '2026-08-24',
      amountDueToJj: 10000,
      label: 'תשלום כללי ברמת הבעלים',
      dateLabel: '24.08.2026',
    }])
    expect(propertyTotal + 10000).toBe(document.openingDueToJj)
    expect(document.openingDueToJj).toBe(-3968.75)
    expect(document.closingDueToJj).toBe(-518.75)
    expect(document.settlementBridge.propertyBalanceDueToJj).toBe(-13968.75)
    expect(document.settlementBridge.steps.map((step) => [step.kind, step.signedDueToJj])).toEqual([
      ['property-balance', -13968.75],
      ['owner-level', 10000],
      ['cash-allocation', 3450],
      ['closing', -518.75],
    ])
    expect(document.properties.some((property) => property.lines.some((line) => line.amount === 10000))).toBe(false)
  })

  test('a single-cert client with no owner-level obligation keeps the previous document', () => {
    const without = composeCertifiedClientAccount(single())
    const empty = composeCertifiedClientAccount({ ...single(), ownerLevelObligations: [] })
    expect(without).toEqual(empty)
    expect(Object.prototype.hasOwnProperty.call(without, 'ownerLevelObligations')).toBe(false)
    expect(without.openingDueToJj).toBe(30)
    expect(without.properties.map((property) => property.amountDueToJj)).toEqual([30])
    expect(without.settlementBridge.propertyBalanceDueToJj).toBe(30)
    expect(without.settlementBridge.steps.map((step) => step.kind)).toEqual(['property-balance', 'closing'])
    expect(buildClientAccountReport(single()).gates.status).toBe('pass')
  })

  test('a real mismatch still fails closed and is not inferred as owner-level', () => {
    expect(() => composeCertifiedClientAccount({
      ...single(),
      openingDueToJj: 31,
      closingDueToJj: 31,
    })).toThrow(ClientAccountBlock)

    expect(() => composeCertifiedClientAccount({
      ...sequence(),
      ownerLevelObligations: undefined,
      openingDueToJj: -3968.75,
      closingDueToJj: -518.75,
    })).toThrow(/certified opening/)

    expect(() => composeCertifiedClientAccount({
      ...sequence(),
      openingDueToJj: -3968.74,
      closingDueToJj: -518.74,
    })).toThrow(/certified opening/)

    expect(() => composeCertifiedClientAccount({
      ...sequence(),
      ownerLevelObligations: [{
        id: '01000000-0000-4000-8000-000000000001',
        effectiveDate: '2026-08-24',
        amountDueToJj: 9999,
      }],
    })).toThrow(/certified opening/)
  })
})
