/**
 * reportStory.r4.test.tsx
 * Partner Report Story — R4: Timeline + Settlement + What's Next
 *
 * Tests:
 *   HighlightTimeline  — 13
 *   SettlementCard     — 11
 *   NeedsAttentionItems —  5
 *   Total              — 29
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HighlightTimeline } from '@/components/partner/HighlightTimeline'
import { SettlementCard }    from '@/components/partner/SettlementCard'
import { NeedsAttentionItems } from '@/components/ds/NeedsAttentionItems'
import type {
  TimelineStatement,
  TimelineEvent,
  SettlementStatement,
} from '@/lib/lifecycle/partnerStatementTypes'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTimeline(overrides: Partial<TimelineStatement> = {}): TimelineStatement {
  return {
    events:               [],
    openVerificationTasks: 0,
    hasPendingDates:       false,
    ...overrides,
  }
}

let _eventSeq = 0
function makeEvent(
  overrides: Partial<TimelineEvent> & { title: string },
): TimelineEvent {
  const id = `evt-${++_eventSeq}`
  return {
    eventId:                  id,
    effectiveDate:            '2026-01-15',
    effectiveDateConfidence:  'confirmed',
    description:              null,
    amountEur:                null,
    partnerVisible:           true,
    status:                   'completed',
    ...overrides,
  }
}

function makeSettlement(currentBalanceEur: number | null): SettlementStatement {
  return {
    currentBalanceEur,
    totalDistributionsPaidEur: 0,
  }
}

// ─── HighlightTimeline ────────────────────────────────────────────────────────

describe('HighlightTimeline', () => {
  it('returns null when there are no partnerVisible events', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Internal', partnerVisible: false })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toBe('')
  })

  it('renders data-testid="highlight-timeline" when events exist', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Payment received' })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('data-testid="highlight-timeline"')
  })

  it('filters out non-partnerVisible events', () => {
    const timeline = makeTimeline({
      events: [
        makeEvent({ title: 'Visible',   partnerVisible: true }),
        makeEvent({ title: 'Internal',  partnerVisible: false }),
      ],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('Visible')
    expect(html).not.toContain('Internal')
  })

  it('shows max 8 events', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ title: `Event ${i + 1}` }),
    )
    const timeline = makeTimeline({ events })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    // Exactly 8 timeline-event markers
    const matches = html.match(/data-testid="timeline-event"/g) ?? []
    expect(matches).toHaveLength(8)
  })

  it('shows overflow count when more than 8 events', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ title: `Event ${i + 1}` }),
    )
    const timeline = makeTimeline({ events })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('data-testid="timeline-overflow"')
    expect(html).toContain('+2')
  })

  it('does not show overflow when exactly 8 events', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ title: `Event ${i + 1}` }),
    )
    const timeline = makeTimeline({ events })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).not.toContain('timeline-overflow')
  })

  it('renders each visible event with data-testid="timeline-event"', () => {
    const timeline = makeTimeline({
      events: [
        makeEvent({ title: 'First' }),
        makeEvent({ title: 'Second' }),
      ],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    const matches = html.match(/data-testid="timeline-event"/g) ?? []
    expect(matches).toHaveLength(2)
  })

  it('shows event title in rendered output', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Maintenance completed' })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('Maintenance completed')
  })

  it('shows event-amount when amountEur is not null', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Payment', amountEur: 1200 })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('data-testid="event-amount"')
  })

  it('does not render event-amount when amountEur is null', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Check-in', amountEur: null })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).not.toContain('event-amount')
  })

  it('null effectiveDate shows date-pending text', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Unsigned contract', effectiveDate: null })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('Date pending')
  })

  it('non-null effectiveDate is formatted in event-date span', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Payment', effectiveDate: '2026-01-03' })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    // Should contain formatted date (not raw ISO)
    expect(html).toContain('data-testid="event-date"')
    expect(html).not.toContain('2026-01-03')
  })

  it('Hebrew locale shows section label "מה קרה"', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Payment received' })],
    })
    const html = renderToStaticMarkup(
      <HighlightTimeline timeline={timeline} locale="he" />,
    )
    expect(html).toContain('מה קרה')
  })

  it('Hebrew locale null date shows "תאריך ממתין"', () => {
    const timeline = makeTimeline({
      events: [makeEvent({ title: 'Event', effectiveDate: null })],
    })
    const html = renderToStaticMarkup(
      <HighlightTimeline timeline={timeline} locale="he" />,
    )
    expect(html).toContain('תאריך ממתין')
    expect(html).not.toContain('Date pending')
  })

  // ── Date confidence indicator tests (visual semantics fix) ────────────────

  it('confirmed date shows green check indicator', () => {
    const timeline = makeTimeline({
      events: [makeEvent({
        title:                   'Payment received',
        effectiveDate:           '2026-01-15',
        effectiveDateConfidence: 'confirmed',
      })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('data-testid="event-confirmed-indicator"')
    expect(html).not.toContain('event-pending-indicator')
  })

  it('pending_verification date does not show green check indicator', () => {
    const timeline = makeTimeline({
      events: [makeEvent({
        title:                   'Entry',
        effectiveDate:           '2024-06-01',
        effectiveDateConfidence: 'pending_verification',
      })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).not.toContain('event-confirmed-indicator')
  })

  it('null effectiveDate does not show green check indicator', () => {
    const timeline = makeTimeline({
      events: [makeEvent({
        title:                   'Entry',
        effectiveDate:           null,
        effectiveDateConfidence: 'pending_verification',
      })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).not.toContain('event-confirmed-indicator')
  })

  it('pending_verification shows clock/pending indicator', () => {
    const timeline = makeTimeline({
      events: [makeEvent({
        title:                   'Entry',
        effectiveDate:           null,
        effectiveDateConfidence: 'pending_verification',
      })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('data-testid="event-pending-indicator"')
  })

  it('pending_verification indicator carries accessible pending label', () => {
    const timeline = makeTimeline({
      events: [makeEvent({
        title:                   'Entry',
        effectiveDate:           null,
        effectiveDateConfidence: 'pending_verification',
      })],
    })
    const html = renderToStaticMarkup(<HighlightTimeline timeline={timeline} />)
    expect(html).toContain('Date pending confirmation')
  })
})

// ─── SettlementCard ───────────────────────────────────────────────────────────

describe('SettlementCard', () => {
  it('returns null when currentBalanceEur === 0', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(0)} />,
    )
    expect(html).toBe('')
  })

  it('shows pending state when currentBalanceEur is null', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(null)} />,
    )
    expect(html).toContain('data-testid="settlement-pending"')
  })

  it('pending state shows pendingNote text', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(null)} />,
    )
    expect(html).toContain('next calculation')
  })

  it('positive balance shows data-testid="settlement-card"', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(2910)} />,
    )
    expect(html).toContain('data-testid="settlement-card"')
    expect(html).not.toContain('settlement-pending')
  })

  it('negative balance shows data-testid="settlement-card"', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(-85)} />,
    )
    expect(html).toContain('data-testid="settlement-card"')
  })

  it('positive balance shows receivable label', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(2910)} />,
    )
    expect(html).toContain('Ready to transfer')
    expect(html).not.toContain('Outstanding balance')
  })

  it('negative balance shows payable label', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(-85)} />,
    )
    expect(html).toContain('Outstanding balance')
    expect(html).not.toContain('Ready to transfer')
  })

  it('settlement-amount shows absolute value (no negative sign)', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(-85)} />,
    )
    expect(html).toContain('data-testid="settlement-amount"')
    // The rendered amount should be positive (abs value)
    expect(html).toContain('85')
    // Formatted as currency — should NOT contain minus directly adjacent to € and a digit
    // (Original broad regex /-.*€|€.*-/ falsely matched CSS class hyphens in the HTML)
    expect(html).not.toMatch(/€-\d|-\d+€/)
  })

  it('CTA button is always disabled (RC1 placeholder)', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(2910)} />,
    )
    expect(html).toContain('data-testid="settlement-cta"')
    expect(html).toContain('disabled')
  })

  it('negative balance CTA says "Review Details"', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(-85)} />,
    )
    expect(html).toContain('Review Details')
  })

  it('Hebrew locale shows pending note in Hebrew', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(null)} locale="he" />,
    )
    expect(html).toContain('תוצאות ההסדר')
    expect(html).not.toContain('next calculation')
  })

  it('Hebrew locale receivable shows "מוכן להעברה"', () => {
    const html = renderToStaticMarkup(
      <SettlementCard settlement={makeSettlement(2910)} locale="he" />,
    )
    expect(html).toContain('מוכן להעברה')
    expect(html).not.toContain('Ready to transfer')
  })
})

// ─── NeedsAttentionItems ──────────────────────────────────────────────────────

describe('NeedsAttentionItems', () => {
  it('renders data-testid="needs-attention-items"', () => {
    const html = renderToStaticMarkup(
      <NeedsAttentionItems items={['Approve invoice']} />,
    )
    expect(html).toContain('data-testid="needs-attention-items"')
  })

  it('renders each item with data-testid="attention-item"', () => {
    const items = ['Task A', 'Task B', 'Task C']
    const html  = renderToStaticMarkup(<NeedsAttentionItems items={items} />)
    const matches = html.match(/data-testid="attention-item"/g) ?? []
    expect(matches).toHaveLength(3)
  })

  it('truncates excess items to max 3', () => {
    const items = ['Task A', 'Task B', 'Task C', 'Task D', 'Task E']
    const html  = renderToStaticMarkup(<NeedsAttentionItems items={items} />)
    const matches = html.match(/data-testid="attention-item"/g) ?? []
    expect(matches).toHaveLength(3)
    expect(html).not.toContain('Task D')
    expect(html).not.toContain('Task E')
  })

  it('exactly 3 items — no truncation', () => {
    const items = ['Task A', 'Task B', 'Task C']
    const html  = renderToStaticMarkup(<NeedsAttentionItems items={items} />)
    expect(html).toContain('Task A')
    expect(html).toContain('Task B')
    expect(html).toContain('Task C')
  })

  it('Hebrew locale shows section label "מה הלאה"', () => {
    const html = renderToStaticMarkup(
      <NeedsAttentionItems items={['אשר חשבונית']} locale="he" />,
    )
    expect(html).toContain('מה הלאה')
  })
})
