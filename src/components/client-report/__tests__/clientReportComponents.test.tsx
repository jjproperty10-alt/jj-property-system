/**
 * Client-report presentation components — unit tests.
 *
 * Focus: components render the REAL DTO values they are given without altering
 * them (before/after value preservation), and the internal/client separation is
 * enforced. Uses react-test-renderer (repo convention; no Testing Library).
 * Fixtures are generic — NO Tamir figures, NO production data.
 */
import React from 'react'
import renderer from 'react-test-renderer'
import type { ClientDisplayRow } from '@/lib/report/clientRow'
import type { ReportScope } from '@/lib/report/reportScope'
import {
  ReportPeriodHeader,
  PropertySection,
  OpeningClosingBalance,
  TransactionDrilldown,
  SectionStatusBadge,
  ReportScopeSummary,
} from '../index'

// flatten all text in the tree
function flat(t: renderer.ReactTestRenderer): string {
  let s = ''
  const walk = (n: any) => {
    if (n == null) return
    if (typeof n === 'string' || typeof n === 'number') { s += ' ' + n; return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.children) walk(n.children)
  }
  walk(t.toJSON())
  return s
}
// find nodes by data-testid
function byTestId(t: renderer.ReactTestRenderer, id: string): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.props?.['data-testid'] === id) out.push(n)
    ;(n.children || []).forEach(walk)
  }
  const json = t.toJSON()
  ;(Array.isArray(json) ? json : [json]).forEach(walk)
  return out
}

describe('ReportPeriodHeader', () => {
  it('renders name and a resolved reporting period', () => {
    const tree = renderer.create(
      <ReportPeriodHeader reportingName="Example Villa" fromDate="2026-06-01" toDate="2026-08-31" generatedAt="2026-08-23T10:00:00Z" reportType="periodic" />,
    )
    const s = flat(tree)
    expect(s).toContain('Example Villa')
    expect(s).toContain('Jun')
    expect(s).toContain('Aug')
    expect(s).toContain('Periodic report')
  })

  it('shows "All dates" when no period is set', () => {
    const tree = renderer.create(
      <ReportPeriodHeader reportingName="Example Villa" fromDate={null} toDate={null} generatedAt="2026-08-23T10:00:00Z" reportType="full" />,
    )
    expect(flat(tree)).toContain('All dates')
  })
})

describe('PropertySection', () => {
  it('renders label and the exact totals passed (no recomputation)', () => {
    const tree = renderer.create(
      <PropertySection label="Rental" convention="owner_credit" totals={{ income: 1000, expenses: 250.5, bpo: 400 }} closingBalance={349.5} />,
    )
    expect(byTestId(tree, 'ps-label')[0].children.join('')).toBe('Rental')
    expect(flat(byTestIdTree(tree, 'ps-income'))).toContain('1,000.00')
    expect(flat(byTestIdTree(tree, 'ps-expenses'))).toContain('250.50')
    expect(flat(byTestIdTree(tree, 'ps-closing'))).toContain('349.50')
  })
})

// helper: wrap a found node back into something flat() can read
function byTestIdTree(t: renderer.ReactTestRenderer, id: string): any {
  const node = byTestId(t, id)[0]
  return { toJSON: () => node } as any
}

describe('OpeningClosingBalance', () => {
  it('shows opening + closing when opening is provided', () => {
    const tree = renderer.create(<OpeningClosingBalance opening={-748.83} periodActivity={2400} closing={1651.17} />)
    expect(byTestId(tree, 'ocb-opening').length).toBe(1)
    expect(flat(byTestIdTree(tree, 'ocb-opening'))).toContain('748.83')
    expect(flat(byTestIdTree(tree, 'ocb-closing'))).toContain('1,651.17')
  })

  it('hides opening (no fabricated value) when opening is null; still shows closing', () => {
    const tree = renderer.create(<OpeningClosingBalance opening={null} closing={500} />)
    expect(byTestId(tree, 'ocb-opening').length).toBe(0)
    expect(flat(byTestIdTree(tree, 'ocb-closing'))).toContain('500.00')
  })
})

describe('TransactionDrilldown', () => {
  const rows: ClientDisplayRow[] = [
    { id: 'a', date: '2026-06-16', client_amount: 1600, display_group: 'income', display_label: 'Rent Collected', account_type: 'rental', subcategory: 'rent' },
    { id: 'b', date: '2026-08-11', client_amount: 800, display_group: 'income', display_label: 'Rent Collected', account_type: 'rental', subcategory: 'rent' },
  ]
  it('renders one row per transaction with its amount', () => {
    const tree = renderer.create(<TransactionDrilldown rows={rows} defaultOpen />)
    expect(byTestId(tree, 'td-row').length).toBe(2)
    const s = flat(tree)
    expect(s).toContain('Rent Collected')
    expect(s).toContain('1,600.00')
    expect(s).toContain('800.00')
  })
  it('renders an empty state with zero rows', () => {
    const tree = renderer.create(<TransactionDrilldown rows={[]} />)
    expect(byTestId(tree, 'td-empty').length).toBe(1)
  })
})

describe('SectionStatusBadge — internal/client separation', () => {
  it('renders in internal mode', () => {
    const tree = renderer.create(<SectionStatusBadge status="not_certified" mode="internal" note="STR May–Aug open" />)
    expect(byTestId(tree, 'section-status-badge').length).toBe(1)
    expect(flat(tree)).toContain('Not certified')
  })
  it('renders NOTHING in client-facing mode (suppression)', () => {
    const tree = renderer.create(<SectionStatusBadge status="not_certified" mode="client" note="STR May–Aug open" />)
    expect(tree.toJSON()).toBeNull()
  })
})

describe('ReportScopeSummary', () => {
  it('describes a single-property scope and period', () => {
    const scope: ReportScope = { type: 'single_property', propertyName: 'Example Villa' }
    const tree = renderer.create(<ReportScopeSummary scope={scope} fromDate="2026-06-01" toDate="2026-08-31" />)
    const s = flat(tree)
    expect(s).toContain('Example Villa')
    expect(s).toContain('Jun')
  })
})
