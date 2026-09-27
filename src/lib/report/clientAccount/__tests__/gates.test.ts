import { ClosingBridge } from '../../../pdf/clientAccount/components'
import { buildClientAccountReport } from '../buildClientAccountReport'
import { ClientAccountBlock, composeCertifiedClientAccount } from '../composeCertifiedAccount'
import { ACCOUNTING_GATE_IDS, BRIDGE_TOLERANCE_EUR, runAccountingGates } from '../gates'
import type { ClientAccountDocument, CompositionInput, LedgerRow } from '../types'

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'amountEur'>): LedgerRow {
  return {
    date: '2026-01-15',
    propertyName: 'Sample House',
    category: 'Management',
    subcategory: 'Repairs',
    description: 'תיקון',
    payer: 'Anastasia',
    payee: 'company',
    clientCharge: null,
    reviewStatus: 'active',
    isDeleted: false,
    ...partial,
  }
}

function base(overrides: Partial<CompositionInput> = {}): CompositionInput {
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'לקוח',
    reportTitle: 'סיכום חשבון לקוח מלא',
    openingDueToJj: 30,
    closingDueToJj: 30,
    cashAllocationSignedTotal: 0,
    lines: [{ lineOrder: 1, propertyKey: 'p1', propertyName: 'Sample House', amountDueToJj: 30, evidenceRef: 'sample', metadata: {} }],
    credits: [],
    rows: [
      row({ id: 'a1', amountEur: 5, subcategory: 'Key Duplication', description: 'key copy' }),
      row({ id: 'b1', amountEur: 25, subcategory: 'Plumber', description: 'plamber' }),
    ],
    ...overrides,
  }
}

/** One property, two units: STR credit 50 against STR expenses 30, LTR rent 20 → property −40. */
function multiUnit(overrides: Partial<CompositionInput> = {}): CompositionInput {
  return base({
    openingDueToJj: -40,
    closingDueToJj: -40,
    lines: [{
      lineOrder: 1,
      propertyKey: 'p1',
      propertyName: 'Sample House',
      amountDueToJj: -40,
      evidenceRef: 'sample',
      metadata: { str_credit: 50, rental_credit: 20, airbnb_opex_excluding_str_tracked_cleaning: 30 },
    }],
    rows: [
      row({ id: 'rent1', date: '2026-06-01', amountEur: 20, subcategory: 'Tenant Payment', description: 'rent', payer: 'Tenant' }),
      row({ id: 'net1', date: '2026-06-10', amountEur: 30, category: 'Airbnb', subcategory: 'Internet', description: 'internet' }),
    ],
    ...overrides,
  })
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> }

function mutableCopy(doc: ClientAccountDocument): Mutable<ClientAccountDocument> {
  return JSON.parse(JSON.stringify(doc)) as Mutable<ClientAccountDocument>
}

function expectGate(fn: () => unknown, gate: (typeof ACCOUNTING_GATE_IDS)[number], code: 'BLOCKED_ACCOUNTING' | 'BLOCKED_PRESENTATION' = 'BLOCKED_ACCOUNTING') {
  let caught: unknown
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(ClientAccountBlock)
  expect((caught as ClientAccountBlock).code).toBe(code)
  expect((caught as ClientAccountBlock).message).toContain(`gate ${gate}`)
}

describe('accounting gates', () => {
  test('a consistent certified account passes all fourteen gates', () => {
    const { gates } = buildClientAccountReport(base())
    expect(gates.status).toBe('pass')
    expect(gates.gates.map((gate) => gate.id)).toEqual([...ACCOUNTING_GATE_IDS])
    expect(gates.gates.every((gate) => gate.checks >= 1 || gate.id === 'period-scope-only')).toBe(true)
  })

  test('1. rows that do not equal a unit balance or a category step fail closed', () => {
    const input = multiUnit()
    expect(buildClientAccountReport(input).gates.status).toBe('pass')
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    expect(doc.properties[0].units).toHaveLength(2)
    doc.properties[0].units[0].balanceDueToJj += 1
    expectGate(() => runAccountingGates(doc, input), 'rows-equal-category-totals')
    const doc2 = mutableCopy(composeCertifiedClientAccount(base()))
    doc2.properties[0].bridge[0].signedDueToJj += 1
    expectGate(() => runAccountingGates(doc2, base()), 'rows-equal-category-totals')
  })

  test('2. category totals that do not equal the property balance fail closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.properties[0].lines[0].amount = 6
    expectGate(() => runAccountingGates(doc, input), 'rows-equal-category-totals')
    const doc2 = mutableCopy(composeCertifiedClientAccount(input))
    doc2.properties[0].amountDueToJj = 31
    expectGate(() => runAccountingGates(doc2, input), 'categories-equal-property-balance')
  })

  test('3. property balances that do not add up to the client total fail closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.openingDueToJj = 31
    expectGate(() => runAccountingGates(doc, input), 'properties-equal-client-total')
  })

  test('4. total minus credits that does not reach the closing fails closed', () => {
    const input = base({
      openingDueToJj: 30,
      closingDueToJj: 20,
      credits: [{ id: 'c1', eventType: 'noncash_settlement_credit', amount: 10, effectiveDate: '2026-05-01' }],
    })
    expect(buildClientAccountReport(input).gates.status).toBe('pass')
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.credits[0].amount = 9
    expectGate(() => runAccountingGates(doc, input), 'total-and-credits-equal-closing')
  })

  test('5. a direction that contradicts the sign fails closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.closingDirection = 'jj_owes_client'
    expectGate(() => runAccountingGates(doc, input), 'direction-agrees-with-sign')
    const doc2 = mutableCopy(composeCertifiedClientAccount(input))
    doc2.properties[0].direction = 'jj_owes_client'
    expectGate(() => runAccountingGates(doc2, input), 'direction-agrees-with-sign')
  })

  test('6. a source counted twice fails closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.properties[0].lines[1].sourceIds = ['a1']
    expectGate(() => runAccountingGates(doc, input), 'counted-once')
  })

  test('7. a rejected duplicate or deleted row that reaches the display fails closed', () => {
    const input = base()
    const doc = composeCertifiedClientAccount(input)
    const rejected: CompositionInput = {
      ...input,
      rows: input.rows.map((item) => (item.id === 'a1' ? { ...item, reviewStatus: 'confirmed_duplicate' } : item)),
    }
    expectGate(() => runAccountingGates(doc, rejected), 'no-deleted-or-rejected-row')
    const deleted: CompositionInput = {
      ...input,
      rows: input.rows.map((item) => (item.id === 'a1' ? { ...item, isDeleted: true } : item)),
    }
    expectGate(() => runAccountingGates(doc, deleted), 'no-deleted-or-rejected-row')
    const late: CompositionInput = {
      ...input,
      rows: input.rows.map((item) => (item.id === 'a1' ? { ...item, date: '2026-09-01' } : item)),
    }
    expectGate(() => runAccountingGates(doc, late), 'no-deleted-or-rejected-row')
  })

  test('8. a raw internal field value in the client text fails closed', () => {
    const input = base({
      rows: [
        row({ id: 'a1', amountEur: 5, subcategory: 'Key Duplication', description: 'key copy', payer: 'Jacob' }),
        row({ id: 'b1', amountEur: 25, subcategory: 'Plumber', description: 'plamber' }),
      ],
    })
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    const key = doc.properties[0].lines.find((line) => line.sourceIds.includes('a1'))
    expect(key).toBeDefined()
    key!.clientText = 'שכפול מפתח — Jacob'
    expectGate(() => runAccountingGates(doc, input), 'no-raw-internal-field', 'BLOCKED_PRESENTATION')
  })

  test('9. a missing amount shown as zero fails closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.properties[0].bridge.push({ ...doc.properties[0].bridge[0], label: 'הוצאה נוספת', signedDueToJj: 0 })
    expectGate(() => runAccountingGates(doc, input), 'no-missing-numeric-as-zero')
    const doc2 = mutableCopy(composeCertifiedClientAccount(input))
    doc2.properties[0].lines.push({ ...doc2.properties[0].lines[0], amount: 0, sourceIds: [], traceSourceId: null })
    expectGate(() => runAccountingGates(doc2, input), 'no-missing-numeric-as-zero')
    const doc3 = mutableCopy(composeCertifiedClientAccount(input))
    doc3.properties[0].lines[0].amount = Number.NaN
    expect(() => runAccountingGates(doc3, input)).toThrow(ClientAccountBlock)
  })

  test('10. an unapproved per-property allocation fails closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.properties[0].lines[0].allocationRule = 'even-split' as never
    expectGate(() => runAccountingGates(doc, input), 'no-unapproved-allocation')
    const doc2 = mutableCopy(composeCertifiedClientAccount(input))
    doc2.properties[0].lines[0].sourceIds = []
    expectGate(() => runAccountingGates(doc2, input), 'no-unapproved-allocation')
    // A later slice of a traced receipt under an approved rule is allowed; an untraced one is not.
    const doc3 = mutableCopy(composeCertifiedClientAccount(input))
    doc3.properties[0].lines[0].sourceIds = []
    doc3.properties[0].lines[0].allocationRule = 'oldest-open-month'
    expect(runAccountingGates(doc3, input).status).toBe('pass')
    doc3.properties[0].lines[0].traceSourceId = 'missing-receipt'
    expectGate(() => runAccountingGates(doc3, input), 'no-unapproved-allocation')
  })

  test('11. a period account that shows activity before the period fails closed', () => {
    const input = base({
      reportType: 'period_account',
      period: { start: '2026-01-01', end: '2026-08-31' },
    })
    expect(buildClientAccountReport(input).gates.status).toBe('pass')
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    const narrowed = { start: '2026-02-01', end: '2026-08-31' }
    doc.period = narrowed
    expectGate(() => runAccountingGates(doc, { ...input, period: narrowed }), 'period-scope-only')
  })

  test('12. an implicit or inconsistent report scope fails closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.period = { start: '2026-01-01', end: '2026-08-31' }
    expectGate(() => runAccountingGates(doc, input), 'explicit-report-scope')
    const doc2 = mutableCopy(composeCertifiedClientAccount(input))
    const early = { start: '2026-01-01', end: '2026-08-30' }
    doc2.reportType = 'period_account'
    doc2.period = early
    expectGate(() => runAccountingGates(doc2, { ...input, reportType: 'period_account', period: early }), 'explicit-report-scope')
    expect(() => composeCertifiedClientAccount(base({ reportType: 'period_account' }))).toThrow(ClientAccountBlock)
    expect(() => composeCertifiedClientAccount(base({ period: { start: '2026-01-01', end: '2026-08-31' } }))).toThrow(ClientAccountBlock)
    expect(() => composeCertifiedClientAccount(base({ reportType: 'period_account', period: { start: '2026-01-01', end: '2026-08-30' } }))).toThrow(ClientAccountBlock)
  })

  test('13. a bridge that misses the certified balance by more than the tolerance fails closed', () => {
    const input = base()
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.properties[0].bridge[0].signedDueToJj += BRIDGE_TOLERANCE_EUR + 0.01
    let caught: unknown
    try {
      runAccountingGates(doc, input)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ClientAccountBlock)
    expect(() => ClosingBridge({ property: doc.properties[0], clientName: 'לקוח', language: 'he' })).toThrow(/closing bridge/)
    const within = mutableCopy(composeCertifiedClientAccount(input))
    within.properties[0].bridge[0].signedDueToJj += 0.01
    expect(() => ClosingBridge({ property: within.properties[0], clientName: 'לקוח', language: 'he' })).not.toThrow()
  })

  test('14. forbidden internal terminology in any client string fails closed', () => {
    const input = base()
    for (const leak of ['RC3 balance', 'FIFO credit', 'Current Balance', 'metadata', 'תיקון — Jacob', '9bc32d08-0000-4000-8000-000000000000']) {
      const doc = mutableCopy(composeCertifiedClientAccount(input))
      doc.properties[0].lines[0].clientText = leak
      expectGate(() => runAccountingGates(doc, input), 'display-whitelist', 'BLOCKED_PRESENTATION')
    }
    const doc = mutableCopy(composeCertifiedClientAccount(input))
    doc.reportTitle = 'Overall Net'
    expectGate(() => runAccountingGates(doc, input), 'display-whitelist', 'BLOCKED_PRESENTATION')
  })
})
