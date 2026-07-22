/**
 * executiveBriefUI.test.tsx — Executive Brief UI component tests.
 *
 * Tests that React renders only — no business logic in UI.
 * Uses renderToStaticMarkup pattern (same as homeComponents.test.tsx).
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExecutiveBrief } from '@/components/executive/ExecutiveBrief'
import { BriefHeader } from '@/components/executive/BriefHeader'
import { BriefItem } from '@/components/executive/BriefItem'
import { BriefEmptyState } from '@/components/executive/BriefEmptyState'
import type { ExecutiveBriefDTO, ExecutiveBriefItem } from '@/lib/executive/executiveBriefTypes'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function makeDTO(overrides: Partial<ExecutiveBriefDTO> = {}): ExecutiveBriefDTO {
  return {
    meta: {
      schemaVersion: 'ExecutiveBriefDTO/1.0',
      generatedAt: '2026-07-22T10:00:00Z',
    },
    dataFreshness: 'live',
    evidenceCoverage: {
      totalSources: 5,
      availableSources: 5,
      staleSources: 0,
      unavailableSources: 0,
    },
    summary: {
      totalItems: 0,
      criticalCount: 0,
      decisionsRequired: 0,
      hasInsufficientEvidence: false,
    },
    sections: [],
    ...overrides,
  }
}

function makeItem(overrides: Partial<ExecutiveBriefItem> = {}): ExecutiveBriefItem {
  return {
    id: 'test-1',
    executiveOwner: 'cfo',
    strategicAsset: 'Financial Reality',
    category: 'financial-attention',
    title: 'Test item title',
    explanation: 'Test explanation text',
    priority: 'high',
    status: 'open',
    recommendedAction: 'Do something about it',
    decisionRequired: false,
    dueAt: null,
    confidence: 'confirmed',
    impact: 'Partner capital affected',
    evidence: [
      {
        sourceId: 'v_cashbox_audit',
        sourceType: 'public_view',
        description: 'Queried cashbox',
        queriedAt: '2026-07-22T10:00:00Z',
        freshness: 'live',
      },
    ],
    sourceFreshness: 'live',
    route: null,
    ...overrides,
  }
}

// ─── BriefHeader ──────────────────────────────────────────────────────────

describe('BriefHeader', () => {
  it('renders Executive Brief title', () => {
    const html = renderToStaticMarkup(
      <BriefHeader
        generatedAt="2026-07-22T10:00:00Z"
        dataFreshness="live"
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 0, unavailableSources: 0 }}
        totalItems={3}
        criticalCount={0}
        decisionsRequired={0}
        hasInsufficientEvidence={false}
      />,
    )
    expect(html).toContain('Executive Brief')
    expect(html).toContain('data-testid="brief-header"')
  })

  it('shows freshness badge', () => {
    const html = renderToStaticMarkup(
      <BriefHeader
        generatedAt="2026-07-22T10:00:00Z"
        dataFreshness="live"
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 0, unavailableSources: 0 }}
        totalItems={0}
        criticalCount={0}
        decisionsRequired={0}
        hasInsufficientEvidence={false}
      />,
    )
    expect(html).toContain('Live')
    expect(html).toContain('data-testid="freshness-badge"')
  })

  it('shows critical count when > 0', () => {
    const html = renderToStaticMarkup(
      <BriefHeader
        generatedAt="2026-07-22T10:00:00Z"
        dataFreshness="live"
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 0, unavailableSources: 0 }}
        totalItems={3}
        criticalCount={2}
        decisionsRequired={0}
        hasInsufficientEvidence={false}
      />,
    )
    expect(html).toContain('2 critical')
  })

  it('hides critical badge when count = 0', () => {
    const html = renderToStaticMarkup(
      <BriefHeader
        generatedAt="2026-07-22T10:00:00Z"
        dataFreshness="live"
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 0, unavailableSources: 0 }}
        totalItems={0}
        criticalCount={0}
        decisionsRequired={0}
        hasInsufficientEvidence={false}
      />,
    )
    expect(html).not.toContain('critical')
  })

  it('shows insufficient evidence caveat when true', () => {
    const html = renderToStaticMarkup(
      <BriefHeader
        generatedAt="2026-07-22T10:00:00Z"
        dataFreshness="stale"
        evidenceCoverage={{ totalSources: 5, availableSources: 4, staleSources: 1, unavailableSources: 0 }}
        totalItems={0}
        criticalCount={0}
        decisionsRequired={0}
        hasInsufficientEvidence={true}
      />,
    )
    expect(html).toContain('insufficient-evidence-caveat')
    expect(html).toContain('unavailable or stale')
  })

  it('shows decisions needed badge', () => {
    const html = renderToStaticMarkup(
      <BriefHeader
        generatedAt="2026-07-22T10:00:00Z"
        dataFreshness="live"
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 0, unavailableSources: 0 }}
        totalItems={3}
        criticalCount={0}
        decisionsRequired={2}
        hasInsufficientEvidence={false}
      />,
    )
    expect(html).toContain('2 decisions needed')
  })
})

// ─── BriefItem ────────────────────────────────────────────────────────────

describe('BriefItem', () => {
  it('renders title and explanation', () => {
    const html = renderToStaticMarkup(<BriefItem item={makeItem()} />)
    expect(html).toContain('Test item title')
    expect(html).toContain('Test explanation text')
  })

  it('renders priority badge', () => {
    const html = renderToStaticMarkup(<BriefItem item={makeItem({ priority: 'critical' })} />)
    expect(html).toContain('Critical')
    expect(html).toContain('data-testid="priority-badge"')
  })

  it('renders executive owner label', () => {
    const html = renderToStaticMarkup(<BriefItem item={makeItem({ executiveOwner: 'coo' })} />)
    expect(html).toContain('COO')
  })

  it('renders recommended action when present', () => {
    const html = renderToStaticMarkup(
      <BriefItem item={makeItem({ recommendedAction: 'Fix it now' })} />,
    )
    expect(html).toContain('Fix it now')
  })

  it('does not render action section when null', () => {
    const html = renderToStaticMarkup(
      <BriefItem item={makeItem({ recommendedAction: null })} />,
    )
    expect(html).not.toContain('Action:')
  })

  it('renders impact when present', () => {
    const html = renderToStaticMarkup(
      <BriefItem item={makeItem({ impact: 'Revenue at risk' })} />,
    )
    expect(html).toContain('Revenue at risk')
  })

  it('does not render impact when null', () => {
    const html = renderToStaticMarkup(
      <BriefItem item={makeItem({ impact: null })} />,
    )
    expect(html).not.toContain('Impact:')
  })

  it('shows decision required flag', () => {
    const html = renderToStaticMarkup(
      <BriefItem item={makeItem({ decisionRequired: true })} />,
    )
    expect(html).toContain('Decision required')
  })

  it('applies correct data attributes', () => {
    const html = renderToStaticMarkup(
      <BriefItem item={makeItem({ priority: 'high', executiveOwner: 'cfo' })} />,
    )
    expect(html).toContain('data-priority="high"')
    expect(html).toContain('data-executive="cfo"')
  })
})

// ─── BriefEmptyState ──────────────────────────────────────────────────────

describe('BriefEmptyState', () => {
  it('renders all-clear when evidence is sufficient', () => {
    const html = renderToStaticMarkup(
      <BriefEmptyState
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 0, unavailableSources: 0 }}
        hasInsufficientEvidence={false}
      />,
    )
    expect(html).toContain('data-testid="brief-empty-all-clear"')
    expect(html).toContain('No evidence-backed items')
    expect(html).toContain('green')
  })

  it('renders insufficient evidence warning when sources unavailable', () => {
    const html = renderToStaticMarkup(
      <BriefEmptyState
        evidenceCoverage={{ totalSources: 5, availableSources: 3, staleSources: 0, unavailableSources: 2 }}
        hasInsufficientEvidence={true}
      />,
    )
    expect(html).toContain('data-testid="brief-empty-insufficient"')
    expect(html).toContain('evidence is incomplete')
    expect(html).toContain('amber')
    expect(html).toContain('2 of 5')
  })

  it('renders stale warning when sources are stale', () => {
    const html = renderToStaticMarkup(
      <BriefEmptyState
        evidenceCoverage={{ totalSources: 5, availableSources: 5, staleSources: 1, unavailableSources: 0 }}
        hasInsufficientEvidence={true}
      />,
    )
    expect(html).toContain('stale data')
  })
})

// ─── ExecutiveBrief (main container) ──────────────────────────────────────

describe('ExecutiveBrief', () => {
  it('renders with data-testid and schema version', () => {
    const html = renderToStaticMarkup(<ExecutiveBrief dto={makeDTO()} />)
    expect(html).toContain('data-testid="executive-brief"')
    expect(html).toContain('ExecutiveBriefDTO/1.0')
  })

  it('renders empty state when no sections have items', () => {
    const html = renderToStaticMarkup(<ExecutiveBrief dto={makeDTO()} />)
    expect(html).toContain('data-testid="brief-empty-all-clear"')
  })

  it('renders sections when items exist', () => {
    const dto = makeDTO({
      summary: { totalItems: 1, criticalCount: 0, decisionsRequired: 0, hasInsufficientEvidence: false },
      sections: [
        {
          category: 'operational-risks',
          label: 'Operational Risks',
          items: [makeItem()],
        },
      ],
    })
    const html = renderToStaticMarkup(<ExecutiveBrief dto={dto} />)
    expect(html).toContain('data-testid="brief-section"')
    expect(html).toContain('Operational Risks')
    expect(html).toContain('Test item title')
  })

  it('renders section label as uppercase tracking text', () => {
    const dto = makeDTO({
      summary: { totalItems: 1, criticalCount: 0, decisionsRequired: 0, hasInsufficientEvidence: false },
      sections: [
        {
          category: 'financial-attention',
          label: 'Financial Attention',
          items: [makeItem()],
        },
      ],
    })
    const html = renderToStaticMarkup(<ExecutiveBrief dto={dto} />)
    expect(html).toContain('Financial Attention')
    expect(html).toContain('tracking-widest')
  })

  it('always renders header', () => {
    const html = renderToStaticMarkup(<ExecutiveBrief dto={makeDTO()} />)
    expect(html).toContain('data-testid="brief-header"')
  })
})
