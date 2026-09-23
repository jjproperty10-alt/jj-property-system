import { composeCertifiedClientAccount, ClientAccountBlock } from '../composeCertifiedAccount'
import { applicableSectionNames } from '../composeCertifiedAccount'
import { buildAssertionRegister, forbiddenHits, internalLeakHits } from '../gates'
import { heroDirectionText, monthLabelForRow, clientDescription, UNDATED_LABEL } from '../presentation'
import type { CompositionInput, LedgerRow } from '../types'

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
    lines: [{
      lineOrder: 1,
      propertyKey: 'p1',
      propertyName: 'Sample House',
      amountDueToJj: 30,
      evidenceRef: 'sample',
      metadata: {},
    }],
    credits: [],
    rows: [
      row({ id: 'a', amountEur: 5, subcategory: 'Key Duplication', description: 'key copy' }),
      row({ id: 'b', amountEur: 25, subcategory: 'Plumber', description: 'plamber' }),
    ],
    ...overrides,
  }
}

describe('client account engine', () => {
  test('a property without purchase, renovation or rent shows only the sections that apply', () => {
    const doc = composeCertifiedClientAccount(base())
    const names = applicableSectionNames(doc.properties[0])
    expect(names).toEqual(['הוצאות הנכס', 'גשר סגירה', 'מה נסגר ומה נשאר פתוח'])
    expect(doc.properties[0].lines.map((line) => line.section)).toEqual(['הוצאות הנכס', 'הוצאות הנכס'])
    expect(doc.closingDirection).toBe('client_owes_jj')
    expect(heroDirectionText('לקוח', 'client_owes_jj')).toBe('לקוח חייב ל־JJ.')
  })

  test('a net-zero reversal is omitted and the economic line is counted once', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: 25,
      closingDueToJj: 25,
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: 25,
        evidenceRef: 'sample',
        metadata: {},
      }],
      rows: [
        row({ id: 'lock', amountEur: 25, subcategory: 'Lock Replacement', description: 'החלפת מנעול' }),
        row({ id: 'rev', amountEur: -25, subcategory: 'Plumber', description: 'החלפת מנעולים' }),
        row({ id: 'rebook', amountEur: 25, subcategory: 'Plumber', description: 'החלפת מנעולים' }),
      ],
    }))
    expect(doc.properties[0].amountDueToJj).toBe(25)
    expect(doc.properties[0].lines).toHaveLength(1)
    expect(doc.omittedNetZeroSourceIds.slice().sort()).toEqual(['rebook', 'rev'])
    expect(buildAssertionRegister(doc)).toHaveLength(1)
  })

  test('an approved line without a date uses the undated label and is not invented', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: 40,
      closingDueToJj: 40,
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: 40,
        evidenceRef: 'sample',
        metadata: { garden_2: 'owner-certified; no date invented' },
      }],
      undatedChargeLabelByPropertyKey: { p1: 'עבודת גינה' },
    }))
    const extra = doc.properties[0].lines.find((line) => line.description === 'עבודת גינה')
    expect(extra?.monthLabel).toBe(UNDATED_LABEL)
    expect(extra?.evidence).toBe('owner-certified')
    expect(extra?.amount).toBe(10)
  })

  test('STR platform rows are not turned into months when they miss the certified credit', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: -20,
      closingDueToJj: -20,
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: -20,
        evidenceRef: 'sample',
        metadata: { str_credit: 50, airbnb_opex_excluding_str_tracked_cleaning: 30 },
      }],
      rows: [
        row({ id: 'in1', amountEur: 40, category: 'Airbnb', subcategory: 'Platform Income', description: 'platform' }),
        row({ id: 'in2', amountEur: 30, category: 'Airbnb', subcategory: 'Platform Income', description: 'platform' }),
        row({ id: 'ex', amountEur: 30, category: 'Airbnb', subcategory: 'Internet', description: 'internet' }),
      ],
    }))
    const credits = doc.properties[0].lines.filter((line) => line.countedIn === 'str-credit')
    expect(credits).toHaveLength(1)
    expect(credits[0].monthLabel).toBe(UNDATED_LABEL)
    expect(credits[0].amount).toBe(50)
    expect(doc.properties[0].lines.some((line) => line.description === 'platform')).toBe(false)
  })

  test('STR months that do not equal the certified credit block the account', () => {
    expect(() => composeCertifiedClientAccount(base({
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: 0,
        evidenceRef: 'sample',
        metadata: { str_credit: 50 },
      }],
      strMonthsByPropertyKey: { p1: [{ year: 2026, month: 6, amount: 10 }] },
      rows: [],
    }))).toThrow(ClientAccountBlock)
  })

  test('a named month in the description is kept and an empty date is undated', () => {
    expect(monthLabelForRow('2026-03-09', 'February')).toBe('פברואר 2026')
    expect(monthLabelForRow(null, null)).toBe(UNDATED_LABEL)
  })

  test('acquisition price and internal wording stay out of the plain text', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: 0,
      closingDueToJj: -10,
      credits: [{ id: 'c1', eventType: 'noncash_settlement_credit', amount: 10, effectiveDate: '2026-05-01' }],
      rows: [
        row({ id: 'acq', amountEur: 75000, category: 'Purchase', subcategory: 'Purchase Contract', description: null, payer: null, payee: null }),
        row({ id: 'sale', amountEur: 20, category: 'Sale', subcategory: 'Sale Contract', description: null, payer: null, payee: null }),
        row({ id: 'pay', amountEur: 20, category: 'Sale', subcategory: 'Client Payment', description: 'תשלום', payer: 'Client', payee: 'Jacob' }),
      ],
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: 0,
        evidenceRef: 'sample',
        metadata: {},
      }],
    }))
    const text = [
      doc.properties[0].lines.map((line) => `${line.description} ${line.amount}`).join('\n'),
    ].join('\n')
    expect(text).not.toContain('75000')
    expect(forbiddenHits(text, ['75,000.00', 'RC3'])).toEqual([])
    expect(internalLeakHits(text)).toEqual([])
    expect(doc.closingDueToJj).toBe(-10)
    expect(doc.closingDirection).toBe('jj_owes_client')
  })

  test('internal recorder notes are replaced by the client category', () => {
    expect(clientDescription('Client Payment', 'יעקוב רשם שקיבל את כל הכסף')).toBe('תשלום על חשבון הרכישה')
    expect(clientDescription('Lock Replacement', 'החלפת מנעול')).toBe('החלפת מנעול')
  })
})
