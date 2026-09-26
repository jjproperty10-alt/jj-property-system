import { composeCertifiedClientAccount, ClientAccountBlock } from '../composeCertifiedAccount'
import { applicableSectionNames } from '../composeCertifiedAccount'
import { buildAssertionRegister, clientAccountPlainText, forbiddenHits, internalLeakHits } from '../gates'
import { allocateRentReceipts } from '../longTermRent'
import { heroDirectionText, monthLabelForRow, clientDescription, UNDATED_LABEL, dateColumnEdge, tableFlexDirection, monthYearLabel, propertyLayerSummaries } from '../presentation'
import { clientReportOutline } from '../../../pdf/ClientAccountPdf'
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
    expect(names).toEqual(['תקלות ותיקונים', 'גשר סגירה', 'מה נסגר ומה נשאר פתוח'])
    expect(doc.properties[0].lines.map((line) => line.section)).toEqual(['תקלות ותיקונים', 'תקלות ותיקונים'])
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
    expect(clientDescription('Client Payment', 'יעקוב רשם שקיבל', 'renovation-payment')).toBe('תשלום על חשבון השיפוץ')
    expect(clientDescription('Client Payment', 'הרצל', 'purchase-payment')).toBe('תשלום על חשבון הרכישה')
    expect(clientDescription('HOA', 'שולם ועד לסאן רייז — MCB-101 Aug+Sep 47.01+47.01=94.02')).toBe('ועד לסאן רייז, מכסה אוגוסט–ספטמבר')
    expect(clientDescription('Electricity', 'timer booster')).toBe('טיימר לדוד')
    expect(clientDescription('Guest Supplies', 'יין פלוס מים אירוח 20.7.25-31.12.25')).toBe('יין ומים אירוח 20.07.2025–31.12.2025')
    expect(clientDescription('Furniture', 'שולחן בר פלוס 2 כסאות')).toBe('שולחן בר פלוס 2 כסאות')
  })

  test('the date column sits on the right in Hebrew and on the left in English', () => {
    expect(dateColumnEdge('he')).toBe('right')
    expect(dateColumnEdge('en')).toBe('left')
    expect(tableFlexDirection('he')).toBe('row-reverse')
    expect(tableFlexDirection('en')).toBe('row')
    expect(monthYearLabel(2026, 5, 'he')).toBe('יוני 2026')
    expect(monthYearLabel(2026, 5, 'en')).toBe('June 2026')
    expect(monthLabelForRow('2026-06-16', null, 'en')).toBe('June 2026')
  })

  test('a renovation client payment keeps the certified renovation role', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: 15000,
      closingDueToJj: 15000,
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: 15000,
        evidenceRef: 'sample',
        metadata: {},
      }],
      rows: [
        row({ id: 'contract', amountEur: 40000, category: 'Renovation', subcategory: 'Renovation Contract', description: null, payer: null, payee: null }),
        row({ id: 'paid', amountEur: 25000, category: 'Renovation', subcategory: 'Client Payment', description: null, payer: 'Client', payee: 'Jacob' }),
      ],
    }))
    const payment = doc.properties[0].lines.find((line) => line.countedIn === 'renovation-payment')
    expect(payment?.description).toBe('תשלום על חשבון השיפוץ')
    expect(payment?.amount).toBe(25000)
    const summary = doc.properties[0].summaries.find((item) => item.kind === 'renovation')
    expect(summary).toMatchObject({ agreed: 40000, payments: 25000, ancillary: 0, balance: 15000, state: 'open' })
  })

  test('purchase payments that cover the price and ancillary charges are explained as closed', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: 0,
      closingDueToJj: 0,
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: 0,
        evidenceRef: 'sample',
        metadata: {},
      }],
      rows: [
        row({ id: 'sale', amountEur: 85, category: 'Sale', subcategory: 'Sale Contract', description: null, payer: null, payee: null }),
        row({ id: 'pay', amountEur: 91, category: 'Sale', subcategory: 'Client Payment', description: 'הרצל', payer: 'Client', payee: 'Jacob' }),
        row({ id: 'cost', amountEur: 6, category: 'Sale', subcategory: 'Client Sale Expenses', description: null, payer: 'Client', payee: null }),
      ],
    }))
    const summary = doc.properties[0].summaries[0]
    expect(summary).toMatchObject({ agreed: 85, payments: 85, ancillary: 6, balance: 0, state: 'closed' })
    expect(summary.explanation).toContain('יתרת מחיר הקנייה סגורה')
    expect(doc.properties[0].lines.find((line) => line.countedIn === 'purchase-payment')?.amount).toBe(85)
    expect(doc.properties[0].lines.filter((line) => line.countedIn === 'purchase-payment')).toHaveLength(1)
    expect(doc.properties[0].lines.find((line) => line.countedIn === 'purchase-cost')?.directionText).toBe('שולם מתוך סך התקבולים.')
    expect(doc.properties[0].lines.find((line) => line.countedIn === 'purchase-cost')?.statusLabel).toBe('שולם')
  })

  test('an owner transfer is described as already made', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: -10,
      closingDueToJj: -10,
      lines: [{
        lineOrder: 1,
        propertyKey: 'p1',
        propertyName: 'Sample House',
        amountDueToJj: -10,
        evidenceRef: 'sample',
        metadata: { rent_recognized: 20, owner_transfers: 10 },
      }],
      rows: [
        row({ id: 'rent', amountEur: 20, subcategory: 'Tenant Payment', description: 'rent' }),
        row({ id: 'owner', amountEur: 10, subcategory: 'Bank Payment to Owner', description: 'deposit to owner account' }),
      ],
    }))
    const transfer = doc.properties[0].lines.find((line) => line.countedIn === 'owner-payment')
    expect(transfer?.description).toBe('תשלום לבעלים')
    expect(transfer?.directionText).toBe('הועבר לבעלים')
    expect(doc.properties[0].bridge.find((step) => step.label === 'תשלומים שהועברו לבעלים')?.directionText).toBe('מפחית את יתרת הנכס')
  })

  test('a late lump rent receipt is allocated to the oldest open months', () => {
    const months = [7, 8, 9, 10, 11, 12, 1, 2, 3]
    const series = months.map((month, index) => row({
      id: `m${index}`,
      date: `${month >= 7 ? 2025 : 2026}-${String(month).padStart(2, '0')}-01`,
      amountEur: 500,
      subcategory: 'Tenant Payment',
      description: 'שכירות הדירה למטה',
      payer: 'Tenant',
    }))
    const views = allocateRentReceipts([
      ...series,
      row({
        id: 'lump',
        date: '2026-06-14',
        amountEur: 1500,
        subcategory: 'Tenant Payment',
        description: 'Monthly rent received from tenants occupying the unit previously used by Faby',
        payer: 'Tenant',
      }),
      row({
        id: 'staff',
        date: '2026-05-30',
        amountEur: 1000,
        subcategory: 'Staff Accommodation Rent',
        description: 'Staff accommodation rent adjustment for Fabi/Shifra, Apr–May 2026',
        payer: 'JJ',
      }),
    ], new Map([
      ...series.map((item) => [item.id, 'שכירות הדירה למטה'] as const),
      ['lump', 'שכירות'],
      ['staff', 'התאמת שכירות'],
    ]), 'he', new Set())
    const allocated = views.filter((view) => view.traceSourceId === 'lump')
    expect(allocated.map((view) => view.rentalLabel)).toEqual(['אפריל 2026', 'מאי 2026', 'יוני 2026'])
    expect(allocated.map((view) => view.status)).toEqual(['paid_late', 'paid_late', 'paid'])
    expect(allocated.reduce((sum, view) => sum + view.amount, 0)).toBe(1500)
    expect(allocated.filter((view) => view.sourceIds.includes('lump'))).toHaveLength(1)
    const staff = views.find((view) => view.traceSourceId === 'staff')
    expect(staff?.status).toBe('paid')
    expect(staff?.amount).toBe(1000)
    expect(staff?.rentalLabel).toBe('אפריל–מאי 2026')
  })

  test('an owner-approved rent receipt becomes two late months without a second cash line', () => {
    const views = allocateRentReceipts([
      row({ id: 'cash', date: '2026-06-16', amountEur: 1800, subcategory: 'Tenant Payment', description: 'kamares rent' }),
    ], new Map([['cash', 'שכירות']]), 'he', new Set(['cash']), new Map([
      ['cash', [{ year: 2026, month: 3 }, { year: 2026, month: 4 }]],
    ]))
    expect(views.map((view) => view.rentalLabel)).toEqual(['מרץ 2026', 'אפריל 2026'])
    expect(views.map((view) => view.amount)).toEqual([900, 900])
    expect(views.map((view) => view.status)).toEqual(['paid_late', 'paid_late'])
    expect(views.filter((view) => view.sourceIds.includes('cash'))).toHaveLength(1)
    expect(views.reduce((sum, view) => sum + view.amount, 0)).toBe(1800)
  })

  test('an owner description replaces an empty renovation label and the certified closing is unchanged', () => {
    const doc = composeCertifiedClientAccount(base({
      openingDueToJj: 117901.54,
      closingDueToJj: 48901.54,
      credits: [
        { id: 'sharon', eventType: 'noncash_settlement_credit', amount: 55000, effectiveDate: '2026-05-01' },
        { id: 'cash', eventType: 'include_transaction_in_settlement', amount: 14000, effectiveDate: '2026-08-05' },
      ],
      lines: [{
        lineOrder: 1,
        propertyKey: 'deben',
        propertyName: 'Uriel Debenhams',
        amountDueToJj: 117901.54,
        evidenceRef: 'sample',
        metadata: {},
      }],
      rows: [
        row({ id: 'reno', date: '2025-11-15', amountEur: 3800, propertyName: 'Uriel Debenhams', category: 'Renovation', subcategory: 'Renovation Contract', description: null }),
        row({ id: 'key', date: '2026-04-01', amountEur: 5.25, propertyName: 'Uriel Debenhams', subcategory: 'Key Duplication', description: 'key' }),
        row({ id: 'rest', date: '2026-01-01', amountEur: 114096.29, propertyName: 'Uriel Debenhams', subcategory: 'Repairs', description: 'עבודות' }),
      ],
      descriptionByRowId: { reno: 'עבודות צבע ושפכטל, קרמיקה והחלפת ברז במטבח' },
      renovationNoteByPropertyKey: {
        deben: 'שיפוץ הדירה לצורך הכנתה למכירה או להשכרה, הכולל עבודות צבע ושפכטל, קרמיקה והחלפת ברז במטבח.',
      },
    }))
    expect(doc.closingDueToJj).toBe(48901.54)
    expect(doc.properties.reduce((sum, property) => sum + property.amountDueToJj, 0)).toBe(117901.54)
    expect(doc.credits.map((credit) => credit.amount)).toEqual([55000, 14000])
    const reno = doc.properties[0].lines.find((line) => line.traceSourceId === 'reno')
    expect(reno?.description).toBe('עבודות צבע ושפכטל, קרמיקה והחלפת ברז במטבח')
    expect(reno?.monthLabel).toBe('נובמבר 2025')
    const key = doc.properties[0].lines.find((line) => line.traceSourceId === 'key')
    expect(key?.section).toBe('תקלות ותיקונים')
    expect(key?.description).toBe('שכפול מפתח')
    const text = clientAccountPlainText(doc)
    expect(text).not.toContain('259.02')
    expect(text).not.toContain('13,900')
    expect(text).not.toContain('הרצל')
    expect(text).not.toContain('50,701.54')
    expect(text).not.toContain('Efi Dekelia')
    expect(text).not.toContain('שליש')
    const note = 'שיפוץ הדירה לצורך הכנתה למכירה או להשכרה, הכולל עבודות צבע ושפכטל, קרמיקה והחלפת ברז במטבח.'
    expect(doc.properties[0].summaries.find((item) => item.kind === 'renovation')?.explanation).toBe(note)
    expect(text.split(note)).toHaveLength(2)
    expect(clientReportOutline(doc)).toEqual(['סיכום התחשבנות', 'Uriel Debenhams'])
    const layers = propertyLayerSummaries(doc.properties[0])
    expect(layers.map((layer) => layer.key)).toEqual(['renovation', 'operating', 'repairs', 'closing'])
    expect(layers.find((layer) => layer.key === 'purchase')).toBeUndefined()
    expect(layers.find((layer) => layer.key === 'closing')?.balance).toBe(117901.54)
    expect(layers.filter((layer) => layer.key !== 'closing').reduce((sum, layer) => sum + layer.balance, 0)).toBeCloseTo(117901.54, 2)
  })

  test('a generic Airbnb supply phrase becomes the approved fallback and a historical name must be explicit', () => {
    expect(clientDescription('Consumable Supplies', 'airbnb suply')).toBe('ציוד Airbnb')
    expect(clientDescription('Guest Supplies', 'kitchen suply')).toBe('ציוד מטבח')
    expect(clientDescription('Electrical Appliances', 'washing mashine')).toBe('מכונת כביסה')
    expect(clientDescription('Electrical Appliances', 'מנורות')).toBe('מנורות')
    expect(clientDescription('Electrical Appliances', 'מנורות')).not.toBe('מוצרי חשמל וציוד')
    expect(() => composeCertifiedClientAccount(base({
      linkedRowsByPropertyKey: { p1: [row({ id: 'efi', amountEur: 10, propertyName: 'Efi Dekelia', description: 'מנורות' })] },
    }))).toThrow(/explicit source-name/)
  })
})
