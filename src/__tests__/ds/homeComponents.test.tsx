/**
 * homeComponents.test.tsx — E3-A1 DS component smoke tests
 *
 * Tests DailyGreeting, HealthSignal, AllClearCard.
 * Uses renderToStaticMarkup — same pattern as e2Migration.test.tsx.
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DailyGreeting } from '@/components/ds'
import { HealthSignal } from '@/components/ds'
import { AllClearCard } from '@/components/ds'

// ─── DailyGreeting ─────────────────────────────────────────────────────────────────────────────

describe('DailyGreeting', () => {
  it('renders owner name with correct salutation for morning', () => {
    const html = renderToStaticMarkup(
      <DailyGreeting ownerName="Yossi" message="Business is running normally." timeOfDay="morning" />,
    )
    expect(html).toContain('Good morning')
    expect(html).toContain('Yossi')
    expect(html).toContain('Business is running normally.')
  })

  it('adapts salutation for evening', () => {
    const html = renderToStaticMarkup(
      <DailyGreeting ownerName="Yossi" message="Quiet evening." timeOfDay="evening" />,
    )
    expect(html).toContain('Good evening')
  })

  it('adapts salutation for night', () => {
    const html = renderToStaticMarkup(
      <DailyGreeting ownerName="Yossi" message="Late check." timeOfDay="night" />,
    )
    expect(html).toContain('Good night')
  })

  it('renders nothing when message is empty — silence > placeholder', () => {
    const html = renderToStaticMarkup(
      <DailyGreeting ownerName="Yossi" message="" timeOfDay="morning" />,
    )
    expect(html).toBe('')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(
      <DailyGreeting ownerName="Yossi" message="Normal." timeOfDay="midday" />,
    )
    expect(html).toContain('data-testid="daily-greeting"')
  })

  it('accepts className', () => {
    const html = renderToStaticMarkup(
      <DailyGreeting ownerName="Yossi" message="Normal." timeOfDay="morning" className="mt-8" />,
    )
    expect(html).toContain('mt-8')
  })
})

// ─── HealthSignal ────────────────────────────────────────────────────────────────────────────

describe('HealthSignal', () => {
  it('renders healthy status with green styling', () => {
    const html = renderToStaticMarkup(<HealthSignal status="healthy" />)
    expect(html).toContain('Healthy')
    expect(html).toContain('green')
    expect(html).toContain('role="status"')
  })

  it('renders attention status with amber styling', () => {
    const html = renderToStaticMarkup(<HealthSignal status="attention" />)
    expect(html).toContain('Needs attention')
    expect(html).toContain('amber')
  })

  it('renders urgent status with red styling', () => {
    const html = renderToStaticMarkup(<HealthSignal status="urgent" />)
    expect(html).toContain('Urgent')
    expect(html).toContain('red')
  })

  it('includes aria-label describing status for screen readers', () => {
    const html = renderToStaticMarkup(<HealthSignal status="healthy" />)
    expect(html).toContain('aria-label')
    expect(html).toContain('healthy')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(<HealthSignal status="healthy" />)
    expect(html).toContain('data-testid="health-signal"')
  })

  it('dot is aria-hidden (decorative)', () => {
    const html = renderToStaticMarkup(<HealthSignal status="urgent" />)
    expect(html).toContain('aria-hidden="true"')
  })
})

// ─── AllClearCard ────────────────────────────────────────────────────────────────────────────

describe('AllClearCard', () => {
  it('renders headline', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Nothing needs you right now." lines={[]} />,
    )
    expect(html).toContain('Nothing needs you right now.')
  })

  it('renders all supporting lines', () => {
    const html = renderToStaticMarkup(
      <AllClearCard
        headline="All clear."
        lines={[
          'Everything important has already been handled.',
          'There are no approvals waiting for you.',
          "AI completed today's routine work.",
        ]}
      />,
    )
    expect(html).toContain('Everything important has already been handled.')
    expect(html).toContain('There are no approvals waiting for you.')
    expect(html).toContain("AI completed today's routine work.")
  })

  it('renders emoji when provided', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} emoji="\u2615" />,
    )
    expect(html).toContain('\u2615')
  })

  it('does not render emoji section when omitted', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} />,
    )
    expect(html).not.toContain('\u2615')
  })

  it('has role=status for screen readers', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} />,
    )
    expect(html).toContain('role="status"')
  })

  it('has accessible aria-label', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} />,
    )
    expect(html).toContain('aria-label')
    expect(html).toContain('All clear')
  })

  it('has green visual theme — emotional resolution \ud83d\udfe2', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} />,
    )
    expect(html).toContain('green')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} />,
    )
    expect(html).toContain('data-testid="all-clear-card"')
  })

  it('handles empty lines array gracefully', () => {
    expect(() =>
      renderToStaticMarkup(<AllClearCard headline="Done." lines={[]} />),
    ).not.toThrow()
  })

  it('accepts className', () => {
    const html = renderToStaticMarkup(
      <AllClearCard headline="Done." lines={[]} className="mt-6" />,
    )
    expect(html).toContain('mt-6')
  })
})
