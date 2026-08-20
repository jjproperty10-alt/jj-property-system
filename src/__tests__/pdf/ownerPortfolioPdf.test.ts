/**
 * G1 — Full Owner Report PDF composition (deterministic structural tests).
 * No visual rendering — asserts the Document page composition directly.
 */
import React from 'react'
import { OwnerPortfolioPdf, OwnerSettlementPdfV3 } from '@/lib/pdf/OwnerSettlementPdfV3'
import type { RC3PropertyReport, RC3AccountSection, RC3AccountType, BalanceConvention } from '@/lib/report/types'

function section(t: RC3AccountType, bal: number, conv: BalanceConvention): RC3AccountSection {
  return { account_type: t, account_label: t, account_label_he: t, balance_convention: conv,
    opening_balance: 0, rows: [], contract_baseline: 0, total_income: 0, total_expenses: 0,
    total_bpo: 0, closing_balance: bal } as RC3AccountSection
}
function report(name: string, accounts: RC3AccountSection[]): RC3PropertyReport {
  return { reporting_name: name, from_date: null, to_date: null, generated_at: '2026-01-01T00:00:00Z', accounts,
    has_purchase: false, has_sale: false, has_renovation: false,
    has_rental: true, has_airbnb: false }
}

describe('G1 — Full Owner Report PDF composition', () => {
  const a = report('Villa A', [section('rental', 1000, 'owner_credit')])
  const b = report('Flat B', [section('rental', 300, 'owner_credit')])
  const c = report('Studio C', [section('airbnb', 500, 'owner_credit')])

  test('multi-property portfolio = Owner Summary page + one page per property', () => {
    const doc: any = OwnerPortfolioPdf({ reports: [a, b, c], lang: 'en' })
    const pages = React.Children.toArray(doc.props.children)
    expect(pages.length).toBe(4) // 1 summary + 3 property pages
  })

  test('single-property portfolio = no separate Owner Summary page', () => {
    const doc: any = OwnerPortfolioPdf({ reports: [a], lang: 'en' })
    expect(React.Children.toArray(doc.props.children).length).toBe(1)
  })

  test('single-property document unchanged (one property page)', () => {
    const doc: any = OwnerSettlementPdfV3({ report: a, lang: 'en' })
    expect(React.Children.toArray(doc.props.children).length).toBe(1)
  })

  test('Hebrew portfolio composes the same page count (RTL handled per-page)', () => {
    const doc: any = OwnerPortfolioPdf({ reports: [a, b], lang: 'he' })
    expect(React.Children.toArray(doc.props.children).length).toBe(3)
  })
})
