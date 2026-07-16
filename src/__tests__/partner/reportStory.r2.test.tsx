/**
 * reportStory.r2.test.tsx — PR-R2 smoke tests
 *
 * Tests PropertyHealth, deriveHealthStatus, and BusinessStory.
 * Pattern: renderToStaticMarkup (same as R1 reportStory.test.tsx).
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PropertyHealth, deriveHealthStatus } from '@/components/partner/PropertyHealth'
import { BusinessStory } from '@/components/partner/BusinessStory'

// ─── PropertyHealth ───────────────────────────────────────────────────────────

describe('PropertyHealth', () => {
  it('renders PROPERTY STATUS label', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" />)
    expect(html).toContain('Property Status')
  })

  it('renders HealthSignal for healthy status', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" />)
    expect(html).toContain('data-testid="health-signal"')
    expect(html).toContain('Healthy')
    expect(html).toContain('green')
  })

  it('renders HealthSignal for attention status', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="attention" />)
    expect(html).toContain('Needs attention')
    expect(html).toContain('amber')
  })

  it('renders HealthSignal for urgent status', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="urgent" />)
    expect(html).toContain('Urgent')
    expect(html).toContain('red')
  })

  it('renders explanation when provided', () => {
    const html = renderToStaticMarkup(
      <PropertyHealth
        status="attention"
        explanation="Outstanding balance overdue 45 days."
      />,
    )
    expect(html).toContain('data-testid="property-health-explanation"')
    expect(html).toContain('Outstanding balance overdue 45 days.')
  })

  it('omits explanation when explanation is null', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" explanation={null} />)
    expect(html).not.toContain('data-testid="property-health-explanation"')
  })

  it('omits explanation when explanation is undefined', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" />)
    expect(html).not.toContain('data-testid="property-health-explanation"')
  })

  it('omits explanation when explanation is empty string — silence > placeholder', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" explanation="" />)
    expect(html).not.toContain('data-testid="property-health-explanation"')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" />)
    expect(html).toContain('data-testid="property-health"')
  })

  it('accepts className', () => {
    const html = renderToStaticMarkup(<PropertyHealth status="healthy" className="mt-6" />)
    expect(html).toContain('mt-6')
  })
})

// ─── deriveHealthStatus ───────────────────────────────────────────────────────

describe('deriveHealthStatus', () => {
  it('returns healthy when no alerts and balance is null', () => {
    expect(deriveHealthStatus({ currentBalanceEur: null })).toBe('healthy')
  })

  it('returns healthy when no alerts and balance is positive', () => {
    expect(deriveHealthStatus({ currentBalanceEur: 500 })).toBe('healthy')
  })

  it('returns healthy when balance is small negative (within threshold)', () => {
    expect(deriveHealthStatus({ currentBalanceEur: -50 })).toBe('healthy')
  })

  it('returns attention when balance overdue (< −100)', () => {
    expect(deriveHealthStatus({ currentBalanceEur: -200 })).toBe('attention')
  })

  it('returns attention at exact boundary (−101)', () => {
    expect(deriveHealthStatus({ currentBalanceEur: -101 })).toBe('attention')
  })

  it('returns healthy at −100 (boundary is exclusive)', () => {
    expect(deriveHealthStatus({ currentBalanceEur: -100 })).toBe('healthy')
  })

  it('returns urgent when hasOpenAlerts is true', () => {
    expect(deriveHealthStatus({ currentBalanceEur: null }, true)).toBe('urgent')
  })

  it('urgent takes precedence over attention when both conditions are true', () => {
    expect(deriveHealthStatus({ currentBalanceEur: -500 }, true)).toBe('urgent')
  })

  it('defaults hasOpenAlerts to false when omitted', () => {
    expect(deriveHealthStatus({ currentBalanceEur: null })).toBe('healthy')
  })
})

// ─── BusinessStory ────────────────────────────────────────────────────────────

describe('BusinessStory', () => {
  it('renders story text when provided', () => {
    const html = renderToStaticMarkup(
      <BusinessStory story="This month occupancy increased by 18% compared to last month." />,
    )
    expect(html).toContain('This month occupancy increased by 18%')
    expect(html).toContain('data-testid="business-story"')
    expect(html).toContain('data-testid="business-story-text"')
  })

  it('renders Business Update label', () => {
    const html = renderToStaticMarkup(<BusinessStory story="Income remained stable." />)
    expect(html).toContain('Business Update')
  })

  it('renders nothing when story is null — silence > placeholder', () => {
    const html = renderToStaticMarkup(<BusinessStory story={null} />)
    expect(html).toBe('')
  })

  it('renders nothing when story is undefined', () => {
    const html = renderToStaticMarkup(<BusinessStory />)
    expect(html).toBe('')
  })

  it('renders nothing when story is empty string', () => {
    const html = renderToStaticMarkup(<BusinessStory story="" />)
    expect(html).toBe('')
  })

  it('renders multi-sentence story', () => {
    const story =
      'This month occupancy increased by 18% compared to last month. ' +
      'Maintenance costs were higher than usual due to air-conditioning repairs. ' +
      'Income remained stable with 3 bookings totalling 22 nights.'
    const html = renderToStaticMarkup(<BusinessStory story={story} />)
    expect(html).toContain('occupancy increased')
    expect(html).toContain('air-conditioning repairs')
    expect(html).toContain('22 nights')
  })

  it('applies data-testid for QA targeting', () => {
    const html = renderToStaticMarkup(<BusinessStory story="Story text here." />)
    expect(html).toContain('data-testid="business-story"')
  })

  it('accepts className', () => {
    const html = renderToStaticMarkup(<BusinessStory story="Story." className="mt-4" />)
    expect(html).toContain('mt-4')
  })
})
