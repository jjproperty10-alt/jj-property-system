/**
 * JJ Design System 2035 -- Component Tests
 *
 * Test environment: node (jest.config.ts testEnvironment: 'node')
 * Rendering strategy: react-dom/server renderToStaticMarkup
 * - Works without jsdom
 * - Produces HTML string for assertion
 * - Sufficient for verifying output, text content, and attribute presence
 *
 * These tests verify:
 * 1. Null-safety rules (P-ARCH-1: Unknown = em dash, never 0 or placeholder)
 * 2. Status badge always has text (accessibility: never color-only)
 * 3. AiActivityCard: pending_approval is never shown as completed/green
 * 4. LTR isolation on financial values
 * 5. Token shape integrity
 *
 * Assertion style note:
 * Use tag-anchored patterns (/>value</) when checking that a string does NOT
 * appear as TEXT content, so Tailwind class names like "text-gray-400" (which
 * contains "0") do not cause false negatives on content assertions.
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Components under test
import { MoneyValue }      from '@/components/ds/MoneyValue'
import { UnknownValue }    from '@/components/ds/UnknownValue'
import { StatusBadge }     from '@/components/ds/StatusBadge'
import { KpiCard }         from '@/components/ds/KpiCard'
import { EmptyState }      from '@/components/ds/EmptyState'
import { AttentionBanner } from '@/components/ds/AttentionBanner'
import { AiActivityCard }  from '@/components/ds/AiActivityCard'
import { DataTable }       from '@/components/ds/DataTable'

// Token exports
import {
  JJ_COLORS,
  JJ_RADIUS,
  JJ_SHADOWS,
  STATUS_CLASSES,
  AI_ACTIVITY_CLASSES,
  MONEY_SIZE_CLASSES,
  PAGE_MAX_WIDTH,
} from '@/lib/ds/tokens'

// ── Utility ───────────────────────────────────────────────────────────────────

/** Render a React element to HTML string for assertion. */
function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

// ── MoneyValue ────────────────────────────────────────────────────────────────

describe('MoneyValue', () => {
  it('renders null as em dash, not "0" or "null" in text content', () => {
    const html = render(<MoneyValue amount={null} />)
    // em dash character (U+2014) or its HTML entity &#8212;
    expect(html).toMatch(/&#8212;|—/)
    // Tag-anchored: class names like "text-gray-400" contain "0" but the
    // text node between tags must never be "0" or "null"
    expect(html).not.toMatch(/>0</)
    expect(html).not.toMatch(/>null</)
  })

  it('renders a positive EUR amount as a formatted string', () => {
    const html = render(<MoneyValue amount={50000} />)
    // Should contain the numeric value (formatted)
    expect(html).toContain('50')
    expect(html).toContain('000')
    // Should NOT be an em dash
    expect(html).not.toMatch(/&#8212;|—/)
  })

  it('renders zero as a formatted value (zero is a valid amount)', () => {
    const html = render(<MoneyValue amount={0} />)
    // 0 is a real value -- render it, do not substitute em dash
    expect(html).toContain('0')
    expect(html).not.toMatch(/&#8212;|—/)
  })

  it('has dir="ltr" on the value span (RTL-safe isolation)', () => {
    const html = render(<MoneyValue amount={1234} />)
    expect(html).toContain('dir="ltr"')
  })

  it('null value does NOT have dir="ltr" (em dash is directionally neutral)', () => {
    const html = render(<MoneyValue amount={null} />)
    // The null path renders an em dash without dir attribute
    expect(html).not.toContain('dir="ltr"')
  })

  it('respects the size prop by applying the correct class', () => {
    const htmlSm = render(<MoneyValue amount={100} size="sm" />)
    const htmlXl = render(<MoneyValue amount={100} size="xl" />)
    expect(htmlSm).toContain('text-sm')
    expect(htmlXl).toContain('text-3xl')
  })
})

// ── UnknownValue ──────────────────────────────────────────────────────────────

describe('UnknownValue', () => {
  it('always renders an em dash', () => {
    const html = render(<UnknownValue />)
    expect(html).toMatch(/&#8212;|—/)
  })

  it('has aria-label="Value unknown" when no reason given', () => {
    const html = render(<UnknownValue />)
    expect(html).toContain('aria-label="Value unknown"')
  })

  it('includes the reason in aria-label when provided', () => {
    const html = render(<UnknownValue reason="Pending Settlement Engine" />)
    expect(html).toContain('Pending Settlement Engine')
    expect(html).toContain('aria-label')
  })

  it('never renders "0", "null", or "undefined" as content', () => {
    const html = render(<UnknownValue />)
    expect(html).not.toContain('>0<')
    expect(html).not.toContain('>null<')
    expect(html).not.toContain('>undefined<')
  })
})

// ── StatusBadge ───────────────────────────────────────────────────────────────

describe('StatusBadge', () => {
  const statuses = [
    'active', 'pending', 'confirmed', 'attention', 'critical', 'unknown', 'completed',
  ] as const

  statuses.forEach((status) => {
    it(`renders label text for status="${status}" (not color-only)`, () => {
      const label = `Status ${status}`
      const html = render(<StatusBadge status={status} label={label} />)
      expect(html).toContain(label)
    })
  })

  it('renders a role="status" attribute for accessibility', () => {
    const html = render(<StatusBadge status="active" label="Active" />)
    expect(html).toContain('role="status"')
  })

  it('renders an icon when provided', () => {
    const html = render(
      <StatusBadge status="attention" label="Needs Review" icon={<span>!</span>} />
    )
    expect(html).toContain('!')
    expect(html).toContain('Needs Review')
  })
})

// ── KpiCard ───────────────────────────────────────────────────────────────────

describe('KpiCard', () => {
  it('renders the label', () => {
    const html = render(<KpiCard label="Total Paid" value="EUR 50,000" />)
    expect(html).toContain('Total Paid')
  })

  it('renders the value', () => {
    const html = render(<KpiCard label="Total Paid" value="EUR 50,000" />)
    expect(html).toContain('EUR 50,000')
  })

  it('renders a loading skeleton when loading=true (no value text)', () => {
    const html = render(<KpiCard label="Total Paid" value="EUR 50,000" loading={true} />)
    expect(html).toContain('animate-pulse')
    // The value itself should not appear in the DOM during loading
    expect(html).not.toContain('EUR 50,000')
  })

  it('renders trend content when provided', () => {
    const html = render(
      <KpiCard label="Revenue" value="EUR 10,000" trend={<span>+5%</span>} />
    )
    expect(html).toContain('+5%')
  })
})

// ── EmptyState ────────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders the title', () => {
    const html = render(<EmptyState title="No transactions recorded yet." />)
    expect(html).toContain('No transactions recorded yet.')
  })

  it('renders description when provided', () => {
    const html = render(
      <EmptyState
        title="No events"
        description="Events will appear once the lifecycle begins."
      />
    )
    expect(html).toContain('Events will appear once the lifecycle begins.')
  })

  it('renders action when provided', () => {
    const html = render(
      <EmptyState title="No data" action={<button>Add entry</button>} />
    )
    expect(html).toContain('Add entry')
  })

  it('has role="status" for screen reader announcement', () => {
    const html = render(<EmptyState title="No data" />)
    expect(html).toContain('role="status"')
  })
})

// ── AttentionBanner ───────────────────────────────────────────────────────────

describe('AttentionBanner', () => {
  it('renders the title', () => {
    const html = render(<AttentionBanner type="info" title="3 dates to confirm" />)
    expect(html).toContain('3 dates to confirm')
  })

  it('renders description when provided', () => {
    const html = render(
      <AttentionBanner
        type="warning"
        title="Action required"
        description="Please review before continuing."
      />
    )
    expect(html).toContain('Please review before continuing.')
  })

  it('has role="alert" for error type', () => {
    const html = render(<AttentionBanner type="error" title="Critical error" />)
    expect(html).toContain('role="alert"')
  })

  it('has role="alert" for warning type', () => {
    const html = render(<AttentionBanner type="warning" title="Warning" />)
    expect(html).toContain('role="alert"')
  })

  it('has role="status" for info type', () => {
    const html = render(<AttentionBanner type="info" title="Info message" />)
    expect(html).toContain('role="status"')
  })

  it('has role="status" for success type', () => {
    const html = render(<AttentionBanner type="success" title="Done" />)
    expect(html).toContain('role="status"')
  })
})

// ── AiActivityCard ────────────────────────────────────────────────────────────

describe('AiActivityCard', () => {
  it('renders the action text', () => {
    const html = render(
      <AiActivityCard action="Synced 589 reservations from Hostaway" status="completed" />
    )
    expect(html).toContain('Synced 589 reservations from Hostaway')
  })

  it('status=pending_approval does NOT render as completed (no emerald class)', () => {
    const html = render(
      <AiActivityCard action="Proposed property mapping" status="pending_approval" />
    )
    // The badge class for pending_approval must be amber, not emerald
    const { badge } = AI_ACTIVITY_CLASSES['pending_approval']
    expect(badge).toContain('amber')
    expect(badge).not.toContain('emerald')
    // The rendered HTML badge text should say "Pending Approval", not "Completed"
    expect(html).toContain('Pending Approval')
    expect(html).not.toContain('>Completed<')
  })

  it('status=pending_approval shows the human-approval note', () => {
    const html = render(
      <AiActivityCard action="Proposed mapping" status="pending_approval" />
    )
    expect(html).toContain('Human approval required')
  })

  it('status=completed does NOT show the human-approval note', () => {
    const html = render(
      <AiActivityCard action="Migration applied" status="completed" />
    )
    expect(html).not.toContain('Human approval required')
  })

  it('status=blocked does NOT show the human-approval note', () => {
    const html = render(
      <AiActivityCard action="Blocked action" status="blocked" />
    )
    expect(html).not.toContain('Human approval required')
  })

  it('renders source and timestamp when provided', () => {
    const html = render(
      <AiActivityCard
        action="Sync completed"
        status="completed"
        source="PMS Connector"
        timestamp="2026-07-10 14:32"
      />
    )
    expect(html).toContain('PMS Connector')
    expect(html).toContain('2026-07-10 14:32')
  })
})

// ── DataTable ─────────────────────────────────────────────────────────────────

describe('DataTable', () => {
  const columns = [
    { key: 'date',   label: 'Date',        dir: 'ltr' as const },
    { key: 'desc',   label: 'Description' },
    { key: 'amount', label: 'Amount', align: 'right' as const, dir: 'ltr' as const },
  ]

  const rows = [
    { date: '2026-01-15', desc: 'Management Fee', amount: 'EUR 1,000' },
    { date: '2026-02-01', desc: 'Cleaning',        amount: 'EUR 150'  },
  ]

  it('renders all column headers', () => {
    const html = render(<DataTable columns={columns} rows={rows} />)
    expect(html).toContain('Date')
    expect(html).toContain('Description')
    expect(html).toContain('Amount')
  })

  it('renders row data', () => {
    const html = render(<DataTable columns={columns} rows={rows} />)
    expect(html).toContain('Management Fee')
    expect(html).toContain('EUR 1,000')
    expect(html).toContain('Cleaning')
  })

  it('renders "No data" for empty rows', () => {
    const html = render(<DataTable columns={columns} rows={[]} />)
    expect(html).toContain('No data')
  })

  it('applies dir="ltr" to financial columns', () => {
    const html = render(<DataTable columns={columns} rows={rows} />)
    // At least one ltr dir attribute present on cells
    expect(html).toContain('dir="ltr"')
  })
})

// ── Token Integrity ───────────────────────────────────────────────────────────

describe('Token exports', () => {
  it('JJ_COLORS has expected navy value', () => {
    expect(JJ_COLORS.navy).toBe('#0f1729')
  })

  it('JJ_COLORS has expected positive color', () => {
    expect(JJ_COLORS.positive).toBe('#059669')
  })

  it('JJ_COLORS has expected critical color', () => {
    expect(JJ_COLORS.critical).toBe('#e11d48')
  })

  it('JJ_COLORS has expected pending color', () => {
    expect(JJ_COLORS.pending).toBe('#7c3aed')
  })

  it('JJ_RADIUS has all required keys', () => {
    expect(JJ_RADIUS.sm).toBeDefined()
    expect(JJ_RADIUS.md).toBeDefined()
    expect(JJ_RADIUS.lg).toBeDefined()
    expect(JJ_RADIUS.xl).toBeDefined()
    expect(JJ_RADIUS.full).toBe('9999px')
  })

  it('JJ_SHADOWS has sm/md/lg', () => {
    expect(JJ_SHADOWS.sm).toBeDefined()
    expect(JJ_SHADOWS.md).toBeDefined()
    expect(JJ_SHADOWS.lg).toBeDefined()
  })

  it('STATUS_CLASSES covers all 7 statuses', () => {
    const required = ['active', 'pending', 'confirmed', 'attention', 'critical', 'unknown', 'completed']
    required.forEach((s) => {
      expect(STATUS_CLASSES).toHaveProperty(s)
    })
  })

  it('AI_ACTIVITY_CLASSES: pending_approval is not emerald (never green)', () => {
    const { badge } = AI_ACTIVITY_CLASSES.pending_approval
    expect(badge).not.toContain('emerald')
    expect(badge).not.toContain('green')
  })

  it('AI_ACTIVITY_CLASSES: completed is emerald', () => {
    const { badge } = AI_ACTIVITY_CLASSES.completed
    expect(badge).toContain('emerald')
  })

  it('MONEY_SIZE_CLASSES has all 4 sizes', () => {
    expect(MONEY_SIZE_CLASSES.sm).toBeDefined()
    expect(MONEY_SIZE_CLASSES.md).toBeDefined()
    expect(MONEY_SIZE_CLASSES.lg).toBeDefined()
    expect(MONEY_SIZE_CLASSES.xl).toBeDefined()
  })

  it('PAGE_MAX_WIDTH has all 4 variants', () => {
    expect(PAGE_MAX_WIDTH.md).toBeDefined()
    expect(PAGE_MAX_WIDTH.lg).toBeDefined()
    expect(PAGE_MAX_WIDTH.xl).toBeDefined()
    expect(PAGE_MAX_WIDTH.full).toBeDefined()
  })
})
