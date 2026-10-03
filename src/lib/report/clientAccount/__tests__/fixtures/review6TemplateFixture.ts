/**
 * Fixture accounts for the general client-report template.
 * Numbers live here, in tests, not in the report runtime.
 * Display groups are row tags. They are not an Orit id list.
 */
import type { CertifiedCreditInput, CompositionInput, LedgerRow } from '../../types'

export const PREPARATION_LABEL = 'חומרי הכנה וניקיון יסודי'
export const PREPARATION_KEY = 'preparation-cleaning'
export const SUPPLIES = 'bbdaca28-734d-43b5-88b8-4b7ff61390dc'
export const DEEP_CLEAN = '2e5dcf81-edaa-4e7a-81b6-869f0c132892'
export const ELECTRICITY = 'dc4e1b6f-18fe-4c79-a5d2-5c90573bf6f9'

function payment(id: string, amount: number, date: string, source: string): CertifiedCreditInput {
  return {
    id,
    eventType: 'include_transaction_in_settlement',
    amount,
    effectiveDate: date,
    sourceTransactionId: source,
    currency: 'EUR',
    evidenceStatus: 'certified',
    inclusion: 'included',
  }
}

function baseRow(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'amountEur'>): LedgerRow {
  return {
    date: '2026-05-15',
    propertyName: 'Orit Rob Pingodes',
    category: 'Airbnb',
    subcategory: 'Cleaning',
    description: 'תיקון',
    payer: 'Client',
    payee: 'company',
    clientCharge: null,
    reviewStatus: 'active',
    isDeleted: false,
    ...partial,
  }
}

/** Orit period account whose certified opening, closing and direction match REVIEW-6. */
export function oritReview6Fixture(options: { group: boolean; electricityLabel: boolean } = { group: true, electricityLabel: true }): CompositionInput {
  const rows: LedgerRow[] = [
    baseRow({ id: 's1', date: '2026-04-27', amountEur: 6000, subcategory: 'Design', description: 'ריהוט' }),
    baseRow({
      id: SUPPLIES,
      date: '2026-05-15',
      amountEur: 61.08,
      description: 'cleaning supplies',
      ...(options.group ? { displayGroupKey: PREPARATION_KEY, displayGroupLabel: PREPARATION_LABEL } : {}),
    }),
    baseRow({
      id: DEEP_CLEAN,
      date: '2026-05-27',
      amountEur: 120,
      description: 'נקיון הדירה יסודי',
      ...(options.group ? { displayGroupKey: PREPARATION_KEY, displayGroupLabel: PREPARATION_LABEL } : {}),
    }),
    baseRow({ id: 's4', date: '2026-05-27', amountEur: 83.09, subcategory: 'Design Fee', description: 'הכנת הנכס' }),
    baseRow({ id: 'net-1', date: '2026-06-10', amountEur: 0, clientCharge: 30, subcategory: 'Internet', description: 'Internet' }),
    baseRow({ id: 'net-2', date: '2026-07-10', amountEur: 0, clientCharge: 30, subcategory: 'Internet', description: 'Internet' }),
    baseRow({ id: 'net-3', date: '2026-08-10', amountEur: 0, clientCharge: 30, subcategory: 'Internet', description: 'Internet' }),
    baseRow({ id: 'soft', date: '2026-08-31', amountEur: 0, clientCharge: 120, subcategory: 'Software/Hostaway', description: '1/6/26-31.8.26' }),
    baseRow({ id: 'hosp', date: '2026-08-31', amountEur: 0, clientCharge: 56, subcategory: 'Guest Service Expenses', description: 'CHECK IN 7' }),
    baseRow({
      id: ELECTRICITY,
      date: '2026-08-11',
      amountEur: 183.35,
      category: 'Management',
      subcategory: 'Electricity',
      description: 'חשמל אושרית רוב פינגודס',
      payer: 'Yossi',
      payee: 'JJ',
      ...(options.electricityLabel ? { clientLabel: 'חשמל' } : {}),
    }),
    baseRow({ id: 'p1', date: '2026-04-28', amountEur: 1770, subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' }),
    baseRow({ id: 'p2', date: '2026-05-06', amountEur: 1000, subcategory: 'Client Payment', description: 'שולם', payer: 'Owner', payee: 'JJ' }),
  ]
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'אורית רוב',
    reportTitle: 'סיכום חשבון לקוח לתקופה',
    reportType: 'period_account',
    period: { start: '2026-04-01', end: '2026-08-31' },
    openingDueToJj: 3322.52,
    closingDueToJj: 552.52,
    cashAllocationSignedTotal: 0,
    hebrewOwesForm: 'feminine',
    lines: [{
      lineOrder: 1,
      propertyKey: 'c74e3ff2-cf7c-477a-8dad-ac11e45540ba',
      propertyName: 'Orit Rob Pingodes',
      amountDueToJj: 3322.52,
      evidenceRef: 'ev',
      metadata: {
        str_credit: 3391,
        setup_expenses: 6264.17,
        setup_through: '2026-05-31',
        airbnb_opex_including_cleaning: 266,
        owner_charges: 183.35,
      },
    }],
    credits: [payment('ev-1', 1770, '2026-04-28', 'p1'), payment('ev-2', 1000, '2026-05-06', 'p2')],
    rows,
  }
}

/** A man, not Orit. Same template: property line, page-1 payment bridge, masculine direction. */
export function dannyLeviFixture(): CompositionInput {
  const rows: LedgerRow[] = [
    baseRow({
      id: 'danny-setup',
      date: '2026-05-10',
      amountEur: 500,
      propertyName: 'Danny Levi Flat',
      category: 'Management',
      subcategory: 'Design',
      description: 'ריהוט',
    }),
    baseRow({
      id: 'danny-garden-a',
      date: '2026-06-02',
      amountEur: 0,
      clientCharge: 40,
      propertyName: 'Danny Levi Flat',
      category: 'Management',
      subcategory: 'Garden',
      description: 'גינה',
      displayGroupKey: 'garden-work',
      displayGroupLabel: 'גינון',
    }),
    baseRow({
      id: 'danny-garden-b',
      date: '2026-06-18',
      amountEur: 80,
      clientCharge: null,
      propertyName: 'Danny Levi Flat',
      category: 'Management',
      subcategory: 'Garden',
      description: 'גינה',
      displayGroupKey: 'garden-work',
      displayGroupLabel: 'גינון',
    }),
    baseRow({
      id: 'danny-zero',
      date: '2026-06-20',
      amountEur: 50,
      clientCharge: 0,
      propertyName: 'Danny Levi Flat',
      category: 'Management',
      subcategory: 'Misc',
      description: 'אפס',
    }),
    baseRow({
      id: 'danny-pay',
      date: '2026-07-01',
      amountEur: 200,
      propertyName: 'Danny Levi Flat',
      category: 'Management',
      subcategory: 'Client Payment',
      description: 'שולם',
      payer: 'Owner',
      payee: 'JJ',
    }),
  ]
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'דני לוי',
    reportTitle: 'סיכום חשבון לקוח לתקופה',
    reportType: 'period_account',
    period: { start: '2026-05-01', end: '2026-08-31' },
    openingDueToJj: 620,
    closingDueToJj: 420,
    cashAllocationSignedTotal: 0,
    hebrewOwesForm: 'masculine',
    lines: [{
      lineOrder: 1,
      propertyKey: 'danny-flat',
      propertyName: 'Danny Levi Flat',
      amountDueToJj: 620,
      evidenceRef: 'ev-danny',
      metadata: {
        setup_expenses: 500,
        setup_through: '2026-05-31',
        owner_charges: 120,
      },
    }],
    credits: [payment('danny-ev', 200, '2026-07-01', 'danny-pay')],
    rows,
  }
}

/**
 * JJ owes this client. The balance headline says JJ חייבת.
 * The setup charge stays a positive expense. It is not sign-flipped.
 */
export function mayaCohenFixture(): CompositionInput {
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'מאיה כהן',
    reportTitle: 'סיכום חשבון לקוח לתקופה',
    reportType: 'period_account',
    period: { start: '2026-05-01', end: '2026-08-31' },
    openingDueToJj: -300,
    closingDueToJj: -300,
    cashAllocationSignedTotal: 0,
    hebrewOwesForm: 'feminine',
    lines: [{
      lineOrder: 1,
      propertyKey: 'maya-house',
      propertyName: 'Maya House',
      amountDueToJj: -300,
      evidenceRef: 'ev-maya',
      metadata: {
        setup_expenses: 100,
        setup_through: '2026-05-31',
        str_credit: 400,
      },
    }],
    credits: [],
    rows: [
      baseRow({
        id: 'maya-setup',
        date: '2026-05-12',
        amountEur: 100,
        propertyName: 'Maya House',
        category: 'Management',
        subcategory: 'Design',
        description: 'ריהוט',
      }),
    ],
  }
}
