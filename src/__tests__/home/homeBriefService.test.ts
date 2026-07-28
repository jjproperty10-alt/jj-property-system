/**
 * @module __tests__/home/homeBriefService
 * @description Tests for buildHomeBrief() — PR #79 Reference Case #2.
 *
 * Verifies:
 * - allClear truth table (4 cases)
 * - Health derivation (5 cases)
 * - Greeting message derivation (4 cases)
 * - Totality (every input → valid output, no exceptions)
 * - Determinism (same input → same output)
 * - Authority boundary (no forbidden imports)
 * - Provider isolation (no providerId references)
 *
 * @see PR79_GATE0_AND_DESIGN_PACKAGE.md — Contract Hardening §3.1–3.3
 */

import { buildHomeBrief } from '@/lib/home/homeBriefService'
import type { ExecutiveBriefDTO } from '@/lib/executive/executiveBriefTypes'
import type { HomeBriefDTO } from '@/lib/home/homeBriefTypes'
import * as fs from 'fs'
import * as path from 'path'

// ─── Test fixtures ─────────────────────────────────────────────────────────

function makeBrief(overrides: {
  totalItems?: number
  criticalCount?: number
  decisionsRequired?: number
  hasInsufficientEvidence?: boolean
  unavailableSources?: number
  staleSources?: number
  sections?: ExecutiveBriefDTO['sections']
} = {}): ExecutiveBriefDTO {
  return {
    meta: {
      schemaVersion: 'ExecutiveBriefDTO/1.0',
      generatedAt: '2026-07-28T10:00:00.000Z',
    },
    dataFreshness: overrides.unavailableSources
      ? 'unavailable'
      : overrides.staleSources
        ? 'stale'
        : 'live',
    evidenceCoverage: {
      totalSources: 3,
      availableSources: 3 - (overrides.unavailableSources ?? 0),
      staleSources: overrides.staleSources ?? 0,
      unavailableSources: overrides.unavailableSources ?? 0,
    },
    summary: {
      totalItems: overrides.totalItems ?? 0,
      criticalCount: overrides.criticalCount ?? 0,
      decisionsRequired: overrides.decisionsRequired ?? 0,
      hasInsufficientEvidence: overrides.hasInsufficientEvidence ?? false,
    },
    sections: overrides.sections ?? [],
  }
}

function makeBriefWithItems(
  count: number,
  criticalCount: number = 0,
): ExecutiveBriefDTO {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `brief-${i + 1}-test`,
    executiveOwner: 'chief-of-staff' as const,
    strategicAsset: 'Executive Attention',
    category: 'financial-attention' as const,
    title: `Test item ${i + 1}`,
    explanation: `Explanation for item ${i + 1}`,
    priority: (i < criticalCount ? 'critical' : 'normal') as 'critical' | 'normal',
    status: 'open' as const,
    recommendedAction: null,
    decisionRequired: i < criticalCount,
    dueAt: null,
    confidence: 'high' as const,
    impact: null,
    evidence: [{
      sourceId: 'test',
      sourceType: 'test',
      description: 'Test evidence',
      queriedAt: '2026-07-28T10:00:00.000Z',
      freshness: 'live' as const,
    }],
    sourceFreshness: 'live' as const,
    route: null,
  }))

  return makeBrief({
    totalItems: count,
    criticalCount,
    decisionsRequired: criticalCount,
    sections: count > 0
      ? [{
          category: 'financial-attention' as const,
          label: 'Financial Attention',
          items,
        }]
      : [],
  })
}

// ─── Test 1: allClear = true ───────────────────────────────────────────────

describe('allClear truth table', () => {
  test('true when 0 items and all sources available', () => {
    const brief = makeBrief({ totalItems: 0, hasInsufficientEvidence: false })
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.allClear).toBe(true)
    expect(result.health).toBe('healthy')
  })

  // ─── Test 2: allClear = null when source unavailable ───────────────────

  test('null when 0 items but source unavailable', () => {
    const brief = makeBrief({
      totalItems: 0,
      hasInsufficientEvidence: true,
      unavailableSources: 1,
    })
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.allClear).toBeNull()
    expect(result.health).toBeNull()
  })

  // ─── Test 3: allClear = false when items exist ─────────────────────────

  test('false when items exist (none critical)', () => {
    const brief = makeBriefWithItems(3, 0)
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.allClear).toBe(false)
    expect(result.health).toBe('attention')
  })

  // ─── Test 4: allClear = false when critical items exist ────────────────

  test('false when critical items exist', () => {
    const brief = makeBriefWithItems(2, 2)
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.allClear).toBe(false)
    expect(result.health).toBe('urgent')
  })
})

// ─── Test 5: brief failure → null ──────────────────────────────────────────

describe('brief failure', () => {
  test('null brief produces null allClear and null health', () => {
    const result = buildHomeBrief(null, 'Yossi', 'morning')

    expect(result.allClear).toBeNull()
    expect(result.health).toBeNull()
    expect(result.greetingMessage).toBeNull()
    expect(result.needsAttentionCount).toBeNull()
    expect(result.needsAttentionItems).toEqual([])
    expect(result.allClearHeadline).toBeNull()
    expect(result.allClearLines).toEqual([])
    expect(result.briefFreshness).toBeNull()
    expect(result.briefGeneratedAt).toBeNull()
    // ownerName and timeOfDay are always present
    expect(result.ownerName).toBe('Yossi')
    expect(result.timeOfDay).toBe('morning')
  })
})

// ─── Test 6: DailyGreeting null message ────────────────────────────────────

describe('greeting message derivation', () => {
  test('null when allClear is null (indeterminate)', () => {
    const brief = makeBrief({
      totalItems: 0,
      hasInsufficientEvidence: true,
      unavailableSources: 1,
    })
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.greetingMessage).toBeNull()
  })

  test('"Everything is handled." when allClear is true', () => {
    const brief = makeBrief({ totalItems: 0, hasInsufficientEvidence: false })
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.greetingMessage).toBe('Everything is handled.')
  })

  test('critical count message when critical items exist', () => {
    const brief = makeBriefWithItems(3, 2)
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.greetingMessage).toBe('2 items need your attention.')
  })

  test('review message when non-critical items exist', () => {
    const brief = makeBriefWithItems(1, 0)
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.greetingMessage).toBe("1 item to review when you're ready.")
  })
})

// ─── Test 7: AllClearCard content ──────────────────────────────────────────

describe('AllClearCard content', () => {
  test('populated when allClear is true', () => {
    const brief = makeBrief({ totalItems: 0, hasInsufficientEvidence: false })
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.allClearHeadline).not.toBeNull()
    expect(result.allClearLines.length).toBeGreaterThan(0)
  })

  test('null/empty when allClear is false', () => {
    const brief = makeBriefWithItems(1, 0)
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.allClearHeadline).toBeNull()
    expect(result.allClearLines).toEqual([])
  })

  test('null/empty when allClear is null', () => {
    const result = buildHomeBrief(null, 'Yossi', 'morning')

    expect(result.allClearHeadline).toBeNull()
    expect(result.allClearLines).toEqual([])
  })
})

// ─── Test 8: NeedsAttentionSection items ───────────────────────────────────

describe('attention items mapping', () => {
  test('maps Executive Brief items to HomeBriefAttentionItems', () => {
    const brief = makeBriefWithItems(2, 1)
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.needsAttentionItems).toHaveLength(2)
    expect(result.needsAttentionItems[0].severity).toBe('urgent') // critical → urgent
    expect(result.needsAttentionItems[1].severity).toBe('normal')
    expect(result.needsAttentionItems[0].title).toBe('Test item 1')
    expect(result.needsAttentionItems[0].executiveOwner).toBe('Executive Attention')
  })
})

// ─── Test 9: HealthSignal mapping ──────────────────────────────────────────

describe('health status mapping', () => {
  test('healthy when all clear', () => {
    const brief = makeBrief({ totalItems: 0, hasInsufficientEvidence: false })
    expect(buildHomeBrief(brief, 'Yossi', 'morning').health).toBe('healthy')
  })

  test('attention when items but no critical', () => {
    const brief = makeBriefWithItems(2, 0)
    expect(buildHomeBrief(brief, 'Yossi', 'morning').health).toBe('attention')
  })

  test('urgent when critical items exist', () => {
    const brief = makeBriefWithItems(1, 1)
    expect(buildHomeBrief(brief, 'Yossi', 'morning').health).toBe('urgent')
  })

  test('null when insufficient evidence', () => {
    const brief = makeBrief({
      totalItems: 0,
      hasInsufficientEvidence: true,
      unavailableSources: 1,
    })
    expect(buildHomeBrief(brief, 'Yossi', 'morning').health).toBeNull()
  })

  test('null when brief unavailable', () => {
    expect(buildHomeBrief(null, 'Yossi', 'morning').health).toBeNull()
  })
})

// ─── Test 10: Source metadata pass-through ─────────────────────────────────

describe('source metadata', () => {
  test('passes through briefFreshness and briefGeneratedAt', () => {
    const brief = makeBrief()
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    expect(result.briefFreshness).toBe('live')
    expect(result.briefGeneratedAt).toBe('2026-07-28T10:00:00.000Z')
  })

  test('null when brief unavailable', () => {
    const result = buildHomeBrief(null, 'Yossi', 'morning')

    expect(result.briefFreshness).toBeNull()
    expect(result.briefGeneratedAt).toBeNull()
  })
})

// ─── Test 11: HomeBriefDTO never contains fabricated counts ────────────────

describe('no fabricated data', () => {
  test('HomeBriefDTO has no aiTasksCompleted or aiDecisionsPending', () => {
    const brief = makeBrief()
    const result = buildHomeBrief(brief, 'Yossi', 'morning')

    // These fields should not exist in the type or the output
    expect('aiTasksCompleted' in result).toBe(false)
    expect('aiDecisionsPending' in result).toBe(false)
    expect('quickAction' in result).toBe(false)
    expect('lastVisit' in result).toBe(false)
  })
})

// ─── Test 12: Totality — every input produces valid output ─────────────────

describe('totality', () => {
  const timeSlots = ['morning', 'midday', 'afternoon', 'evening', 'night'] as const
  const briefStates: Array<{ label: string; brief: ExecutiveBriefDTO | null }> = [
    { label: 'null brief', brief: null },
    { label: '0 items, all available', brief: makeBrief() },
    { label: '0 items, 1 unavailable', brief: makeBrief({ totalItems: 0, hasInsufficientEvidence: true, unavailableSources: 1 }) },
    { label: '3 items, 0 critical', brief: makeBriefWithItems(3, 0) },
    { label: '2 items, 2 critical', brief: makeBriefWithItems(2, 2) },
  ]

  for (const time of timeSlots) {
    for (const { label, brief } of briefStates) {
      test(`produces valid HomeBriefDTO for ${label} at ${time}`, () => {
        let result: HomeBriefDTO | undefined
        let threw = false

        try {
          result = buildHomeBrief(brief, 'Yossi', time)
        } catch {
          threw = true
        }

        expect(threw).toBe(false)
        expect(result).toBeDefined()
        expect(result!.ownerName).toBe('Yossi')
        expect(result!.timeOfDay).toBe(time)
        // allClear is boolean or null — never undefined
        expect(result!.allClear === true || result!.allClear === false || result!.allClear === null).toBe(true)
        // health is BusinessHealthStatus or null — never undefined
        expect(
          result!.health === 'healthy' ||
          result!.health === 'attention' ||
          result!.health === 'urgent' ||
          result!.health === null
        ).toBe(true)
        // needsAttentionItems is always an array
        expect(Array.isArray(result!.needsAttentionItems)).toBe(true)
        expect(Array.isArray(result!.allClearLines)).toBe(true)
      })
    }
  }
})

// ─── Test 13: Determinism ──────────────────────────────────────────────────

describe('determinism', () => {
  test('same inputs produce identical outputs', () => {
    const brief = makeBriefWithItems(3, 1)
    const results = Array.from({ length: 100 }, () =>
      buildHomeBrief(brief, 'Yossi', 'morning')
    )

    const first = JSON.stringify(results[0])
    for (let i = 1; i < results.length; i++) {
      expect(JSON.stringify(results[i])).toBe(first)
    }
  })
})

// ─── Test 14: Authority boundary — no forbidden imports ────────────────────

describe('authority boundary (import audit)', () => {
  test('homeBriefService.ts contains no forbidden imports', () => {
    const filePath = path.resolve(__dirname, '../../lib/home/homeBriefService.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Forbidden patterns — must never appear
    const forbidden = [
      'createClient',
      'createServiceClient',
      'supabase',
      'evaluateDecisionAccess',
      'resolvePrincipal',
      'getAuthorizedExecutiveBrief',
      'fetch(',
      'axios',
      'unstable_cache',
      'revalidateTag',
      "from 'next/headers'",
      'cookies()',
      'headers()',
      '.rpc(',
      '.from(',
      '.select(',
      'async ',
      'Promise',
      'await ',
    ]

    for (const pattern of forbidden) {
      expect(source).not.toContain(pattern)
    }
  })
})

// ─── Test 15: Provider isolation — no providerId references ────────────────

describe('provider isolation', () => {
  test('homeBriefService.ts never references providerId', () => {
    const filePath = path.resolve(__dirname, '../../lib/home/homeBriefService.ts')
    const source = fs.readFileSync(filePath, 'utf-8')

    expect(source).not.toContain('providerId')
    expect(source).not.toContain('verification-tasks')
    expect(source).not.toContain('cashbox-positions')
    expect(source).not.toContain('pms-status')
  })
})
