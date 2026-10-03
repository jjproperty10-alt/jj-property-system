/**
 * General client-report template.
 * Orit's certified figures stay REVIEW-6. Another client uses the same wording.
 * Grouping is a row tag, not an Orit id list.
 */
import { buildClientAccountReport } from '../buildClientAccountReport'
import { ClientAccountBlock, displayGroupsFromRowTags, face } from '../composeCertifiedAccount'
import { buildAssertionRegister, clientAccountPlainText } from '../gates'
import {
  balanceDirectionText,
  finalOpenBalanceDisplay,
  heroDirectionText,
  periodHeaderText,
  propertyBalanceResultLabel,
  propertyBridgeTitle,
  propertyPaymentsNote,
  settlementClosingDisplay,
} from '../presentation'
import { SECTION, term } from '../terminology'
import type { LedgerRow } from '../types'
import {
  DEEP_CLEAN,
  ELECTRICITY,
  PREPARATION_LABEL,
  SUPPLIES,
  dannyLeviFixture,
  mayaCohenFixture,
  oritReview6Fixture,
} from './fixtures/review6TemplateFixture'

describe('REVIEW-6 figures on the general template', () => {
  test('Orit opening, closing and direction match REVIEW-6', () => {
    const report = buildClientAccountReport(oritReview6Fixture())
    expect(report.gates.status).toBe('pass')
    const doc = report.document
    expect(doc.openingDueToJj).toBe(3322.52)
    expect(doc.closingDueToJj).toBe(552.52)
    expect(doc.closingDirection).toBe('client_owes_jj')
    expect(doc.properties).toHaveLength(1)
    expect(doc.properties[0].propertyName).toBe('Orit Rob Pingodes')
    expect(doc.properties[0].amountDueToJj).toBe(3322.52)
    expect(doc.settlementBridge.steps.map((step) => step.signedDueToJj)).toEqual([3322.52, -1770, -1000, 552.52])
    expect(heroDirectionText(doc.clientDisplayName, doc.closingDirection, doc.reportLanguage, doc.hebrewOwesForm)).toBe('אורית רוב חייבת ל־JJ.')
    expect(clientAccountPlainText(doc)).toContain('אורית רוב חייבת ל־JJ.')
    expect(settlementClosingDisplay(doc).map((row) => [row.label, row.signedDueToJj, row.result])).toEqual([
      ['יתרת הנכס לפני תשלומים כלליים', 3322.52, false],
      ['תשלום אפריל 2026', -1770, false],
      ['תשלום מאי 2026', -1000, false],
      ['יתרה לתשלום ל־JJ', 552.52, true],
    ])
    expect(propertyBridgeTitle(doc)).toBe('יתרת הנכס לפני תשלומים כלליים')
    expect(propertyBalanceResultLabel(doc)).toBe('יתרת הנכס לפני תשלומים כלליים')
    expect(finalOpenBalanceDisplay(doc)).toEqual({ label: 'היתרה הסופית', amount: 552.52, direction: 'client_owes_jj' })
    expect(propertyPaymentsNote(doc, '€552.52')).toBe('שני התשלומים מופחתים בגשר הסיכום. היתרה הסופית לתשלום היא €552.52.')
    expect(periodHeaderText('31.08.2026', '01.04.2026')).toBe('מתאריך 01.04.2026 עד תאריך 31.08.2026 כולל.')
    expect(doc.period).toEqual({ start: '2026-04-01', end: '2026-08-31' })

    const property = doc.properties[0]
    const shown = property.lines.filter((line) => line.sourceIds.includes(SUPPLIES) || line.sourceIds.includes(DEEP_CLEAN))
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({
      clientText: PREPARATION_LABEL,
      monthLabel: 'מאי 2026',
      amount: 181.08,
      sourceIds: [SUPPLIES, DEEP_CLEAN],
    })
    const electricity = property.lines.find((line) => line.sourceIds.includes(ELECTRICITY))
    expect(electricity).toMatchObject({ clientText: 'חשמל', amount: 183.35 })
    expect(property.lines.filter((line) => line.clientText.includes('אושרית'))).toHaveLength(0)

    const register = buildAssertionRegister(doc)
    const entry = register.find((item) => item.description === PREPARATION_LABEL)
    expect(entry?.sourceComponents).toEqual([
      { sourceId: SUPPLIES, amount: 61.08 },
      { sourceId: DEEP_CLEAN, amount: 120 },
    ])
  })

  test('a null client charge is flagged and a stored 0 is used as 0', () => {
    const row = { clientCharge: null, amountEur: 10 } as LedgerRow
    expect(face(row)).toEqual({ amount: 10, clientChargeDefaulted: true })
    expect(face({ ...row, clientCharge: 0, amountEur: 50 })).toEqual({ amount: 0, clientChargeDefaulted: false })
    expect(face({ ...row, clientCharge: 4, amountEur: 10 })).toEqual({ amount: 4, clientChargeDefaulted: false })

    const doc = buildClientAccountReport(oritReview6Fixture()).document
    const supplies = doc.properties[0].lines.find((line) => line.sourceIds.includes(SUPPLIES))
    expect(supplies?.clientChargeDefaulted).toBe(true)
    const internet = doc.properties[0].lines.find((line) => line.clientText === 'אינטרנט' && line.amount === 30)
    expect(internet?.clientChargeDefaulted).toBe(false)
    expect(clientAccountPlainText(doc)).toContain(term('chargeDefaulted'))
  })

  test('without the tag the same Orit rows stay separate', () => {
    const doc = buildClientAccountReport(oritReview6Fixture({ group: false, electricityLabel: false })).document
    const lines = doc.properties[0].lines.filter((line) => line.sourceIds.includes(SUPPLIES) || line.sourceIds.includes(DEEP_CLEAN))
    expect(lines.map((line) => [line.clientText, line.amount])).toEqual([
      ['חומרי ניקיון להכנת הנכס', 61.08],
      ['ניקיון הדירה יסודי', 120],
    ])
    const electricity = doc.properties[0].lines.find((line) => line.sourceIds.includes(ELECTRICITY))
    expect(electricity?.clientText).toBe('חשמל אושרית רוב פינגודס')
    expect(doc.openingDueToJj).toBe(3322.52)
    expect(doc.closingDueToJj).toBe(552.52)
    expect(doc.closingDirection).toBe('client_owes_jj')
  })

  test('omitting the gender keeps the masculine client verb', () => {
    const input = oritReview6Fixture({ group: true, electricityLabel: true })
    const { hebrewOwesForm: _omit, ...withoutGender } = input
    const doc = buildClientAccountReport(withoutGender).document
    expect(doc.hebrewOwesForm).toBeUndefined()
    expect(heroDirectionText(doc.clientDisplayName, doc.closingDirection, doc.reportLanguage, doc.hebrewOwesForm)).toBe('אורית רוב חייב ל־JJ.')
    expect(doc.closingDueToJj).toBe(552.52)
  })
})

describe('the template is not Orit-only', () => {
  test('Danny gets the payment bridge, a masculine hero, and his own tagged group', () => {
    const report = buildClientAccountReport(dannyLeviFixture())
    expect(report.gates.status).toBe('pass')
    const doc = report.document
    expect(doc.clientDisplayName).toBe('דני לוי')
    expect(doc.openingDueToJj).toBe(620)
    expect(doc.closingDueToJj).toBe(420)
    expect(doc.closingDirection).toBe('client_owes_jj')
    expect(heroDirectionText(doc.clientDisplayName, doc.closingDirection, 'he', doc.hebrewOwesForm)).toBe('דני לוי חייב ל־JJ.')
    expect(propertyBridgeTitle(doc)).toBe('יתרת הנכס לפני תשלומים כלליים')
    expect(propertyBalanceResultLabel(doc)).toBe('יתרת הנכס לפני תשלומים כלליים')
    expect(settlementClosingDisplay(doc).map((row) => [row.label, row.signedDueToJj, row.result])).toEqual([
      ['יתרת הנכס לפני תשלומים כלליים', 620, false],
      ['תשלום יולי 2026', -200, false],
      ['יתרה לתשלום ל־JJ', 420, true],
    ])
    expect(propertyPaymentsNote(doc, '€420.00')).toBe('התשלום מופחת בגשר הסיכום. היתרה הסופית לתשלום היא €420.00.')
    const garden = doc.properties[0].lines.filter((line) => line.sourceIds.includes('danny-garden-a') || line.sourceIds.includes('danny-garden-b'))
    expect(garden).toHaveLength(1)
    expect(garden[0]).toMatchObject({ clientText: 'גינון', amount: 120, clientChargeDefaulted: true })
    expect(doc.properties[0].lines.some((line) => line.amount === 50)).toBe(false)
    expect(periodHeaderText('31.08.2026', '01.05.2026')).toBe('מתאריך 01.05.2026 עד תאריך 31.08.2026 כולל.')
  })

  test('when JJ owes the owner the headline is JJ חייבת and the expense row keeps its sign', () => {
    const doc = buildClientAccountReport(mayaCohenFixture()).document
    expect(doc.openingDueToJj).toBe(-300)
    expect(doc.closingDueToJj).toBe(-300)
    expect(doc.closingDirection).toBe('jj_owes_client')
    expect(heroDirectionText(doc.clientDisplayName, doc.closingDirection, 'he', doc.hebrewOwesForm)).toBe('JJ חייבת למאיה כהן.')
    expect(balanceDirectionText(doc.clientDisplayName, doc.properties[0].direction, 'he', 'balance')).toBe('JJ חייבת למאיה כהן.')
    const setup = doc.properties[0].lines.find((line) => line.countedIn === 'setup')
    expect(setup).toMatchObject({ amount: 100, effect: 'charge', directionText: 'לתשלום ל־JJ.' })
    const credit = doc.properties[0].lines.find((line) => line.effect === 'credit')
    expect(credit?.amount).toBe(400)
    expect(credit?.directionText).toBe('זיכוי למאיה כהן.')
    expect(settlementClosingDisplay(doc).find((row) => row.result)?.label).toBe('JJ חייבת ללקוח')
  })

  test('cleaning rows without the tag are not merged, and a broken tag blocks', () => {
    const other: LedgerRow[] = [
      { id: 'c1', date: '2026-06-01', propertyName: 'Other', category: 'Airbnb', subcategory: 'Cleaning', description: 'ניקיון', payer: null, payee: null, amountEur: 10, clientCharge: 10, reviewStatus: 'active', isDeleted: false },
      { id: 'c2', date: '2026-06-02', propertyName: 'Other', category: 'Airbnb', subcategory: 'Cleaning', description: 'ניקיון', payer: null, payee: null, amountEur: 12, clientCharge: 12, reviewStatus: 'active', isDeleted: false },
    ]
    expect(displayGroupsFromRowTags(other)).toEqual([])
    expect(displayGroupsFromRowTags([
      { ...other[0], displayGroupKey: 'prep', displayGroupLabel: 'הכנה' },
    ])).toEqual([])
    expect(displayGroupsFromRowTags([
      { ...other[0], displayGroupKey: 'prep', displayGroupLabel: 'הכנה' },
      { ...other[1], displayGroupKey: 'prep', displayGroupLabel: 'הכנה' },
    ])).toEqual([{ sourceIds: ['c1', 'c2'], clientText: 'הכנה' }])
    expect(() => displayGroupsFromRowTags([
      { ...other[0], displayGroupKey: 'prep', displayGroupLabel: 'הכנה' },
      { ...other[1], displayGroupKey: 'prep', displayGroupLabel: 'אחר' },
    ])).toThrow(ClientAccountBlock)
  })
})
