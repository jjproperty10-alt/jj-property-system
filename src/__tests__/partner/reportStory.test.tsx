/**
 * reportStory.test.tsx — PR-R1 smoke tests
 *
 * Tests WelcomeHeader and ExecutiveSummary.
 * Pattern: renderToStaticMarkup (same as e2Migration and homeComponents tests).
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WelcomeHeader } from '@/components/partner/WelcomeHeader'
import { ExecutiveSummary, computeExecutiveKpis } from '@/components/partner/ExecutiveSummary'

// ─── WelcomeHeader ───────────────────────────────────────────────────────────

describe('WelcomeHeader', () => {
  it('renders owner first name', () => {
    const html = renderToStaticMarkup(
      <WelcomeHeader ownerName="Avi" propertyName="Villa Mazotos" period="January 2026" />,
    )
    expect(html).toContain('Hello Avi')
  })

  it('renders property name and period together', () => {
    const html = renderToStaticMarkup(
      <WelcomeHeader ownerName="Avi" propertyName="Villa Mazotos" period="January 2026" />,
    )
    expect(html).toContain('Villa Mazotos')
    expect(html).toContain('January 2026')
    expect(html).toContain('Villa Mazotos — January 2026')
  })

  it('shows Portfolio Summary when propertyName is null', () => {
    const html = renderToStaticMarkup(
      <WelcomeHeader ownerName="Oren" propertyName={null} period="Q1 2026" />,
    )
    expect(html).toContain('Portfolio Summary')
    expect(html).toContain('Q1 2026')
  })

  it('includes the trust subtitle lines', () => {
    const html = renderToStaticMarkup(
      <WelcomeHeader ownerName="Avi" propertyName={null} period="January 2026" />,
    )
    expect(html).toContain('simple summary')
    expect(html).toContain('verified transactions')
    expect(html).toContain('approved records')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(
      <WelcomeHeader ownerName="Avi" propertyName={null} period="January 2026" />,
    )
    expect(html).toContain('data-testid="welcome-header"')
  })

  it('accepts className', () => {
    const html = renderToStaticMarkup(
      <WelcomeHeader ownerName="Avi" propertyName={null} period="January 2026" className="mb-8" />,
    )
    expect(html).toContain('mb-8')
  })
})

// ─── ExecutiveSummary ────────────────────────────────────────────────────────

describe('ExecutiveSummary', () => {
  it('renders three financial KPI tiles', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={3420} expenses={510} netResult={2910} status="healthy" />,
    )
    expect(html).toContain('Income')
    expect(html).toContain('Expenses')
    expect(html).toContain('Net Result')
  })

  it('renders Business Status tile instead of Balance', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={3420} expenses={510} netResult={2910} status="healthy" />,
    )
    expect(html).toContain('Business Status')
    expect(html).not.toContain('Balance')
  })

  it('renders narrative sentence when income and netResult are available', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={3420} expenses={510} netResult={2910} status="healthy" />,
    )
    expect(html).toContain('data-testid="narrative-sentence"')
    expect(html).toContain('€3,420')
    expect(html).toContain('€2,910')
    expect(html).toContain('net result')
  })

  it('omits narrative sentence when income is null — silence > placeholder', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={null} expenses={null} netResult={null} status={null} />,
    )
    expect(html).not.toContain('data-testid="narrative-sentence"')
  })

  it('renders em dash for null amounts — P-ARCH-1', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={null} expenses={null} netResult={null} status="healthy" />,
    )
    // MoneyValue renders em dash for null
    expect(html).toContain('—')
  })

  it('shows net result in green for positive', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={3420} expenses={510} netResult={2910} status="healthy" />,
    )
    expect(html).toContain('text-green-700')
  })

  it('shows net result in red for negative', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={500} expenses={1500} netResult={-1000} status="attention" />,
    )
    expect(html).toContain('text-red-600')
  })

  it('hides Business Status tile when status is null', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={100} expenses={50} netResult={50} status={null} />,
    )
    expect(html).not.toContain('data-testid="kpi-business-status"')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSummary income={100} expenses={50} netResult={50} status="healthy" />,
    )
    expect(html).toContain('data-testid="executive-summary"')
  })
})

// ─── computeExecutiveKpis ────────────────────────────────────────────────────

describe('computeExecutiveKpis', () => {
  it('sums positive amounts as income', () => {
    const result = computeExecutiveKpis([
      { client_amount: 1200 },
      { client_amount: 800 },
      { client_amount: -200 },
    ])
    expect(result.income).toBe(2000)
    expect(result.expenses).toBe(200)
    expect(result.netResult).toBe(1800)
  })

  it('returns nulls for empty rows array', () => {
    const result = computeExecutiveKpis([])
    expect(result.income).toBeNull()
    expect(result.expenses).toBeNull()
    expect(result.netResult).toBeNull()
  })

  it('treats null client_amount as 0', () => {
    const result = computeExecutiveKpis([{ client_amount: null }, { client_amount: 500 }])
    expect(result.income).toBe(500)
    expect(result.expenses).toBe(0)
    expect(result.netResult).toBe(500)
  })

  it('handles all-expense case', () => {
    const result = computeExecutiveKpis([
      { client_amount: -100 },
      { client_amount: -50 },
    ])
    expect(result.income).toBe(0)
    expect(result.expenses).toBe(150)
    expect(result.netResult).toBe(-150)
  })
})
