/**
 * ownerWorkspace.test.tsx — PR #3 Owner Workspace tests
 *
 * Tests cover:
 * 1. nameToSlug() — URL-safe slug derivation
 * 2. Tab visibility matrix — all 7 tabs render with correct headings
 * 3. Timeline zones — UPCOMING / NOW / PAST bucketing
 * 4. Correction flow — public_reason shown, internal_note never shown
 * 5. Financial tab — closingBalance always shows UnknownValue (RC2)
 * 6. Relationship tab — internal audience events filtered out
 * 7. Document tab — groups by type, shows missing badge
 *
 * Pattern: renderToStaticMarkup (matches project convention)
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { nameToSlug } from '@/lib/owners/ownerWorkspaceUtils'
import { OverviewTab } from '@/components/owners/tabs/OverviewTab'
import { FinancialTab } from '@/components/owners/tabs/FinancialTab'
import { ReservationsTab } from '@/components/owners/tabs/ReservationsTab'
import { DocumentsTab } from '@/components/owners/tabs/DocumentsTab'
import { MaintenanceTab } from '@/components/owners/tabs/MaintenanceTab'
import { RelationshipTab } from '@/components/owners/tabs/RelationshipTab'
import { AuditTab } from '@/components/owners/tabs/AuditTab'
import { TimelineZone } from '@/components/ds/TimelineZone'
import type {
  OwnerOverviewDTO,
  OwnerFinancialDTO,
  OwnerReservationSummaryDTO,
  OwnerDocumentDTO,
  OwnerMaintenanceDTO,
  OwnerRelationshipEventDTO,
  OwnerAuditDTO,
  TimelineEventDTO,
} from '@/lib/owners/ownerWorkspaceTypes'

// ─────────────────────────────────────────────────────────────
// 1. nameToSlug
// ─────────────────────────────────────────────────────────────

describe('nameToSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(nameToSlug('Avi Cohen')).toBe('avi-cohen')
  })

  it('strips non-alphanumeric characters', () => {
    expect(nameToSlug("Avi O'Cohen")).toBe('avi-ocohen')
  })

  it('collapses multiple spaces/hyphens', () => {
    expect(nameToSlug('Avi  Cohen')).toBe('avi-cohen')
  })

  it('handles Hebrew-initial names by generating a safe slug', () => {
    const slug = nameToSlug('אבי')
    expect(typeof slug).toBe('string')
    expect(slug.length).toBeGreaterThan(0)
  })

  it('handles empty string without throwing', () => {
    expect(() => nameToSlug('')).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────

const EMPTY_OVERVIEW: OwnerOverviewDTO = {
  financial: {
    balanceDirection: 'balanced',
    balanceEur: null,
    pendingEur: null,
    lastPaymentAt: null,
    nextPaymentAt: null,
  },
  openItems: [],
  nextAction: null,
  upcomingPreview: [],
  contractRenewalAlert: null,
  recentActivity: [],
}

const EMPTY_FINANCIAL: OwnerFinancialDTO = {
  position: {
    incomeEur: null,
    expensesEur: null,
    netEur: null,
    paidToOwnerEur: null,
    pendingEur: null,
    closingBalanceEur: null,
  },
  sections: [],
  timeline: [],
}

const EMPTY_RESERVATIONS: OwnerReservationSummaryDTO = {
  period: { startDate: '2026-07-01', endDate: '2026-07-31' },
  portfolio: {
    totalReservations: 0,
    occupancyPct: null,
    revenueEur: null,
    adr: null,
    revPar: null,
    cancellations: 0,
  },
  channelMix: [],
  reservations: [],
}

const EMPTY_AUDIT: OwnerAuditDTO = {
  evidenceItems: [],
  statementVersions: [],
  correctionCases: [],
  decisionHistory: [],
  verificationHistory: [],
}

// ─────────────────────────────────────────────────────────────
// 2. Tab visibility matrix — all 7 tabs render
// ─────────────────────────────────────────────────────────────

describe('Tab visibility matrix — all 7 tabs render without crash', () => {
  it('OverviewTab renders with empty DTO', () => {
    const html = renderToStaticMarkup(
      <OverviewTab dto={EMPTY_OVERVIEW} ownerName="Avi" />,
    )
    expect(html).toBeTruthy()
    expect(html).toContain('Financial Position')
  })

  it('FinancialTab renders with empty DTO', () => {
    const html = renderToStaticMarkup(
      <FinancialTab dto={EMPTY_FINANCIAL} />,
    )
    expect(html).toBeTruthy()
  })

  it('ReservationsTab renders with empty DTO', () => {
    const html = renderToStaticMarkup(
      <ReservationsTab dto={EMPTY_RESERVATIONS} />,
    )
    expect(html).toBeTruthy()
    expect(html).toContain('Reservations')
  })

  it('DocumentsTab renders empty state', () => {
    const html = renderToStaticMarkup(
      <DocumentsTab documents={[]} />,
    )
    expect(html).toContain('No documents yet')
  })

  it('MaintenanceTab renders empty state', () => {
    const html = renderToStaticMarkup(
      <MaintenanceTab items={[]} />,
    )
    expect(html).toContain('No maintenance items')
  })

  it('RelationshipTab renders empty state', () => {
    const html = renderToStaticMarkup(
      <RelationshipTab events={[]} />,
    )
    expect(html).toContain('No relationship history yet')
  })

  it('AuditTab renders empty state', () => {
    const html = renderToStaticMarkup(
      <AuditTab dto={EMPTY_AUDIT} />,
    )
    expect(html).toContain('No audit records yet')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Timeline zones
// ─────────────────────────────────────────────────────────────

const TIMELINE_EVENTS: TimelineEventDTO[] = [
  {
    id: 'past-1',
    zone: 'past',
    dotShape: 'filled',
    dotLabel: 'Confirmed',
    title: 'Statement sent',
    date: '2026-06-01',
    dateConfidence: 'confirmed',
    propertyName: 'Villa Mazotos',
    type: 'statement',
    assignedTo: null,
    source: 'scheduled_statement_cycle',
    lastVerifiedAt: null,
    evidenceRef: null,
  },
  {
    id: 'now-1',
    zone: 'now',
    dotShape: 'diamond',
    dotLabel: 'Current period',
    title: 'Review month',
    date: '2026-07-01',
    dateConfidence: 'confirmed',
    propertyName: null,
    type: 'period',
    assignedTo: null,
    source: null,
    lastVerifiedAt: null,
    evidenceRef: null,
  },
  {
    id: 'upcoming-1',
    zone: 'upcoming',
    dotShape: 'open',
    dotLabel: 'Planned',
    title: 'Next payment due',
    date: '2026-08-01',
    dateConfidence: 'estimated',
    propertyName: 'Villa Mazotos',
    type: 'payment',
    assignedTo: 'JJ',
    source: 'approved_payment_schedule',
    lastVerifiedAt: null,
    evidenceRef: null,
  },
  {
    id: 'ai-1',
    zone: 'upcoming',
    dotShape: 'dashed-square',
    dotLabel: 'AI forecast · not confirmed',
    title: 'Potential renewal',
    date: '2026-09-01',
    dateConfidence: 'estimated',
    propertyName: null,
    type: 'ai_forecast',
    assignedTo: null,
    source: null,
    lastVerifiedAt: null,
    evidenceRef: null,
    aiForecast: { confidencePct: 72, label: 'AI forecast · 72% · not confirmed' },
  },
]

describe('TimelineZone', () => {
  it('renders UPCOMING / NOW / PAST sections', () => {
    const html = renderToStaticMarkup(<TimelineZone events={TIMELINE_EVENTS} />)
    expect(html).toContain('UPCOMING')
    expect(html).toContain('NOW')
    expect(html).toContain('PAST')
  })

  it('renders past event title', () => {
    const html = renderToStaticMarkup(<TimelineZone events={TIMELINE_EVENTS} />)
    expect(html).toContain('Statement sent')
  })

  it('renders upcoming event title', () => {
    const html = renderToStaticMarkup(<TimelineZone events={TIMELINE_EVENTS} />)
    expect(html).toContain('Next payment due')
  })

  it('labels AI forecast events clearly — not just by color', () => {
    const html = renderToStaticMarkup(<TimelineZone events={TIMELINE_EVENTS} />)
    // Must contain accessible text label (not rely on color alone — accessibility rule)
    expect(html).toContain('AI forecast')
    expect(html).toContain('not confirmed')
  })

  it('renders empty state when no events', () => {
    const html = renderToStaticMarkup(<TimelineZone events={[]} />)
    expect(html).toContain('No timeline events')
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Correction flow — public_reason shown, internal_note NEVER shown
// ─────────────────────────────────────────────────────────────

describe('AuditTab — correction case visibility', () => {
  const auditWithCorrection: OwnerAuditDTO = {
    ...EMPTY_AUDIT,
    correctionCases: [
      {
        id: 'cc-1',
        initiatedBy: 'owner',
        status: 'open',
        publicReason: 'Invoice amount does not match',
        internalNote: 'INTERNAL: This is JJ-only context — should NEVER appear in owner view',
        humanApprovalRequired: true,
        reviewerName: 'Yossi',
        priorStatementId: null,
        replacementStatementId: null,
        openedAt: '2026-07-01T10:00:00Z',
        resolvedAt: null,
      },
    ],
  }

  it('renders public_reason', () => {
    const html = renderToStaticMarkup(<AuditTab dto={auditWithCorrection} />)
    expect(html).toContain('Invoice amount does not match')
  })

  it('NEVER renders internal_note content', () => {
    const html = renderToStaticMarkup(<AuditTab dto={auditWithCorrection} />)
    // The internal note should never appear in rendered output
    expect(html).not.toContain('INTERNAL: This is JJ-only context')
    expect(html).not.toContain('should NEVER appear')
  })

  it('shows human approval required indicator', () => {
    const html = renderToStaticMarkup(<AuditTab dto={auditWithCorrection} />)
    expect(html).toContain('human approval')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Financial tab — position states
// ─────────────────────────────────────────────────────────────

describe('FinancialTab — closing balance', () => {
  it('shows explanatory banner when ALL position values are null and no sections', () => {
    // When RC3 not yet connected: single banner replaces the 6 simultaneous UnknownValue cards
    const html = renderToStaticMarkup(<FinancialTab dto={EMPTY_FINANCIAL} />)
    expect(html).toContain('RC3')
  })

  it('shows Settlement Engine / RC2 message when closingBalance is null but other values exist', () => {
    // When some values are known but closing balance not yet computed → show RC2 unknown
    const partialDto: OwnerFinancialDTO = {
      ...EMPTY_FINANCIAL,
      position: { ...EMPTY_FINANCIAL.position, incomeEur: '1000.00' },
    }
    const html = renderToStaticMarkup(<FinancialTab dto={partialDto} />)
    expect(html).toContain('RC2')
  })

  it('renders Current Financial Position section heading', () => {
    const html = renderToStaticMarkup(<FinancialTab dto={EMPTY_FINANCIAL} />)
    expect(html).toContain('Current Financial Position')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. Relationship tab — internal audience events filtered
// ─────────────────────────────────────────────────────────────

describe('RelationshipTab — audience filtering', () => {
  const events: OwnerRelationshipEventDTO[] = [
    {
      id: 'rel-1',
      type: 'email',
      audience: 'all',
      summary: 'Welcome email sent to owner',
      content: null,
      occurredAt: '2026-07-01T10:00:00Z',
      propertyName: 'Villa Mazotos',
      authorName: 'JJ Team',
      isAiGenerated: false,
      aiConfidencePct: null,
    },
    {
      id: 'rel-2',
      type: 'internal_note',
      audience: 'jj',
      summary: 'INTERNAL: Owner is difficult — JJ staff only',
      content: 'Full internal note — should never be visible',
      occurredAt: '2026-07-02T10:00:00Z',
      propertyName: null,
      authorName: 'Yossi',
      isAiGenerated: false,
      aiConfidencePct: null,
    },
  ]

  it('shows audience=all events', () => {
    const html = renderToStaticMarkup(<RelationshipTab events={events} />)
    expect(html).toContain('Welcome email sent to owner')
  })

  it('NEVER shows audience=jj events in rendered output', () => {
    const html = renderToStaticMarkup(<RelationshipTab events={events} />)
    expect(html).not.toContain('INTERNAL: Owner is difficult')
    expect(html).not.toContain('Full internal note')
    expect(html).not.toContain('JJ staff only')
  })

  it('labels AI-generated summaries clearly', () => {
    const aiEvent: OwnerRelationshipEventDTO = {
      id: 'rel-3',
      type: 'ai_summary',
      audience: 'owner',
      summary: 'AI generated this summary of the month',
      content: null,
      occurredAt: '2026-07-03T10:00:00Z',
      propertyName: null,
      authorName: null,
      isAiGenerated: true,
      aiConfidencePct: 85,
    }
    const html = renderToStaticMarkup(<RelationshipTab events={[aiEvent]} />)
    expect(html).toContain('AI summary')
    expect(html).toContain('85%')
    expect(html).toContain('not confirmed')
  })
})

// ─────────────────────────────────────────────────────────────
// 7. DocumentsTab — grouping + missing badge
// ─────────────────────────────────────────────────────────────

describe('DocumentsTab', () => {
  const docs: OwnerDocumentDTO[] = [
    {
      id: 'd1',
      type: 'contract',
      title: 'Rental Agreement 2026',
      relatedEntity: 'Villa Mazotos',
      relatedEvent: 'Annual renewal',
      date: '2026-01-01',
      source: 'upload',
      verificationStatus: 'verified',
      openHref: null,
    },
    {
      id: 'd2',
      type: 'invoice',
      title: 'Renovation Invoice #42',
      relatedEntity: 'Villa Mazotos',
      relatedEvent: null,
      date: '2026-06-15',
      source: 'system',
      verificationStatus: 'missing',
      openHref: null,
    },
  ]

  it('renders contract in Contracts group', () => {
    const html = renderToStaticMarkup(<DocumentsTab documents={docs} />)
    expect(html).toContain('Contracts')
    expect(html).toContain('Rental Agreement 2026')
  })

  it('renders invoice in Invoices group', () => {
    const html = renderToStaticMarkup(<DocumentsTab documents={docs} />)
    expect(html).toContain('Invoices')
    expect(html).toContain('Renovation Invoice #42')
  })

  it('shows missing document count badge', () => {
    const html = renderToStaticMarkup(<DocumentsTab documents={docs} />)
    expect(html).toContain('missing document')
  })
})

// ─────────────────────────────────────────────────────────────
// 8. OverviewTab — open items rendering
// ─────────────────────────────────────────────────────────────

describe('OverviewTab', () => {
  it('shows open items when present', () => {
    const dto: OwnerOverviewDTO = {
      ...EMPTY_OVERVIEW,
      openItems: [
        {
          id: 'item-1',
          type: 'correction',
          label: 'Correction case needs review',
          propertyName: 'Villa Mazotos',
          urgency: 'high',
          dueDate: '2026-07-31',
        },
      ],
    }
    const html = renderToStaticMarkup(<OverviewTab dto={dto} ownerName="Avi" />)
    expect(html).toContain('Correction case needs review')
    expect(html).toContain('Villa Mazotos')
  })

  it('shows empty state when no open items', () => {
    const html = renderToStaticMarkup(<OverviewTab dto={EMPTY_OVERVIEW} ownerName="Avi" />)
    expect(html).toContain('Nothing open')
  })

  it('shows next action CTA when present', () => {
    const dto: OwnerOverviewDTO = {
      ...EMPTY_OVERVIEW,
      nextAction: {
        label: 'Send the July statement',
        href: '/owners/avi/statement/draft',
        urgency: 'high',
      },
    }
    const html = renderToStaticMarkup(<OverviewTab dto={dto} ownerName="Avi" />)
    expect(html).toContain('Send the July statement')
    expect(html).toContain('Take action')
  })

  it('shows owner name in recent activity heading', () => {
    const html = renderToStaticMarkup(<OverviewTab dto={EMPTY_OVERVIEW} ownerName="Avi" />)
    expect(html).toContain('Avi')
  })
})
