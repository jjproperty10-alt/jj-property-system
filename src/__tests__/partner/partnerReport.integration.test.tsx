/**
 * partnerReport.integration.test.tsx
 * Integration tests: PartnerReport wiring of R4 components
 * (HighlightTimeline, SettlementCard, NeedsAttentionItems)
 *
 * Tests: 8
 * Verifies F2 + F3 + F4 functional closure without mocking child components.
 *
 * F3 (v1.1): NeedsAttentionItems items come from verificationTaskItems.humanLabel,
 * not from a count-based generic string. Two seeded QA tasks prove per-task
 * identity: taskId, priority, sourceTable, sourceId, missingField, and
 * relatedAmountEur are each present in the fixture and reflected in humanLabel.
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PartnerReport } from '@/components/partner/PartnerReport'
import type {
  PartnerFacingStatementDTO,
  PartnerPropertyStatement,
  TimelineEvent,
  VerificationTaskItem,
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

/**
 * QA task fixtures — two seeded tasks representing real lifecycle.verification_tasks rows.
 *
 * F3 contract: for each displayed humanLabel the underlying task provides:
 *   task-qa-1: taskId='task-qa-1', priority='high', sourceTable='capital_event',
 *              sourceId='evt-uuid-capital-1', missingField='effective_date',
 *              relatedAmountEur=250000
 *              → humanLabel: "Payment date pending confirmation (€250,000)"
 *
 *   task-qa-2: taskId='task-qa-2', priority='high', sourceTable='partner_entry',
 *              sourceId='evt-uuid-entry-1', missingField='effective_from',
 *              relatedAmountEur=null
 *              → humanLabel: "Entry date pending confirmation"
 *
 * UI contract: only humanLabel is rendered. taskId, sourceId, sourceTable
 * are never exposed in the DOM (P-ARCH-6 / internal field rule).
 */
function makeVerificationTask(overrides: Partial<VerificationTaskItem> = {}): VerificationTaskItem {
  return {
    taskId:           'task-qa-default',
    priority:         'high',
    sourceTable:      'capital_event',
    sourceId:         'evt-uuid-default',
    missingField:     'effective_date',
    humanLabel:       'Payment date pending confirmation',
    relatedAmountEur: null,
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
      verificationTaskItems: [],
    },
    ...overrides,
  }

  return {
    meta: {
      schemaVersion: 'PartnerStatementDTO/1.1',
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
        verificationTaskItems: [],
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
        verificationTaskItems: [],
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

  it('F3: renders NeedsAttentionItems with per-task humanLabels from verification_tasks rows', () => {
    /**
     * Two seeded QA tasks — each maps to a real lifecycle.verification_tasks row.
     *
     * task-qa-1: capital_event / effective_date / €250,000
     *   → "Payment date pending confirmation (€250,000)"
     * task-qa-2: partner_entry / effective_from / no amount
     *   → "Entry date pending confirmation"
     *
     * Proves:
     * (a) NeedsAttentionItems renders
     * (b) Each task's humanLabel appears in the DOM — not a generic count string
     * (c) Generic count string "2 dates pending confirmation" does NOT appear
     */
    const dto = makeDTO({
      timeline: {
        events:                [],
        openVerificationTasks: 2,
        hasPendingDates:       true,
        verificationTaskItems: [
          makeVerificationTask({
            taskId:           'task-qa-1',
            priority:         'high',
            sourceTable:      'capital_event',
            sourceId:         'evt-uuid-capital-1',
            missingField:     'effective_date',
            humanLabel:       'Payment date pending confirmation (€250,000)',
            relatedAmountEur: 250000,
          }),
          makeVerificationTask({
            taskId:           'task-qa-2',
            priority:         'high',
            sourceTable:      'partner_entry',
            sourceId:         'evt-uuid-entry-1',
            missingField:     'effective_from',
            humanLabel:       'Entry date pending confirmation',
            relatedAmountEur: null,
          }),
        ],
      },
    })
    const html = renderToStaticMarkup(<PartnerReport dto={dto} />)

    // NeedsAttentionItems section renders
    expect(html).toContain('data-testid="needs-attention-items"')

    // Per-task humanLabel for task-qa-1 (capital_event / effective_date / €250,000)
    expect(html).toContain('Payment date pending confirmation (€250,000)')

    // Per-task humanLabel for task-qa-2 (partner_entry / effective_from / no amount)
    expect(html).toContain('Entry date pending confirmation')

    // Regression guard: generic count-based string must NOT appear
    expect(html).not.toContain('2 dates pending confirmation')
    expect(html).not.toContain('dates pending confirmation')
  })

  it('F3: does not render NeedsAttentionItems when no attention items', () => {
    const dto = makeDTO({
      timeline: {
        events:                [],
        openVerificationTasks: 0,
        hasPendingDates:       false,
        verificationTaskItems: [],
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

  it('smoke: all three R4 sections render together with per-task attention items', () => {
    const dto = makeDTO({
      timeline: {
        events:                [makeEvent({ title: 'Entry signed', partnerVisible: true })],
        openVerificationTasks: 1,
        hasPendingDates:       true,
        verificationTaskItems: [
          makeVerificationTask({
            taskId:           'task-smoke-1',
            priority:         'high',
            sourceTable:      'capital_event',
            sourceId:         'evt-uuid-smoke-1',
            missingField:     'effective_date',
            humanLabel:       'Payment date pending confirmation',
            relatedAmountEur: null,
          }),
        ],
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
    // Per-task label from real task item
    expect(html).toContain('Payment date pending confirmation')
    // capital_unknown adds the capital item
    expect(html).toContain('Investment amount to be verified')
  })
})
