/**
 * Client payments as explicit settlement events through the universal engine.
 * Every figure below is a test fixture; the runtime holds none of them.
 */
import { buildClientAccountReport } from '../buildClientAccountReport'
import { ClientAccountBlock } from '../composeCertifiedAccount'
import { clientAccountPlainText } from '../gates'
import { TERMS } from '../terminology'
import type { CertifiedCreditInput, CompositionInput, LedgerRow } from '../types'

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'amountEur'>): LedgerRow {
  return {
    date: '2026-05-15',
    propertyName: 'House P',
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

function payment(id: string, amount: number, date: string, source: string | null, extra: Partial<CertifiedCreditInput> = {}): CertifiedCreditInput {
  return {
    id,
    eventType: 'include_transaction_in_settlement',
    amount,
    effectiveDate: date,
    sourceTransactionId: source,
    currency: 'EUR',
    evidenceStatus: 'certified',
    inclusion: 'included',
    ...extra,
  }
}

function input(overrides: Partial<CompositionInput>): CompositionInput {
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'לקוח',
    reportTitle: TERMS.settlementSummary.he,
    reportType: 'period_account',
    period: { start: '2026-04-01', end: '2026-08-31' },
    openingDueToJj: 0,
    closingDueToJj: 0,
    cashAllocationSignedTotal: 0,
    lines: [],
    credits: [],
    rows: [],
    ...overrides,
  }
}

/** One STR property: expenses 500, STR credit 200, two client payments 120 + 80 → 100 due to JJ. */
const PROPERTY_ROWS: LedgerRow[] = [
  row({ id: 'x1', date: '2026-05-02', amountEur: 300, category: 'Airbnb', subcategory: 'Design', description: 'ריהוט' }),
  row({ id: 'x2', date: '2026-05-20', amountEur: 100, category: 'Airbnb', subcategory: 'Cleaning', description: 'נקיון הדירה יסודי' }),
  row({ id: 'x3', date: '2026-07-10', amountEur: 40, category: 'Airbnb', subcategory: 'Internet', description: 'Internet' }),
  row({ id: 'x4', date: '2026-08-11', amountEur: 60, subcategory: 'Electricity', description: 'חשמל' }),
  row({ id: 'pay1', date: '2026-04-28', amountEur: 120, category: 'Airbnb', subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' }),
  row({ id: 'pay2', date: '2026-05-06', amountEur: 80, category: 'Airbnb', subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' }),
]

const PROPERTY_LINE = {
  lineOrder: 1,
  propertyKey: 'p',
  propertyName: 'House P',
  amountDueToJj: 300,
  evidenceRef: 'ev-p',
  metadata: { str_credit: 200, setup_expenses: 400, setup_through: '2026-05-31', airbnb_opex_including_cleaning: 40, owner_charges: 60 },
}

function propertyWithPayments(overrides: Partial<CompositionInput> = {}): CompositionInput {
  return input({
    openingDueToJj: 300,
    closingDueToJj: 100,
    lines: [PROPERTY_LINE],
    credits: [payment('e1', 120, '2026-04-28', 'pay1'), payment('e2', 80, '2026-05-06', 'pay2')],
    rows: PROPERTY_ROWS,
    ...overrides,
  })
}

describe('client payments as settlement events', () => {
  test('1. expenses − STR credit − two separate payments = closing due to JJ', () => {
    const { document, gates } = buildClientAccountReport(propertyWithPayments())
    expect(gates.status).toBe('pass')
    expect(document.openingDueToJj).toBe(300)
    expect(document.settlementBridge.propertyBalanceDueToJj).toBe(300)
    expect(document.settlementBridge.paymentsTotal).toBe(200)
    expect(document.closingDueToJj).toBe(100)
    expect(document.closingDirection).toBe('client_owes_jj')
    const property = document.properties[0]
    expect(property.amountDueToJj).toBe(300)
    // The pre-listing cleaning is a setup charge with its source month, not STR-tracked cleaning.
    const cleaning = property.lines.find((line) => line.sourceIds.includes('x2'))
    expect(cleaning).toMatchObject({ section: 'ציוד והכנת הנכס להשכרה קצרה', monthLabel: 'מאי 2026', clientText: 'ניקיון הדירה יסודי', effect: 'charge', amount: 100 })
    expect(property.lines.find((line) => line.sourceIds.includes('x3'))?.section).toBe('הוצאות השכרה קצרה')
    expect(property.lines.find((line) => line.sourceIds.includes('x4'))?.section).toBe('הוצאות הנכס')
  })

  test('2. payments are visible separately, each with its own identity and date', () => {
    const { document } = buildClientAccountReport(propertyWithPayments())
    expect(document.credits).toHaveLength(2)
    expect(document.credits.map((credit) => [credit.eventId, credit.sourceTransactionId, credit.amount, credit.monthLabel, credit.dateLabel])).toEqual([
      ['e1', 'pay1', 120, 'אפריל 2026', '28.04.2026'],
      ['e2', 'pay2', 80, 'מאי 2026', '06.05.2026'],
    ])
    for (const credit of document.credits) {
      expect(credit).toMatchObject({ currency: 'EUR', evidenceStatus: 'certified', inclusion: 'included', dateRole: 'cash-receipt', label: TERMS.creditCash.he })
    }
    const text = clientAccountPlainText(document)
    expect(text.split('120.00')).toHaveLength(2)
    expect(text.split('80.00')).toHaveLength(2)
  })

  test('3. payments are counted once: after the property balance, before the closing, never inside a property', () => {
    const { document } = buildClientAccountReport(propertyWithPayments())
    const kinds = document.settlementBridge.steps.map((step) => step.kind)
    expect(kinds).toEqual(['property-balance', 'payment', 'payment', 'closing'])
    expect(document.settlementBridge.steps.map((step) => step.signedDueToJj)).toEqual([300, -120, -80, 100])
    const propertySources = document.properties.flatMap((property) => property.lines.flatMap((line) => line.sourceIds))
    expect(propertySources).not.toContain('pay1')
    expect(propertySources).not.toContain('pay2')
    expect(new Set(propertySources).size).toBe(propertySources.length)
  })

  test('4. a duplicate payment id fails closed', () => {
    expect(() => buildClientAccountReport(propertyWithPayments({
      credits: [payment('e1', 120, '2026-04-28', 'pay1'), payment('e1', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/appears twice/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      openingDueToJj: 300, closingDueToJj: -20,
      credits: [payment('e1', 120, '2026-04-28', 'pay1'), payment('e2', 120, '2026-04-28', 'pay1'), payment('e3', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/presented by two events/)
  })

  test('5. a payment already consumed elsewhere fails closed', () => {
    expect(() => buildClientAccountReport(propertyWithPayments({
      consumedSourceTransactionIds: ['pay1'],
    }))).toThrow(/already consumed/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      credits: [payment('e1', 120, '2026-04-28', 'pay1', { inclusion: 'consumed_elsewhere' }), payment('e2', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/consumed_elsewhere/)
  })

  test('6. a payment inside the opening plus an explicit event fails closed', () => {
    expect(() => buildClientAccountReport(propertyWithPayments({
      lines: [{ ...PROPERTY_LINE, metadata: { ...PROPERTY_LINE.metadata, client_payments: 200 } }],
    }))).toThrow(/folded into the certified opening and also presented/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      lines: [{ ...PROPERTY_LINE, metadata: { ...PROPERTY_LINE.metadata, client_payment_row_ids: ['pay1'] } }],
    }))).toThrow(ClientAccountBlock)
    // A ledger payment that is neither an event nor certified inside the opening is out of scope.
    expect(() => buildClientAccountReport(propertyWithPayments({
      openingDueToJj: 300, closingDueToJj: 180,
      credits: [payment('e1', 120, '2026-04-28', 'pay1')],
    }))).toThrow(/client payment pay2 is in the ledger but is not a certified settlement event/)
  })

  test('7. missing or unknown evidence fails closed, as do a foreign currency and an out-of-scope date', () => {
    expect(() => buildClientAccountReport(propertyWithPayments({
      credits: [payment('e1', 120, '2026-04-28', 'pay1', { evidenceStatus: 'unknown' }), payment('e2', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/evidence status unknown/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      credits: [payment('e1', 120, '2026-04-28', 'pay1', { currency: 'USD' as unknown as 'EUR' }), payment('e2', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/is not in EUR/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      credits: [payment('e1', 120, '2026-03-28', 'pay1'), payment('e2', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/outside the report period/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      credits: [payment('', 120, '2026-04-28', 'pay1'), payment('e2', 80, '2026-05-06', 'pay2')],
    }))).toThrow(/has no identity/)
  })

  test('8. when payments exceed the amount due the direction turns to JJ owing the client', () => {
    const rows = [...PROPERTY_ROWS, row({ id: 'pay3', date: '2026-06-01', amountEur: 150, category: 'Airbnb', subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' })]
    const { document, gates } = buildClientAccountReport(propertyWithPayments({
      closingDueToJj: -50,
      credits: [payment('e1', 120, '2026-04-28', 'pay1'), payment('e2', 80, '2026-05-06', 'pay2'), payment('e3', 150, '2026-06-01', 'pay3')],
      rows,
    }))
    expect(gates.status).toBe('pass')
    expect(document.closingDueToJj).toBe(-50)
    expect(document.closingDirection).toBe('jj_owes_client')
    expect(document.settlementBridge.steps.map((step) => step.kind)).toEqual(['property-balance', 'payment', 'payment', 'payment', 'closing'])
  })

  test('9. a zero closing is closed', () => {
    const rows = [...PROPERTY_ROWS, row({ id: 'pay3', date: '2026-06-01', amountEur: 100, category: 'Airbnb', subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' })]
    const { document, gates } = buildClientAccountReport(propertyWithPayments({
      closingDueToJj: 0,
      credits: [payment('e1', 120, '2026-04-28', 'pay1'), payment('e2', 80, '2026-05-06', 'pay2'), payment('e3', 100, '2026-06-01', 'pay3')],
      rows,
    }))
    expect(gates.status).toBe('pass')
    expect(document.closingDueToJj).toBe(0)
    expect(document.closingDirection).toBe('settled')
    expect(document.settlementBridge.closingDueToJj).toBe(0)
  })

  test('a certified line cannot carry Airbnb expenses both with and without cleaning', () => {
    expect(() => buildClientAccountReport(propertyWithPayments({
      lines: [{ ...PROPERTY_LINE, metadata: { ...PROPERTY_LINE.metadata, airbnb_opex_excluding_str_tracked_cleaning: 40 } }],
    }))).toThrow(/both with and without cleaning/)
    expect(() => buildClientAccountReport(propertyWithPayments({
      lines: [{ ...PROPERTY_LINE, metadata: { str_credit: 200, setup_through: '2026-05-31', airbnb_opex_including_cleaning: 40, owner_charges: 60 } }],
    }))).toThrow(/setup_through requires/)
  })

  test('10. Uriel-shaped regression: the certified totals, the payment presentation and the closing are unchanged', () => {
    const { document, gates } = buildClientAccountReport(input({
      reportType: 'full_account',
      period: undefined,
      clientDisplayName: 'אוריאל',
      reportTitle: 'סיכום חשבון לקוח מלא',
      openingDueToJj: 117901.54,
      closingDueToJj: 48901.54,
      credits: [
        { id: 'sharon', eventType: 'noncash_settlement_credit', amount: 55000, effectiveDate: '2026-05-01' },
        { id: 'cash', eventType: 'include_transaction_in_settlement', amount: 14000, effectiveDate: '2026-08-05' },
      ],
      creditLabels: { noncash: 'זיכוי שרון — ללא מזומן', cash: 'תשלום כללי' },
      lines: [{ lineOrder: 1, propertyKey: 'deben', propertyName: 'Uriel Debenhams', amountDueToJj: 117901.54, evidenceRef: 'ev', metadata: {} }],
      rows: [
        row({ id: 'reno', date: '2025-11-15', amountEur: 3800, propertyName: 'Uriel Debenhams', category: 'Renovation', subcategory: 'Renovation Contract', description: null }),
        row({ id: 'key', date: '2026-04-01', amountEur: 5.25, propertyName: 'Uriel Debenhams', subcategory: 'Key Duplication', description: 'key' }),
        row({ id: 'rest', date: '2026-01-01', amountEur: 114096.29, propertyName: 'Uriel Debenhams', subcategory: 'Repairs', description: 'עבודות' }),
      ],
      descriptionByRowId: { reno: 'עבודות צבע ושפכטל, קרמיקה והחלפת ברז במטבח' },
    }))
    expect(gates.status).toBe('pass')
    expect(document.openingDueToJj).toBe(117901.54)
    expect(document.properties[0].amountDueToJj).toBe(117901.54)
    expect(document.credits.map((credit) => [credit.label, credit.monthLabel, credit.amount, credit.dateRole, credit.dateCaption, credit.note])).toEqual([
      ['זיכוי שרון — ללא מזומן', 'מאי 2026', 55000, 'credit-event', TERMS.creditEventCaption.he, TERMS.creditEventNote.he],
      ['תשלום כללי', 'אוגוסט 2026', 14000, 'cash-receipt', null, null],
    ])
    expect(document.closingDueToJj).toBe(48901.54)
    expect(document.closingDirection).toBe('client_owes_jj')
    expect(document.settlementBridge.steps.map((step) => [step.kind, step.signedDueToJj])).toEqual([
      ['property-balance', 117901.54], ['credit', -55000], ['payment', -14000], ['closing', 48901.54],
    ])
    // The renderer reads only these fields; they are byte-identical to the pre-payment-event engine.
    expect(clientAccountPlainText(document)).toContain('תשלום כללי\nאוגוסט 2026\n\n\ncash-receipt\n€14,000.00')
  })

  test('11. Orit-shaped fixture: STR 3,391.00, expenses 6,713.52, pre-payment balance 3,322.52, payments 1,770.00 and 1,000.00, closing 552.52 due to JJ', () => {
    // Fixture only. These values must never appear in runtime code.
    const rows: LedgerRow[] = [
      row({ id: 's1', date: '2026-04-27', amountEur: 6000, category: 'Airbnb', subcategory: 'Design', description: 'ריהוט', clientCharge: 6000 }),
      row({ id: 's2', date: '2026-05-15', amountEur: 61.08, category: 'Airbnb', subcategory: 'Cleaning', description: 'cleaning supplies' }),
      row({ id: 's3', date: '2026-05-27', amountEur: 120, category: 'Airbnb', subcategory: 'Cleaning', description: 'נקיון הדירה יסודי' }),
      row({ id: 's4', date: '2026-05-27', amountEur: 83.09, category: 'Airbnb', subcategory: 'Design Fee', description: 'הכנת הנכס' }),
      row({ id: 'o1', date: '2026-06-10', amountEur: 266, category: 'Airbnb', subcategory: 'Internet', description: 'Internet' }),
      row({ id: 'g1', date: '2026-08-11', amountEur: 183.35, subcategory: 'Electricity', description: 'חשמל' }),
      row({ id: 'p1', date: '2026-04-28', amountEur: 1770, category: 'Airbnb', subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' }),
      row({ id: 'p2', date: '2026-05-06', amountEur: 1000, category: 'Airbnb', subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' }),
    ]
    const { document, gates } = buildClientAccountReport(input({
      clientDisplayName: 'לקוחה',
      openingDueToJj: 3322.52,
      closingDueToJj: 552.52,
      lines: [{
        lineOrder: 1, propertyKey: 'pg', propertyName: 'House P', amountDueToJj: 3322.52, evidenceRef: 'ev',
        metadata: { str_credit: 3391, setup_expenses: 6264.17, setup_through: '2026-05-31', airbnb_opex_including_cleaning: 266, owner_charges: 183.35 },
      }],
      credits: [payment('ev-1', 1770, '2026-04-28', 'p1'), payment('ev-2', 1000, '2026-05-06', 'p2')],
      rows,
    }))
    expect(gates.status).toBe('pass')
    const property = document.properties[0]
    const charges = property.lines.filter((line) => line.effect === 'charge').reduce((sum, line) => sum + line.amount, 0)
    expect(Math.round(charges * 100) / 100).toBe(6713.52)
    expect(property.lines.find((line) => line.effect === 'credit')?.amount).toBe(3391)
    expect(document.settlementBridge.propertyBalanceDueToJj).toBe(3322.52)
    expect(document.credits.map((credit) => [credit.amount, credit.monthLabel])).toEqual([[1770, 'אפריל 2026'], [1000, 'מאי 2026']])
    expect(document.settlementBridge.steps.map((step) => step.signedDueToJj)).toEqual([3322.52, -1770, -1000, 552.52])
    expect(document.closingDueToJj).toBe(552.52)
    expect(document.closingDirection).toBe('client_owes_jj')
    const preparation = property.lines.filter((line) => line.sourceIds.includes('s2') || line.sourceIds.includes('s3'))
    expect(preparation.map((line) => [line.clientText, line.monthLabel, line.amount])).toEqual([
      ['חומרי ניקיון להכנת הנכס', 'מאי 2026', 61.08],
      ['ניקיון הדירה יסודי', 'מאי 2026', 120],
    ])
  })
})
