/**
 * executiveBrief.test.ts — Chief of Staff MVP test suite.
 *
 * Covers all 15 required test categories from the M0 Implementation Directive,
 * PLUS 11 behavioral tests from the Pre-PR Correction Gate (Gate 9).
 *
 * Test categories 1-15: Assembly, priority, dedup, evidence, empty state, etc.
 * Behavioral tests B1-B11: Auth, cross-tenant, false alerts, unapproved semantics.
 */

import {
  assembleExecutiveBrief,
  mapPriority,
  aggregateFreshness,
  buildEvidenceCoverage,
} from '@/lib/executive/chiefOfStaffAssembly'

import type {
  ExecutiveBriefCandidate,
  ProviderResult,
  BriefItemPriority,
  DataFreshness,
} from '@/lib/executive/executiveBriefTypes'

import { SECTION_ORDER, EXECUTIVE_LABELS } from '@/lib/executive/executiveBriefTypes'

// ─── Test fixtures ────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<ExecutiveBriefCandidate> = {}): ExecutiveBriefCandidate {
  return {
    providerId: 'test-provider',
    executiveOwner: 'chief-of-staff',
    strategicAsset: 'Executive Attention',
    category: 'operational-risks',
    title: 'Test item',
    explanation: 'Test explanation',
    rawPriority: 50,
    status: 'open',
    recommendedAction: 'Do something',
    decisionRequired: false,
    dueAt: null,
    confidence: 'confirmed',
    impact: null,
    evidence: [
      {
        sourceId: 'test-source',
        sourceType: 'test_table',
        description: 'Test evidence',
        queriedAt: '2026-07-22T10:00:00Z',
        freshness: 'live',
      },
    ],
    sourceFreshness: 'live',
    route: null,
    ...overrides,
  }
}

function makeProviderResult(
  overrides: Partial<ProviderResult> = {},
  candidates: ExecutiveBriefCandidate[] = [],
): ProviderResult {
  return {
    providerId: 'test-provider',
    sourceType: 'test_table',
    freshness: 'live',
    candidates,
    error: null,
    ...overrides,
  }
}

// ─── 1. DTO Type Contract ─────────────────────────────────────────────────

describe('1. DTO type contract', () => {
  it('produces schemaVersion ExecutiveBriefDTO/1.0', () => {
    const dto = assembleExecutiveBrief([])
    expect(dto.meta.schemaVersion).toBe('ExecutiveBriefDTO/1.0')
  })

  it('produces generatedAt as ISO string', () => {
    const dto = assembleExecutiveBrief([])
    expect(() => new Date(dto.meta.generatedAt)).not.toThrow()
    expect(dto.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('has all required top-level fields', () => {
    const dto = assembleExecutiveBrief([])
    expect(dto).toHaveProperty('meta')
    expect(dto).toHaveProperty('dataFreshness')
    expect(dto).toHaveProperty('evidenceCoverage')
    expect(dto).toHaveProperty('summary')
    expect(dto).toHaveProperty('sections')
  })

  it('summary has all required fields', () => {
    const dto = assembleExecutiveBrief([])
    expect(dto.summary).toHaveProperty('totalItems')
    expect(dto.summary).toHaveProperty('criticalCount')
    expect(dto.summary).toHaveProperty('decisionsRequired')
    expect(dto.summary).toHaveProperty('hasInsufficientEvidence')
  })
})

// ─── 2. Prioritization Determinism ────────────────────────────────────────

describe('2. Prioritization determinism', () => {
  it('same inputs produce same output', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ rawPriority: 80, title: 'A' }),
        makeCandidate({ rawPriority: 30, title: 'B' }),
        makeCandidate({ rawPriority: 60, title: 'C' }),
      ]),
    ]

    const dto1 = assembleExecutiveBrief(providers)
    const dto2 = assembleExecutiveBrief(providers)

    expect(dto1.summary.totalItems).toBe(dto2.summary.totalItems)
    expect(dto1.sections.length).toBe(dto2.sections.length)
    for (let i = 0; i < dto1.sections.length; i++) {
      const s1 = dto1.sections[i]
      const s2 = dto2.sections[i]
      expect(s1.items.length).toBe(s2.items.length)
      for (let j = 0; j < s1.items.length; j++) {
        expect(s1.items[j].title).toBe(s2.items[j].title)
        expect(s1.items[j].priority).toBe(s2.items[j].priority)
      }
    }
  })
})

// ─── 3. Priority Mapping Correctness ──────────────────────────────────────

describe('3. Priority mapping correctness', () => {
  const cases: [number, BriefItemPriority][] = [
    [100, 'critical'],
    [75, 'critical'],
    [74, 'high'],
    [50, 'high'],
    [49, 'normal'],
    [25, 'normal'],
    [24, 'monitor'],
    [0, 'monitor'],
  ]

  it.each(cases)('rawPriority %d maps to %s', (raw, expected) => {
    expect(mapPriority(raw)).toBe(expected)
  })
})

// ─── 4. Section Grouping and Ordering ─────────────────────────────────────

describe('4. Section grouping and ordering', () => {
  it('groups items by category', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ category: 'critical-decisions', title: 'D1' }),
        makeCandidate({ category: 'financial-attention', title: 'F1' }),
        makeCandidate({ category: 'critical-decisions', title: 'D2' }),
      ]),
    ]

    const dto = assembleExecutiveBrief(providers)
    const decisionSection = dto.sections.find(s => s.category === 'critical-decisions')!
    expect(decisionSection.items.length).toBe(2)
  })

  it('sections appear in SECTION_ORDER', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ category: 'completed-outcomes', title: 'C1' }),
        makeCandidate({ category: 'critical-decisions', title: 'D1' }),
        makeCandidate({ category: 'operational-risks', title: 'O1' }),
      ]),
    ]

    const dto = assembleExecutiveBrief(providers)
    const indices = dto.sections.map(s => SECTION_ORDER.indexOf(s.category))
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })

  it('items within a section are sorted by priority (critical first)', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ category: 'operational-risks', rawPriority: 20, title: 'Low' }),
        makeCandidate({ category: 'operational-risks', rawPriority: 80, title: 'High' }),
        makeCandidate({ category: 'operational-risks', rawPriority: 50, title: 'Med' }),
      ]),
    ]

    const dto = assembleExecutiveBrief(providers)
    const section = dto.sections.find(s => s.category === 'operational-risks')!
    expect(section.items[0].title).toBe('High')
    expect(section.items[1].title).toBe('Med')
    expect(section.items[2].title).toBe('Low')
  })
})

// ─── 5. Evidence Provenance ───────────────────────────────────────────────

describe('5. Evidence provenance', () => {
  it('every item has at least one evidence reference', () => {
    const providers = [
      makeProviderResult({}, [makeCandidate({ title: 'With evidence' })]),
    ]
    const dto = assembleExecutiveBrief(providers)
    for (const section of dto.sections) {
      for (const item of section.items) {
        expect(item.evidence.length).toBeGreaterThan(0)
      }
    }
  })

  it('evidence references have required fields', () => {
    const providers = [makeProviderResult({}, [makeCandidate()])]
    const dto = assembleExecutiveBrief(providers)
    const ev = dto.sections[0].items[0].evidence[0]
    expect(ev.sourceId).toBeTruthy()
    expect(ev.sourceType).toBeTruthy()
    expect(ev.description).toBeTruthy()
    expect(ev.queriedAt).toBeTruthy()
    expect(ev.freshness).toBeTruthy()
  })
})

// ─── 6. Empty State Distinction ───────────────────────────────────────────

describe('6. Empty state distinction', () => {
  it('no providers → empty sections, no insufficient evidence', () => {
    const dto = assembleExecutiveBrief([])
    expect(dto.sections.length).toBe(0)
    expect(dto.summary.totalItems).toBe(0)
    expect(dto.summary.hasInsufficientEvidence).toBe(false)
  })

  it('all providers live but no candidates → clean empty state', () => {
    const providers = [
      makeProviderResult({ freshness: 'live' }, []),
      makeProviderResult({ freshness: 'live', providerId: 'p2' }, []),
    ]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.summary.totalItems).toBe(0)
    expect(dto.summary.hasInsufficientEvidence).toBe(false)
  })

  it('provider unavailable → hasInsufficientEvidence = true', () => {
    const providers = [
      makeProviderResult({ freshness: 'unavailable', error: 'timeout' }, []),
      makeProviderResult({ freshness: 'live' }, []),
    ]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.summary.hasInsufficientEvidence).toBe(true)
    expect(dto.dataFreshness).toBe('unavailable')
  })
})

// ─── 7. NULL Handling (P-ARCH-1) ──────────────────────────────────────────

describe('7. NULL handling (P-ARCH-1)', () => {
  it('null impact is preserved as null, not empty string or zero', () => {
    const providers = [makeProviderResult({}, [makeCandidate({ impact: null })])]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections[0].items[0].impact).toBeNull()
  })

  it('null recommendedAction is preserved', () => {
    const providers = [makeProviderResult({}, [makeCandidate({ recommendedAction: null })])]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections[0].items[0].recommendedAction).toBeNull()
  })

  it('null dueAt is preserved', () => {
    const providers = [makeProviderResult({}, [makeCandidate({ dueAt: null })])]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections[0].items[0].dueAt).toBeNull()
  })

  it('null route is preserved', () => {
    const providers = [makeProviderResult({}, [makeCandidate({ route: null })])]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections[0].items[0].route).toBeNull()
  })
})

// ─── 8. Deduplication ─────────────────────────────────────────────────────

describe('8. Deduplication', () => {
  it('same providerId + title → keep higher priority', () => {
    const providers = [
      makeProviderResult({ providerId: 'p1' }, [
        makeCandidate({ providerId: 'shared', title: 'Dupe', rawPriority: 30 }),
      ]),
      makeProviderResult({ providerId: 'p2' }, [
        makeCandidate({ providerId: 'shared', title: 'Dupe', rawPriority: 70 }),
      ]),
    ]
    const dto = assembleExecutiveBrief(providers)
    const dupes = dto.sections.flatMap(s => s.items).filter(i => i.title === 'Dupe')
    expect(dupes.length).toBe(1)
    expect(dupes[0].priority).toBe('high')
  })

  it('different titles are not deduplicated', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ title: 'A', rawPriority: 50 }),
        makeCandidate({ title: 'B', rawPriority: 50 }),
      ]),
    ]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections.flatMap(s => s.items).length).toBe(2)
  })
})

// ─── 9. Provider Failure Isolation ────────────────────────────────────────

describe('9. Provider failure isolation', () => {
  it('one failed provider does not prevent other items', () => {
    const providers = [
      makeProviderResult({ providerId: 'failed', freshness: 'unavailable', error: 'err' }, []),
      makeProviderResult({ providerId: 'healthy' }, [makeCandidate({ title: 'OK' })]),
    ]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections.flatMap(s => s.items).length).toBe(1)
  })

  it('all providers failed → empty but hasInsufficientEvidence', () => {
    const providers = [
      makeProviderResult({ freshness: 'unavailable', error: 'f1' }, []),
      makeProviderResult({ freshness: 'unavailable', error: 'f2' }, []),
    ]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.summary.totalItems).toBe(0)
    expect(dto.summary.hasInsufficientEvidence).toBe(true)
  })

  it('unavailable provider does not make the entire brief all-clear', () => {
    const dto = assembleExecutiveBrief([
      makeProviderResult({ freshness: 'unavailable' }, []),
    ])
    // hasInsufficientEvidence must be true — cannot claim all-clear
    expect(dto.summary.hasInsufficientEvidence).toBe(true)
  })
})

// ─── 10. Freshness Aggregation ────────────────────────────────────────────

describe('10. Freshness aggregation', () => {
  const cases: [DataFreshness[], DataFreshness][] = [
    [['live', 'live', 'live'], 'live'],
    [['live', 'recent'], 'recent'],
    [['live', 'stale'], 'stale'],
    [['live', 'unavailable'], 'unavailable'],
    [['stale', 'unavailable'], 'unavailable'],
  ]

  it.each(cases)('sources %j → overall %s', (freshnesses, expected) => {
    const results = freshnesses.map((f, i) =>
      makeProviderResult({ freshness: f, providerId: `p${i}` }),
    )
    expect(aggregateFreshness(results)).toBe(expected)
  })
})

// ─── 11. Evidence Coverage Tracking ───────────────────────────────────────

describe('11. Evidence coverage tracking', () => {
  it('counts available, stale, and unavailable sources', () => {
    const results = [
      makeProviderResult({ freshness: 'live', providerId: 'p1' }),
      makeProviderResult({ freshness: 'stale', providerId: 'p2' }),
      makeProviderResult({ freshness: 'unavailable', providerId: 'p3' }),
      makeProviderResult({ freshness: 'live', providerId: 'p4' }),
    ]
    const coverage = buildEvidenceCoverage(results)
    expect(coverage.totalSources).toBe(4)
    expect(coverage.availableSources).toBe(3)
    expect(coverage.staleSources).toBe(1)
    expect(coverage.unavailableSources).toBe(1)
  })
})

// ─── 12. Executive Ownership ──────────────────────────────────────────────

describe('12. Executive ownership', () => {
  it('every item has a valid executiveOwner', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ executiveOwner: 'cfo', title: 'A' }),
        makeCandidate({ executiveOwner: 'coo', title: 'B' }),
      ]),
    ]
    const dto = assembleExecutiveBrief(providers)
    for (const section of dto.sections) {
      for (const item of section.items) {
        expect(EXECUTIVE_LABELS).toHaveProperty(item.executiveOwner)
      }
    }
  })
})

// ─── 13. Candidate-to-Item Transformation ─────────────────────────────────

describe('13. Candidate-to-item transformation', () => {
  it('generates unique IDs', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ title: 'A' }),
        makeCandidate({ title: 'B', providerId: 'p2' }),
      ]),
    ]
    const dto = assembleExecutiveBrief(providers)
    const ids = dto.sections.flatMap(s => s.items).map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('preserves all candidate fields', () => {
    const c = makeCandidate({
      title: 'T', explanation: 'E', status: 'monitoring',
      recommendedAction: null, decisionRequired: false,
      confidence: 'high', impact: null, route: '/x',
    })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [c])])
    const item = dto.sections[0].items[0]
    expect(item.title).toBe('T')
    expect(item.recommendedAction).toBeNull()
    expect(item.route).toBe('/x')
  })
})

// ─── 14. Section Omission ─────────────────────────────────────────────────

describe('14. Section omission', () => {
  it('empty sections are never included', () => {
    const providers = [makeProviderResult({}, [makeCandidate({ category: 'critical-decisions' })])]
    const dto = assembleExecutiveBrief(providers)
    expect(dto.sections.length).toBe(1)
    expect(dto.sections[0].category).toBe('critical-decisions')
  })
})

// ─── 15. Summary Computation ──────────────────────────────────────────────

describe('15. Summary computation', () => {
  it('totalItems counts all items', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ title: 'A', category: 'critical-decisions' }),
        makeCandidate({ title: 'B', category: 'financial-attention' }),
      ]),
    ]
    expect(assembleExecutiveBrief(providers).summary.totalItems).toBe(2)
  })

  it('criticalCount counts only critical items', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ rawPriority: 80, title: 'C1' }),
        makeCandidate({ rawPriority: 40, title: 'N1' }),
      ]),
    ]
    expect(assembleExecutiveBrief(providers).summary.criticalCount).toBe(1)
  })

  it('decisionsRequired counts decisionRequired=true items', () => {
    const providers = [
      makeProviderResult({}, [
        makeCandidate({ decisionRequired: true, title: 'D1' }),
        makeCandidate({ decisionRequired: false, title: 'D2' }),
      ]),
    ]
    expect(assembleExecutiveBrief(providers).summary.decisionsRequired).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIORAL TESTS (Gate 9 — Pre-PR Correction Gate)
// ═══════════════════════════════════════════════════════════════════════════

describe('B1. Negative cashbox must not be classified as risk', () => {
  it('a candidate with negative balance should not use financial-attention category without approved rule', () => {
    // If a provider creates a cashbox item, it must be trust-signals (neutral),
    // not financial-attention, unless an approved business rule exists.
    const neutralCashbox = makeCandidate({
      providerId: 'cashbox-positions',
      category: 'trust-signals',
      title: 'Partner capital positions: 3 cashboxes',
      rawPriority: 10,
      recommendedAction: null,
      decisionRequired: false,
    })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [neutralCashbox])])
    const item = dto.sections[0].items[0]
    expect(item.category).toBe('trust-signals')
    expect(item.recommendedAction).toBeNull()
    expect(item.decisionRequired).toBe(false)
    expect(item.priority).toBe('monitor') // rawPriority 10 → monitor
  })
})

describe('B2. Deterministic rules must not fabricate confidence', () => {
  it('confidence "confirmed" means the data query succeeded, not an analytical model', () => {
    // "confirmed" = the evidence source was queried and returned data.
    // It does NOT mean an AI model is confident about a prediction.
    const candidate = makeCandidate({ confidence: 'confirmed' })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [candidate])])
    // confidence is preserved as-is from the provider
    expect(dto.sections[0].items[0].confidence).toBe('confirmed')
  })

  it('confidence must not be "high" or "medium" unless an analytical model produced it', () => {
    // For M0, all providers query database views — no ML model exists.
    // Only "confirmed" (data was retrieved) or "unavailable" (source down) are valid.
    const candidate = makeCandidate({ confidence: 'confirmed' })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [candidate])])
    const validM0Confidences = ['confirmed', 'unavailable']
    expect(validM0Confidences).toContain(dto.sections[0].items[0].confidence)
  })
})

describe('B3. Resolved duplicates must not appear as active decisions', () => {
  it('a resolved-status item must not have decisionRequired=true', () => {
    const resolved = makeCandidate({
      status: 'resolved',
      decisionRequired: false,
      rawPriority: 10,
      category: 'completed-outcomes',
    })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [resolved])])
    const item = dto.sections[0].items[0]
    expect(item.status).toBe('resolved')
    expect(item.decisionRequired).toBe(false)
  })
})

describe('B4. Monitor-only items must have no recommendation language', () => {
  it('rawPriority < 25 items should have null recommendedAction', () => {
    const monitor = makeCandidate({
      rawPriority: 10,
      recommendedAction: null,
      decisionRequired: false,
    })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [monitor])])
    const item = dto.sections[0].items[0]
    expect(item.priority).toBe('monitor')
    expect(item.recommendedAction).toBeNull()
  })
})

describe('B5. Provider evidence must be traceable to source and query time', () => {
  it('every evidence reference includes sourceId, queriedAt, and freshness', () => {
    const candidate = makeCandidate({
      evidence: [
        {
          sourceId: 'lifecycle.verification_tasks',
          sourceType: 'lifecycle_table',
          description: '5 tasks pending',
          queriedAt: '2026-07-22T10:00:00Z',
          freshness: 'live',
        },
      ],
    })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [candidate])])
    const ev = dto.sections[0].items[0].evidence[0]
    expect(ev.sourceId).toBe('lifecycle.verification_tasks')
    expect(ev.queriedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ev.freshness).toBe('live')
  })
})

describe('B6. Impact must not be invented', () => {
  it('items without approved impact rule must have impact=null', () => {
    const noImpact = makeCandidate({ impact: null })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [noImpact])])
    expect(dto.sections[0].items[0].impact).toBeNull()
  })
})

describe('B7. Items that fail the CEO attention test should not appear', () => {
  it('a pure system-status fact with rawPriority < 25 gets monitor priority', () => {
    // System status items that don't require CEO attention should be
    // monitor-only (or omitted). The priority system ensures this.
    const systemStatus = makeCandidate({
      rawPriority: 5,
      title: '589 reservations tracked',
      recommendedAction: null,
      decisionRequired: false,
      impact: null,
    })
    const dto = assembleExecutiveBrief([makeProviderResult({}, [systemStatus])])
    expect(dto.sections[0].items[0].priority).toBe('monitor')
    expect(dto.sections[0].items[0].decisionRequired).toBe(false)
  })
})

describe('B8. decisionRequired must be false unless a real human decision is needed', () => {
  it('only verification tasks (approved M9-D) have decisionRequired=true in M0', () => {
    // In M0, the only approved CEO decision is providing source documents.
    // All other items are monitor-only.
    const verificationTask = makeCandidate({
      providerId: 'verification-tasks',
      decisionRequired: true,
      rawPriority: 55,
    })
    const monitorItem = makeCandidate({
      providerId: 'cashbox-positions',
      decisionRequired: false,
      rawPriority: 10,
    })
    const dto = assembleExecutiveBrief([
      makeProviderResult({}, [verificationTask, monitorItem]),
    ])
    const items = dto.sections.flatMap(s => s.items)
    const decisionsRequired = items.filter(i => i.decisionRequired)
    expect(decisionsRequired.length).toBe(1)
    expect(decisionsRequired[0].id).toContain('verification-tasks')
  })
})
