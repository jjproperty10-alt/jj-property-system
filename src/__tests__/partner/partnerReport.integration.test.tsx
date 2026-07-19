/**
 * partnerReport.integration.test.tsx
 * Integration tests: PartnerReport wiring of R4 components
 * (HighlightTimeline, SettlementCard, NeedsAttentionItems)
 *
 * Tests: 8
 * Verifies F2 + F3 + F4 functional closure without mocking child components.
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PartnerReport } from '@/components/partner/PartnerReport'
import type {
  PartnerFacingStatementDTO,
  PartnerPropertyStatement,
  TimelineEvent,
} from '@/lib/lifecycle/partnerStatementTypes'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let _seq = 0
function makeEvent(overrides: Partial<TimelineEvent> & { title: string }): TimelineEvent {
  return {
    eventId:                 `evt-${++_seq}`,
    effectiveDate:           '2026-01-15',
    effectiveDateConfidence: 'confirmed',
    description:             null,
    amountEur:               null,
    partnerVisible:          true,
    status:                  'completed',
    ...overrides,
  }
}

function makeDTO(overrides: Partial<PartnerPropertyStatement> = {}): PartnerFacingStatementDTO {
  const property: PartnerPropertyStatement = {
    propertyName:     'Test Property',
    rc3ReportingName: null,
    capital: {
      agreedEntryValuationEur: null,
      requiredCapitalEur:      null,
      capitalPaidEur:          null,
      capitalRemainingEur:     null,
      capitalStatus:           'no_capital_event',
      payments:                [],
    },
    ownership: {
      currentOwnershipPct: 50,
      entryStatus:         'fully_paid',
      coOwners:            [],
    },
    financial:  null,
    settlement: { currentBalanceEur: null, totalDistributionsPaidEur: 0 },
    timeline: {
      events:                [],
      openVerificationTasks: 0,
      hasPendingDates:       false,
    },
    ...overrides,
  }

  return {
    meta: {
      schemaVersion: 'PartnerStatementDTO/1.0',
      generatedAt:   '2026-01-01T00:00:00.000Z',
      viewMode:      'partner',
    },
    investor: {
      entityId:      'test-entity-id',
      canonicalName: 'Avi',
      slug:          'avi',
      ownerType:     'investor',
    },
    properties:    [property],
    portfolio: {
      totalPropertiesCount:     1,
      totalAgreedValuationEur:  null,
      totalCapitalPaidEur:      null,
      totalCapitalRemainingEur: null,
      totalReceivableFromJJ:    0,
      totalPayableToJJ:         0,
      finalNetBalance:          0,
      direction:                'unknown',
    },
    actions: {
      canExportCsv:             false,
      canGeneratePdf:           false,
      hasOpenVerificationTasks: false,
    },
    localization: {
      lang:        'en',
      currency:    'EUR',
      generatedAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PartnerReport R4 integration (F2 + F3 + F4)', () => {
  it('renders HighlightTimeline when partnerVisible events exist', () => {
    const dto = makeDTO({
      timeline: {
        events:                [makeEvent({ title: 'Entry signed', partnerVisible: true })],
        openVerificationTasks: 0,
        hasPendingDates:       false,
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).toContain('data-testid="highlight-timeline"')
  })

  it('does not render HighlightTimeline when no partnerVisible events', () => {
    const dto = makeDTO({
      timeline: {
        events:                [makeEvent({ title: 'Internal only', partnerVisible: false })],
        openVerificationTasks: 0,
        hasPendingDates:       false,
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).not.toContain('highlight-timeline')
  })

  it('renders SettlementCard (pending) when financial=null and balance=null', () => {
    const dto  = makeDTO({ financial: null })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).toContain('data-testid="settlement-pending"')
  })

  it('F4: renders SettlementCard (pending) even when financial is non-null', () => {
    // financial !== null but settlement.currentBalanceEur === null
    // Before F4 fix, SettlementCard was inside {prop.financial && ...} → never rendered
    const dto = makeDTO({
      financial: {
        reportingName:   'Test Property',
        fromDate:        null,
        toDate:          null,
        accountSections: [],
        hasSale:         false,
        hasRenovation:   false,
        hasRental:       false,
        hasAirbnb:       false,
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).toContain('data-testid="settlement-pending"')
  })

  it('F3: renders NeedsAttentionItems when openVerificationTasks > 0', () => {
    const dto = makeDTO({
      timeline: {
        events:                [],
        openVerificationTasks: 2,
        hasPendingDates:       true,
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).toContain('data-testid="needs-attention-items"')
    expect(html).toContain('pending confirmation')
  })

  it('F3: does not render NeedsAttentionItems when no attention items', () => {
    const dto = makeDTO({
      timeline: {
        events:                [],
        openVerificationTasks: 0,
        hasPendingDates:       false,
      },
      capital: {
        agreedEntryValuationEur: null,
        requiredCapitalEur:      null,
        capitalPaidEur:          null,
        capitalRemainingEur:     null,
        capitalStatus:           'fully_paid',
        payments:                [],
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).not.toContain('needs-attention-items')
  })

  it('F4: PartnerFinancialSection no longer contains settlement balance text', () => {
    const dto = makeDTO({
      financial: {
        reportingName:   'Test Property',
        fromDate:        null,
        toDate:          null,
        accountSections: [],
        hasSale:         false,
        hasRenovation:   false,
        hasRental:       false,
        hasAirbnb:       false,
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    // Old settlement text removed from PartnerFinancialSection
    expect(html).not.toContain('Pending Settlement Engine')
    // SettlementCard still renders the pending state independently
    expect(html).toContain('data-testid="settlement-pending"')
  })

  it('smoke: all three R4 sections render together', () => {
    const dto = makeDTO({
      timeline: {
        events:                [makeEvent({ title: 'Entry signed', partnerVisible: true })],
        openVerificationTasks: 1,
        hasPendingDates:       true,
      },
      capital: {
        agreedEntryValuationEur: null,
        requiredCapitalEur:      null,
        capitalPaidEur:          null,
        capitalRemainingEur:     null,
        capitalStatus:           'capital_unknown',
        payments:                [],
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)
    expect(html).toContain('data-testid="highlight-timeline"')
    expect(html).toContain('data-testid="settlement-pending"')
    expect(html).toContain('data-testid="needs-attention-items"')
  })
})
