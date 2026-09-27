import { buildClientAccountReport } from '../buildClientAccountReport'
import { ClientAccountBlock, composeCertifiedClientAccount } from '../composeCertifiedAccount'
import { clientAccountPlainText } from '../gates'
import { UNDATED_LABEL, heroDirectionText, propertyLayerSummaries } from '../presentation'
import { FORBIDDEN_CLIENT_TERMS, SECTION, TERMS, displayWhitelistViolations } from '../terminology'
import type { CertifiedStrMonthlySection, CompositionInput, LedgerRow } from '../types'

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'amountEur'>): LedgerRow {
  return {
    date: '2026-03-15',
    propertyName: 'House A',
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

function line(propertyKey: string, propertyName: string, amountDueToJj: number, metadata: Record<string, unknown> = {}, lineOrder = 1) {
  return { lineOrder, propertyKey, propertyName, amountDueToJj, evidenceRef: `ev-${propertyKey}`, metadata }
}

function input(overrides: Partial<CompositionInput>): CompositionInput {
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'לקוח',
    reportTitle: TERMS.settlementSummary.he,
    openingDueToJj: 0,
    closingDueToJj: 0,
    cashAllocationSignedTotal: 0,
    lines: [],
    credits: [],
    rows: [],
    ...overrides,
  }
}

const monthly = (propertyKey: string, months: [string, number, number, number][]): CertifiedStrMonthlySection => ({
  unavailable: false,
  certificationId: '00000000-0000-4000-8000-000000000abc',
  entityId: '00000000-0000-4000-8000-000000000001',
  propertyId: propertyKey,
  propertyName: 'House A',
  periodStart: '2026-06-01',
  periodEnd: '2026-08-31',
  status: 'applied',
  totalOwnerNet: months.reduce((sum, month) => sum + month[3], 0),
  reconciliationStatus: 'exact',
  arithmeticEffectOnCertifiedClosing: 0,
  months: months.map(([monthStart, reservationCount, nights, ownerNet]) => ({
    monthStart,
    monthLabel: monthStart.slice(0, 7),
    reservationCount,
    reservationCountLabel: String(reservationCount),
    nights,
    nightsLabel: String(nights),
    ownerNet,
    componentReconciliationStatus: 'exact',
  })),
})

describe('universal client report engine', () => {
  test('1. a debit balance is shown as the client owing JJ', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 30,
      lines: [line('a', 'House A', 30)],
      rows: [row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' })],
    }))
    expect(document.closingDirection).toBe('client_owes_jj')
    expect(heroDirectionText(document.clientDisplayName, document.closingDirection)).toContain('חייב ל־JJ')
    expect(document.properties[0].lines[0].directionText).toBe(TERMS.payableToJj.he)
  })

  test('2. a credit balance is shown as JJ owing the client', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: -20, closingDueToJj: -20,
      lines: [line('a', 'House A', -20, { rent_recognized: 20 })],
      rows: [row({ id: 'r1', amountEur: 20, subcategory: 'Tenant Payment', description: 'שכירות', payer: 'Tenant' })],
    }))
    expect(document.closingDirection).toBe('jj_owes_client')
    expect(heroDirectionText(document.clientDisplayName, document.closingDirection)).toContain(TERMS.creditToClient.he)
    expect(document.properties[0].lines[0].effect).toBe('credit')
    expect(document.properties[0].direction).toBe('jj_owes_client')
  })

  test('3. a property that nets to zero is closed', () => {
    const { document } = buildClientAccountReport(input({
      lines: [line('a', 'House A', 0)],
      rows: [
        row({ id: 'sale', amountEur: 100, category: 'Sale', subcategory: 'Sale Contract', description: null, payer: null, payee: null }),
        row({ id: 'pay', amountEur: 100, category: 'Sale', subcategory: 'Client Payment', description: 'תשלום', payer: 'Client', payee: 'Jacob' }),
      ],
    }))
    expect(document.properties[0].direction).toBe('settled')
    expect(document.properties[0].summaries[0].state).toBe('closed')
    expect(propertyLayerSummaries(document.properties[0]).find((layer) => layer.key === 'closing')?.state).toBe('closed')
  })

  test('4. a property with a remaining balance is open', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 40, closingDueToJj: 40,
      lines: [line('a', 'House A', 40)],
      rows: [
        row({ id: 'sale', amountEur: 100, category: 'Sale', subcategory: 'Sale Contract', description: null, payer: null, payee: null }),
        row({ id: 'pay', amountEur: 60, category: 'Sale', subcategory: 'Client Payment', description: 'תשלום', payer: 'Client', payee: 'Jacob' }),
      ],
    }))
    expect(document.properties[0].summaries[0]).toMatchObject({ agreed: 100, payments: 60, balance: 40, state: 'open' })
    expect(document.properties[0].statusLines.some((status) => status.state === 'open')).toBe(true)
  })

  test('5. a client purchase is shown as the client purchase with its price as reference only', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 40, closingDueToJj: 40,
      lines: [line('a', 'House A', 40)],
      rows: [
        row({ id: 'sale', amountEur: 100, category: 'Sale', subcategory: 'Sale Contract', description: null, payer: null, payee: null }),
        row({ id: 'pay', amountEur: 60, category: 'Sale', subcategory: 'Client Payment', description: 'תשלום', payer: 'Client', payee: 'Jacob' }),
      ],
    }))
    const price = document.properties[0].lines.find((item) => item.countedIn === 'purchase-price')
    expect(price?.section).toBe(SECTION.purchase)
    expect(price?.effect).toBe('reference')
    expect(price?.directionText).toBe(TERMS.recorded.he)
  })

  test('6. an internal JJ acquisition never reaches the client account', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 30,
      lines: [line('a', 'House A', 30, { internal_jj_cost_id: 'jjcost' })],
      rows: [
        row({ id: 'acq', amountEur: 75000, category: 'Purchase', subcategory: 'Purchase Contract', description: null, payer: 'JJ', payee: null }),
        row({ id: 'jjcost', amountEur: 500, subcategory: 'Repairs', description: 'internal JJ cost' }),
        row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
      ],
    }))
    const text = clientAccountPlainText(document)
    expect(text).not.toContain('75,000')
    expect(text).not.toContain('500.00')
    expect(document.properties[0].lines.flatMap((item) => item.sourceIds)).toEqual(['r1'])
  })

  test('7. a cash payment is a credit and a charge is a charge, never mixed', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 15000, closingDueToJj: 15000,
      lines: [line('a', 'House A', 15000)],
      rows: [
        row({ id: 'contract', amountEur: 40000, category: 'Renovation', subcategory: 'Renovation Contract', description: null, payer: null, payee: null }),
        row({ id: 'paid', amountEur: 25000, category: 'Renovation', subcategory: 'Client Payment', description: null, payer: 'Client', payee: 'Jacob' }),
      ],
    }))
    const payment = document.properties[0].lines.find((item) => item.countedIn === 'renovation-payment')
    expect(payment?.effect).toBe('credit')
    expect(payment?.directionText).toBe(`${TERMS.creditToClient.he}.`)
    const contract = document.properties[0].lines.find((item) => item.countedIn === 'renovation-contract')
    expect(contract?.effect).toBe('reference')
  })

  test('8. a client-level offset reduces the closing once and is labelled as a credit', () => {
    const { document, gates } = buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 20,
      lines: [line('a', 'House A', 30)],
      credits: [{ id: 'c1', eventType: 'noncash_settlement_credit', amount: 10, effectiveDate: '2026-05-01' }],
      rows: [row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' })],
    }))
    expect(gates.status).toBe('pass')
    expect(document.credits[0]).toMatchObject({ amount: 10, label: TERMS.creditNoncash.he, dateRole: 'credit-event' })
    expect(document.closingDueToJj).toBe(20)
  })

  test('9. a missing property allocation blocks instead of inventing a value', () => {
    expect(() => buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 30,
      lines: [line('a', 'House A', 30)],
      rows: [row({ id: 'r1', amountEur: 25, subcategory: 'Plumber', description: 'צנרת' })],
    }))).toThrow(ClientAccountBlock)
    expect(() => buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 30,
      lines: [line('a', 'House A', 30, { garden_2: 'owner-certified' })],
      rows: [row({ id: 'r1', amountEur: 25, subcategory: 'Plumber', description: 'צנרת' })],
    }))).toThrow(ClientAccountBlock)
  })

  test('10. a multi-unit property shows one STR unit and one LTR unit that add up to the property', () => {
    const { document, gates } = buildClientAccountReport(input({
      openingDueToJj: -40, closingDueToJj: -40,
      lines: [line('a', 'House A', -40, { str_credit: 50, rental_credit: 20, airbnb_opex_excluding_str_tracked_cleaning: 30 })],
      rows: [
        row({ id: 'rent1', date: '2026-06-01', amountEur: 20, subcategory: 'Tenant Payment', description: 'שכירות', payer: 'Tenant' }),
        row({ id: 'net1', date: '2026-06-10', amountEur: 30, category: 'Airbnb', subcategory: 'Internet', description: 'אינטרנט' }),
      ],
    }))
    expect(gates.status).toBe('pass')
    expect(document.properties[0].units.map((unit) => unit.kind)).toEqual(['str', 'ltr'])
    expect(document.properties[0].units.map((unit) => unit.balanceDueToJj)).toEqual([-20, -20])
    expect(document.properties[0].units.reduce((sum, unit) => sum + unit.balanceDueToJj, 0)).toBe(document.properties[0].amountDueToJj)
  })

  test('11. a shared expense is counted once even when several rows describe it', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 25, closingDueToJj: 25,
      lines: [line('a', 'House A', 25)],
      rows: [
        row({ id: 'hoa', amountEur: 25, subcategory: 'HOA', description: 'ועד בית' }),
        row({ id: 'rev', amountEur: -25, subcategory: 'HOA', description: 'ועד בית' }),
        row({ id: 'again', amountEur: 25, subcategory: 'HOA', description: 'ועד בית' }),
      ],
    }))
    expect(document.properties[0].lines).toHaveLength(1)
    expect(document.properties[0].lines[0].amount).toBe(25)
    const shown = document.properties[0].lines.flatMap((item) => item.sourceIds)
    expect(new Set(shown).size).toBe(shown.length)
    expect(shown.length + document.omittedNetZeroSourceIds.length).toBeLessThanOrEqual(3)
  })

  test('12. a certified monthly STR table replaces the lump credit and reconciles to it', () => {
    const { document, gates } = buildClientAccountReport(input({
      openingDueToJj: -20, closingDueToJj: -20,
      lines: [line('a', 'House A', -20, { str_credit: 50, airbnb_opex_excluding_str_tracked_cleaning: 30 })],
      rows: [row({ id: 'net1', date: '2026-06-10', amountEur: 30, category: 'Airbnb', subcategory: 'Internet', description: 'אינטרנט' })],
      certifiedStrMonthlyByPropertyKey: { a: monthly('a', [['2026-06-01', 2, 7, 20], ['2026-07-01', 3, 11, 30]]) },
    }))
    expect(gates.status).toBe('pass')
    expect(document.properties[0].certifiedMonthlyStr?.months).toHaveLength(2)
    expect(document.properties[0].lines.some((item) => item.countedIn === 'str-credit')).toBe(false)
    expect(document.properties[0].certifiedMonthlyStr?.totalOwnerNet).toBe(50)
  })

  test('13. an STR total without an approved monthly split stays a single undated credit', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: -20, closingDueToJj: -20,
      lines: [line('a', 'House A', -20, { str_credit: 50, airbnb_opex_excluding_str_tracked_cleaning: 30 })],
      rows: [row({ id: 'net1', date: '2026-06-10', amountEur: 30, category: 'Airbnb', subcategory: 'Internet', description: 'אינטרנט' })],
    }))
    const credits = document.properties[0].lines.filter((item) => item.countedIn === 'str-credit')
    expect(credits).toHaveLength(1)
    expect(credits[0].monthLabel).toBe(UNDATED_LABEL)
    expect(credits[0].clientText).toBe(TERMS.strLumpDefault.he)
  })

  test('14. a long-term rent paid late shows the rental month and the payment month', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: -1500, closingDueToJj: -1500,
      lines: [line('a', 'House A', -1500, { rent_recognized: 1500 })],
      rows: [
        row({ id: 'm1', date: '2026-02-01', amountEur: 500, subcategory: 'Tenant Payment', description: 'שכירות', payer: 'Tenant' }),
        row({ id: 'm2', date: '2026-03-01', amountEur: 500, subcategory: 'Tenant Payment', description: 'שכירות', payer: 'Tenant' }),
        row({ id: 'late', date: '2026-06-14', amountEur: 500, subcategory: 'Tenant Payment', description: 'April rent', payer: 'Tenant' }),
      ],
    }))
    const late = document.properties[0].lines.find((item) => item.traceSourceId === 'late')
    expect(late?.paymentMonthLabel).toBe('יוני 2026')
    expect(late?.monthLabel).toBe('אפריל 2026')
    expect(late?.allocationRule).toBe('named-month')
  })

  test('15. a missing date is shown with the undated label and never invented', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 40, closingDueToJj: 40,
      lines: [line('a', 'House A', 40, { garden_2: 'owner-certified' })],
      rows: [row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' })],
      undatedChargeLabelByPropertyKey: { a: 'עבודת גינה' },
    }))
    const extra = document.properties[0].lines.find((item) => item.countedIn === 'undated-certified-charge')
    expect(extra?.monthLabel).toBe(UNDATED_LABEL)
    expect(extra?.amount).toBe(10)
    expect(extra?.sourceIds).toEqual([])
  })

  test('16. forbidden internal terminology is rejected by the whitelist', () => {
    for (const phrase of FORBIDDEN_CLIENT_TERMS) expect(displayWhitelistViolations(`יתרה ${phrase} לתשלום`).length).toBeGreaterThan(0)
    expect(displayWhitelistViolations('תיקון ששולם על ידי Jacob')).toEqual(['internal-identity'])
    expect(displayWhitelistViolations('ציוד Airbnb')).toEqual([])
    expect(displayWhitelistViolations(TERMS.clientOwesJj.he)).toEqual([])
    expect(() => buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 30,
      lines: [line('a', 'House A', 30)],
      rows: [row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת', payer: 'Anastasia' })],
      descriptionByRowId: { r1: 'תיקון RC3 FIFO' },
    }))).toThrow(/display-whitelist/)
  })

  test('17. category reconciliation: rows equal each category and the categories equal the property', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 55, closingDueToJj: 55,
      lines: [line('a', 'House A', 55)],
      rows: [
        row({ id: 'k', amountEur: 5, subcategory: 'Key Duplication', description: 'מפתח' }),
        row({ id: 'p', amountEur: 20, subcategory: 'Plumber', description: 'צנרת' }),
        row({ id: 'e', amountEur: 30, subcategory: 'Electricity', description: 'חשמל' }),
      ],
    }))
    const layers = propertyLayerSummaries(document.properties[0])
    expect(layers.find((layer) => layer.key === 'repairs')?.balance).toBe(25)
    expect(layers.find((layer) => layer.key === 'operating')?.balance).toBe(30)
    expect(layers.filter((layer) => layer.key !== 'closing').reduce((sum, layer) => sum + layer.balance, 0)).toBe(55)
  })

  test('18. property reconciliation: a property whose rows do not reach its certified balance blocks', () => {
    expect(() => buildClientAccountReport(input({
      openingDueToJj: 60, closingDueToJj: 60,
      lines: [line('a', 'House A', 30), line('b', 'House B', 30, {}, 2)],
      rows: [
        row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
        row({ id: 'r2', amountEur: 29, propertyName: 'House B', subcategory: 'Plumber', description: 'צנרת' }),
      ],
    }))).toThrow(/House B/)
  })

  test('19. client reconciliation: properties must add to the opening and credits must reach the closing', () => {
    expect(() => composeCertifiedClientAccount(input({
      openingDueToJj: 61, closingDueToJj: 61,
      lines: [line('a', 'House A', 30), line('b', 'House B', 30, {}, 2)],
      rows: [
        row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
        row({ id: 'r2', amountEur: 30, propertyName: 'House B', subcategory: 'Plumber', description: 'צנרת' }),
      ],
    }))).toThrow(/certified opening/)
    expect(() => composeCertifiedClientAccount(input({
      openingDueToJj: 60, closingDueToJj: 55,
      lines: [line('a', 'House A', 30), line('b', 'House B', 30, {}, 2)],
      credits: [{ id: 'c1', eventType: 'noncash_settlement_credit', amount: 10, effectiveDate: '2026-05-01' }],
      rows: [
        row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
        row({ id: 'r2', amountEur: 30, propertyName: 'House B', subcategory: 'Plumber', description: 'צנרת' }),
      ],
    }))).toThrow(/certified closing/)
  })

  test('20. a confirmed duplicate row is excluded and cannot be displayed', () => {
    const { document } = buildClientAccountReport(input({
      openingDueToJj: 30, closingDueToJj: 30,
      lines: [line('a', 'House A', 30)],
      rows: [
        row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
        row({ id: 'dup', amountEur: 30, subcategory: 'Plumber', description: 'צנרת', reviewStatus: 'confirmed_duplicate' }),
      ],
    }))
    expect(document.properties[0].lines.flatMap((item) => item.sourceIds)).toEqual(['r1'])
    expect(() => buildClientAccountReport(input({
      openingDueToJj: 60, closingDueToJj: 60,
      lines: [line('a', 'House A', 60)],
      rows: [
        row({ id: 'r1', amountEur: 30, subcategory: 'Plumber', description: 'צנרת' }),
        row({ id: 'dup', amountEur: 30, subcategory: 'Plumber', description: 'צנרת', reviewStatus: 'confirmed_duplicate' }),
      ],
    }))).toThrow(ClientAccountBlock)
  })

  test('Uriel-shaped regression: certified totals and closing are unchanged through the universal engine', () => {
    const { document, gates } = buildClientAccountReport(input({
      clientDisplayName: 'אוריאל',
      reportTitle: 'סיכום חשבון לקוח מלא',
      openingDueToJj: 117901.54,
      closingDueToJj: 48901.54,
      credits: [
        { id: 'sharon', eventType: 'noncash_settlement_credit', amount: 55000, effectiveDate: '2026-05-01' },
        { id: 'cash', eventType: 'include_transaction_in_settlement', amount: 14000, effectiveDate: '2026-08-05' },
      ],
      creditLabels: { noncash: 'זיכוי שרון — ללא מזומן', cash: 'תשלום כללי' },
      lines: [line('deben', 'Uriel Debenhams', 117901.54)],
      rows: [
        row({ id: 'reno', date: '2025-11-15', amountEur: 3800, propertyName: 'Uriel Debenhams', category: 'Renovation', subcategory: 'Renovation Contract', description: null }),
        row({ id: 'key', date: '2026-04-01', amountEur: 5.25, propertyName: 'Uriel Debenhams', subcategory: 'Key Duplication', description: 'key' }),
        row({ id: 'rest', date: '2026-01-01', amountEur: 114096.29, propertyName: 'Uriel Debenhams', subcategory: 'Repairs', description: 'עבודות' }),
      ],
      descriptionByRowId: { reno: 'עבודות צבע ושפכטל, קרמיקה והחלפת ברז במטבח' },
    }))
    expect(gates.status).toBe('pass')
    expect(document.openingDueToJj).toBe(117901.54)
    expect(document.credits.map((credit) => credit.amount)).toEqual([55000, 14000])
    expect(document.closingDueToJj).toBe(48901.54)
    expect(document.closingDirection).toBe('client_owes_jj')
    expect(document.reportType).toBe('full_account')
    expect(document.period).toBeNull()
    expect(document.currency).toBe('EUR')
    expect(document.evidenceStatus).toBe('certified')
  })
})
