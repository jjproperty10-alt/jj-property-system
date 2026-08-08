/**
 * @jest Stage 0 — Statement Context Resolver Tests
 *
 * Tests resolveStatementContexts() against all required scenarios:
 *   - Single-context entities (managed_owner only, investment only)
 *   - Dual-context entities (separate contexts, never merged)
 *   - Zero-context entities
 *   - Edge cases: inactive, void, pending_verification, deduplication, cross-context isolation
 *
 * 8 Invariants verified:
 *   1. Uses G1 identity resolution pattern (nameToSlug matching)
 *   2. Never flattens both contexts into one property array
 *   3. Never lets one context authorize properties from the other
 *   4. No fabricated partner_entry records
 *   5. No fallback that silently changes business meaning
 *   6. Zero valid scopes → empty array, not guessed authority
 *   7. Deduplication only within same context
 *   8. Source evidence preserved for each context
 */

// ─── Mock setup ─────────────────────────────────────────────────────────────────

jest.mock('server-only', () => ({}), { virtual: true })

const mockSchema = jest.fn()

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    schema: mockSchema,
  }),
}))

import {
  resolveStatementContexts,
  INVESTMENT_AUTHORIZED_STATUSES,
  type StatementContext,
  type StatementContextResolution,
  type ManagedOwnerStatementContext,
  type InvestmentStatementContext,
  type SourceFailure,
} from '@/lib/statements/statementContextResolver'

// ─── Test data (matches production DB, verified 2 Aug 2026) ─────────────────────

const ENTITIES = {
  neer: { id: 'neer-uuid', canonical_name: 'Neer', entity_type: 'managed_client', status: 'active' },
  liora: { id: 'liora-uuid', canonical_name: 'Liora', entity_type: 'managed_client', status: 'active' },
  avi: { id: 'avi-uuid', canonical_name: 'Avi', entity_type: 'investor', status: 'active' },
  yossi: { id: 'yossi-uuid', canonical_name: 'Yossi', entity_type: 'partner', status: 'active' },
  oren: { id: 'oren-uuid', canonical_name: 'Oren', entity_type: 'investor', status: 'active' },
  jacob: { id: 'jacob-uuid', canonical_name: 'Jacob', entity_type: 'partner', status: 'active' },
  anastasia: { id: 'anastasia-uuid', canonical_name: 'Anastasia', entity_type: 'external', status: 'active' },
  inactive: { id: 'inactive-uuid', canonical_name: 'Inactive Owner', entity_type: 'managed_client', status: 'inactive' },
}

const MGMT_RELS = {
  neer: [
    { property_name: 'Apartment Neer Yoav Dekelia', verification_status: 'verified', valid_to: null, status: 'active' },
  ],
  liora: [
    { property_name: 'Liora Anafotia 202', verification_status: 'verified', valid_to: null, status: 'active' },
    { property_name: 'Liora Anafotia 101', verification_status: 'pending_verification', valid_to: null, status: 'active' },
  ],
  oren: [
    { property_name: 'Oren Aradipou', verification_status: 'verified', valid_to: null, status: 'active' },
    { property_name: 'Oren Kitty', verification_status: 'verified', valid_to: null, status: 'active' },
  ],
}

const PARTNER_ENTRIES = {
  avi: [
    { property_name: 'Villa Mazotos', status: 'confirmed' },
  ],
  yossi: [
    { property_name: 'Villa Mazotos', status: 'confirmed' },
  ],
  oren: [
    { property_name: 'Villa Mazotos 2', status: 'confirmed' },
  ],
}

// ─── Mock helper ────────────────────────────────────────────────────────────────

type MgmtRelRow = { property_name: string; verification_status: string; valid_to: string | null; status: string }
type PartnerEntryRow = { property_name: string; status: string }

interface SetupDBOptions {
  entities: typeof ENTITIES[keyof typeof ENTITIES][]
  mgmtRels: Record<string, MgmtRelRow[]>
  partnerEntries: Record<string, PartnerEntryRow[]>
  /** Inject error for specific sources. Key = table name, value = error message. */
  sourceErrors?: Record<string, string>
}

function setupDB(
  entities: typeof ENTITIES[keyof typeof ENTITIES][],
  mgmtRels: Record<string, MgmtRelRow[]>,
  partnerEntries: Record<string, PartnerEntryRow[]>,
  sourceErrors?: Record<string, string>,
) {
  const opts: SetupDBOptions = { entities, mgmtRels, partnerEntries, sourceErrors }
  mockSchema.mockImplementation((schema: string) => {
    if (schema !== 'lifecycle') throw new Error(`Unexpected schema: ${schema}`)
    return {
      from: (table: string) => {
        if (table === 'entity_identity') {
          if (opts.sourceErrors?.[table]) {
            return {
              select: () => { throw new Error(opts.sourceErrors![table]) },
            }
          }
          return {
            select: () => ({
              data: opts.entities,
              error: null,
            }),
          }
        }
        if (table === 'management_relationship') {
          if (opts.sourceErrors?.[table]) {
            return {
              select: () => ({
                eq: () => ({
                  is: () => { throw new Error(opts.sourceErrors![table]) },
                }),
              }),
            }
          }
          return {
            select: () => ({
              eq: (field: string, value: string) => {
                if (field !== 'entity_id') throw new Error(`Unexpected eq field: ${field}`)
                const rels = opts.mgmtRels[value] ?? []
                return {
                  is: () => ({
                    data: rels.filter(r => r.valid_to === null),
                    error: null,
                  }),
                }
              },
            }),
          }
        }
        if (table === 'partner_entry') {
          if (opts.sourceErrors?.[table]) {
            return {
              select: () => ({
                eq: () => { throw new Error(opts.sourceErrors![table]) },
              }),
            }
          }
          return {
            select: () => ({
              eq: (field: string, value: string) => {
                if (field !== 'entity_id') throw new Error(`Unexpected eq field: ${field}`)
                // DB query returns ALL rows (no server-side status filter).
                // Application-level allowlist is applied in the resolver.
                const entries = opts.partnerEntries[value] ?? []
                return {
                  data: entries,
                  error: null,
                }
              },
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    }
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ── 1. Single-context: managed_owner only ───────────────────────────────────────

describe('managed_owner only entities', () => {
  test('Neer → managed_owner with one verified property', async () => {
    setupDB(
      [ENTITIES.neer],
      { [ENTITIES.neer.id]: MGMT_RELS.neer },
      {},
    )

    const result = await resolveStatementContexts('neer')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(1)
    expect(result.entityId).toBe('neer-uuid')
    expect(result.canonicalName).toBe('Neer')

    const ctx = result.contexts[0] as ManagedOwnerStatementContext
    expect(ctx.kind).toBe('managed_owner')
    expect(ctx.managedProperties).toEqual(['Apartment Neer Yoav Dekelia'])
    expect(ctx.pendingProperties).toEqual([])
    expect(ctx.authority).toBe('management_relationship')
  })

  test('Liora → managed_owner with verified property; pending property is observable but NOT authorized', async () => {
    setupDB(
      [ENTITIES.liora],
      { [ENTITIES.liora.id]: MGMT_RELS.liora },
      {},
    )

    const result = await resolveStatementContexts('liora')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(1)

    const ctx = result.contexts[0] as ManagedOwnerStatementContext
    expect(ctx.kind).toBe('managed_owner')
    // Only the verified property grants statement authority
    expect(ctx.managedProperties).toEqual(['Liora Anafotia 202'])
    // Pending property is observable but does not grant authority
    expect(ctx.pendingProperties).toEqual(['Liora Anafotia 101'])
    expect(ctx.authority).toBe('management_relationship')
  })
})

// ── 2. Single-context: investment only ──────────────────────────────────────────

describe('investment only entities', () => {
  test('Avi → investment only (zero management_relationship)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: PARTNER_ENTRIES.avi },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(1)

    const ctx = result.contexts[0] as InvestmentStatementContext
    expect(ctx.kind).toBe('investment')
    expect(ctx.investmentProperties).toEqual(['Villa Mazotos'])
    expect(ctx.authority).toBe('partner_entry')
  })

  test('Yossi → investment only', async () => {
    setupDB(
      [ENTITIES.yossi],
      {},
      { [ENTITIES.yossi.id]: PARTNER_ENTRIES.yossi },
    )

    const result = await resolveStatementContexts('yossi')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(1)

    const ctx = result.contexts[0] as InvestmentStatementContext
    expect(ctx.kind).toBe('investment')
    expect(ctx.investmentProperties).toEqual(['Villa Mazotos'])
    expect(ctx.authority).toBe('partner_entry')
  })
})

// ── 3. Dual-context: managed_owner + investment, kept separate ──────────────────

describe('dual-context entities', () => {
  test('Oren → TWO separate contexts (managed_owner + investment), never merged', async () => {
    setupDB(
      [ENTITIES.oren],
      { [ENTITIES.oren.id]: MGMT_RELS.oren },
      { [ENTITIES.oren.id]: PARTNER_ENTRIES.oren },
    )

    const result = await resolveStatementContexts('oren')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(2)

    // First context: managed_owner
    const mgmt = result.contexts.find(c => c.kind === 'managed_owner') as ManagedOwnerStatementContext
    expect(mgmt).toBeDefined()
    expect(mgmt.managedProperties).toEqual(expect.arrayContaining(['Oren Aradipou', 'Oren Kitty']))
    expect(mgmt.managedProperties).toHaveLength(2)
    expect(mgmt.authority).toBe('management_relationship')

    // Second context: investment
    const inv = result.contexts.find(c => c.kind === 'investment') as InvestmentStatementContext
    expect(inv).toBeDefined()
    expect(inv.investmentProperties).toEqual(['Villa Mazotos 2'])
    expect(inv.authority).toBe('partner_entry')

    // INVARIANT 2: The two contexts have completely separate property arrays
    const mgmtProps = new Set(mgmt.managedProperties)
    const invProps = new Set(inv.investmentProperties)
    // No overlap (in Oren's case properties are naturally different)
    Array.from(invProps).forEach(p => {
      expect(mgmtProps.has(p)).toBe(false)
    })
  })
})

// ── 4. Zero-context entities ────────────────────────────────────────────────────

describe('zero-context entities', () => {
  test('Jacob → no contexts (partner with zero partner_entry rows)', async () => {
    setupDB(
      [ENTITIES.jacob],
      {},
      {},
    )

    const result = await resolveStatementContexts('jacob')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
    expect(result.entityId).toBe('jacob-uuid')
    expect(result.canonicalName).toBe('Jacob')
  })

  test('Anastasia → no contexts (external, no relationships)', async () => {
    setupDB(
      [ENTITIES.anastasia],
      {},
      {},
    )

    const result = await resolveStatementContexts('anastasia')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })
})

// ── 5. Unknown slug ─────────────────────────────────────────────────────────────

describe('unknown slug', () => {
  test('non-existent slug → entity_not_found', async () => {
    setupDB([], {}, {})

    const result = await resolveStatementContexts('nonexistent-slug')

    expect(result.status).toBe('entity_not_found')
    expect(result.contexts).toHaveLength(0)
    expect(result.entityId).toBeNull()
  })

  test('empty slug → entity_not_found', async () => {
    setupDB([], {}, {})

    const result = await resolveStatementContexts('')

    expect(result.status).toBe('entity_not_found')
    expect(result.contexts).toHaveLength(0)
  })

  test('whitespace slug → entity_not_found', async () => {
    setupDB([], {}, {})

    const result = await resolveStatementContexts('   ')

    expect(result.status).toBe('entity_not_found')
    expect(result.contexts).toHaveLength(0)
  })
})

// ── 5b. Ambiguous slug ────────────────────────────────────────────────────────

describe('ambiguous slug', () => {
  test('two entities with same slug → ambiguous_slug, no contexts, no fallback', async () => {
    // Two distinct entities whose canonical_name produces the same slug via nameToSlug
    // "David Cohen" and "David  Cohen" (double space) both → "david-cohen"
    const ambiguousEntities = [
      { id: 'david-1-uuid', canonical_name: 'David Cohen', entity_type: 'managed_client', status: 'active' },
      { id: 'david-2-uuid', canonical_name: 'David  Cohen', entity_type: 'managed_client', status: 'active' },
    ]

    // Both have valid management relationships — but neither should be authorized
    setupDB(
      ambiguousEntities,
      {
        'david-1-uuid': [
          { property_name: 'Property A', verification_status: 'verified', valid_to: null, status: 'active' },
        ],
        'david-2-uuid': [
          { property_name: 'Property B', verification_status: 'verified', valid_to: null, status: 'active' },
        ],
      },
      {},
    )

    const result = await resolveStatementContexts('david-cohen')

    // Must NOT pick either candidate
    expect(result.status).toBe('ambiguous_slug')
    expect(result.contexts).toHaveLength(0)
    // No entity evidence — ambiguity prevents selection
    expect(result.entityId).toBeNull()
    expect(result.canonicalName).toBeNull()
    expect(result.entityType).toBeNull()
    // No property queries should have been made — no silent authority grant
  })
})

// ── 6. Inactive entity ──────────────────────────────────────────────────────────

describe('inactive entity', () => {
  test('inactive entity → entity_inactive, no contexts', async () => {
    setupDB(
      [ENTITIES.inactive],
      { [ENTITIES.inactive.id]: [
        { property_name: 'Some Property', verification_status: 'verified', valid_to: null, status: 'active' },
      ]},
      {},
    )

    const result = await resolveStatementContexts('inactive-owner')

    expect(result.status).toBe('entity_inactive')
    expect(result.contexts).toHaveLength(0)
    expect(result.entityId).toBe('inactive-uuid')
  })
})

// ── 7. Inactive management relationship (valid_to set) ──────────────────────────

describe('inactive management relationship', () => {
  test('ended management relationship (valid_to set) is excluded', async () => {
    // The mock setup only returns rows where valid_to IS NULL (matching the query filter)
    // So we set up an entity with ONLY ended relationships
    const endedRels = [
      { property_name: 'Old Property', verification_status: 'verified', valid_to: '2025-12-31', status: 'active' },
    ]

    setupDB(
      [ENTITIES.neer],
      { [ENTITIES.neer.id]: endedRels },
      {},
    )

    const result = await resolveStatementContexts('neer')

    // The query filter (valid_to IS NULL) excludes the ended relationship
    // So no mgmt rows come back → no managed_owner context
    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })
})

// ── 8. Void partner_entry ───────────────────────────────────────────────────────

describe('void partner_entry', () => {
  test('void partner_entry is excluded', async () => {
    const voidEntry = [
      { property_name: 'Villa Mazotos', status: 'void' },
    ]

    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: voidEntry },
    )

    const result = await resolveStatementContexts('avi')

    // Application-level allowlist (INVESTMENT_AUTHORIZED_STATUSES) excludes void
    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })
})

// ── 9. Deduplication within managed_owner context ───────────────────────────────

describe('deduplication', () => {
  test('duplicate managed property deduplicated within managed_owner context', async () => {
    const dupeRels = [
      { property_name: 'Same Property', verification_status: 'verified', valid_to: null, status: 'active' },
      { property_name: 'Same Property', verification_status: 'verified', valid_to: null, status: 'active' },
      { property_name: 'Other Property', verification_status: 'verified', valid_to: null, status: 'active' },
    ]

    setupDB(
      [ENTITIES.neer],
      { [ENTITIES.neer.id]: dupeRels },
      {},
    )

    const result = await resolveStatementContexts('neer')

    const ctx = result.contexts[0] as ManagedOwnerStatementContext
    expect(ctx.managedProperties).toEqual(['Same Property', 'Other Property'])
    expect(ctx.managedProperties).toHaveLength(2)
  })

  test('duplicate investment property deduplicated within investment context', async () => {
    const dupeEntries = [
      { property_name: 'Villa Mazotos', status: 'confirmed' },
      { property_name: 'Villa Mazotos', status: 'confirmed' },
    ]

    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: dupeEntries },
    )

    const result = await resolveStatementContexts('avi')

    const ctx = result.contexts[0] as InvestmentStatementContext
    expect(ctx.investmentProperties).toEqual(['Villa Mazotos'])
    expect(ctx.investmentProperties).toHaveLength(1)
  })
})

// ── 10. Same property in both sources → remains in TWO separate contexts ────────

describe('same property in both sources', () => {
  test('same property_name in management_relationship AND partner_entry → two separate contexts, never cross-deduplicated', async () => {
    // Hypothetical: entity manages AND invests in same property
    const sharedPropertyEntity = {
      id: 'shared-uuid',
      canonical_name: 'Shared Entity',
      entity_type: 'investor',
      status: 'active',
    }

    setupDB(
      [sharedPropertyEntity],
      { [sharedPropertyEntity.id]: [
        { property_name: 'Villa Mazotos', verification_status: 'verified', valid_to: null, status: 'active' },
      ]},
      { [sharedPropertyEntity.id]: [
        { property_name: 'Villa Mazotos', status: 'confirmed' },
      ]},
    )

    const result = await resolveStatementContexts('shared-entity')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(2)

    const mgmt = result.contexts.find(c => c.kind === 'managed_owner') as ManagedOwnerStatementContext
    const inv = result.contexts.find(c => c.kind === 'investment') as InvestmentStatementContext

    // INVARIANT 2+7: Same property name appears in BOTH contexts, never cross-deduplicated
    expect(mgmt.managedProperties).toEqual(['Villa Mazotos'])
    expect(inv.investmentProperties).toEqual(['Villa Mazotos'])
  })
})

// ── 11. Cross-context isolation — Oren ──────────────────────────────────────────

describe('cross-context property isolation', () => {
  test('Oren management context cannot authorize Villa Mazotos 2', async () => {
    setupDB(
      [ENTITIES.oren],
      { [ENTITIES.oren.id]: MGMT_RELS.oren },
      { [ENTITIES.oren.id]: PARTNER_ENTRIES.oren },
    )

    const result = await resolveStatementContexts('oren')
    const mgmt = result.contexts.find(c => c.kind === 'managed_owner') as ManagedOwnerStatementContext

    // Villa Mazotos 2 is an investment property — must NOT appear in managed context
    expect(mgmt.managedProperties).not.toContain('Villa Mazotos 2')
  })

  test('Oren investment context cannot authorize Aradipou or Kitty', async () => {
    setupDB(
      [ENTITIES.oren],
      { [ENTITIES.oren.id]: MGMT_RELS.oren },
      { [ENTITIES.oren.id]: PARTNER_ENTRIES.oren },
    )

    const result = await resolveStatementContexts('oren')
    const inv = result.contexts.find(c => c.kind === 'investment') as InvestmentStatementContext

    // Aradipou and Kitty are managed properties — must NOT appear in investment context
    expect(inv.investmentProperties).not.toContain('Oren Aradipou')
    expect(inv.investmentProperties).not.toContain('Oren Kitty')
  })
})

// ── 12. Evidence preservation (invariant 8) ─────────────────────────────────────

describe('evidence preservation', () => {
  test('each context preserves its source authority', async () => {
    setupDB(
      [ENTITIES.oren],
      { [ENTITIES.oren.id]: MGMT_RELS.oren },
      { [ENTITIES.oren.id]: PARTNER_ENTRIES.oren },
    )

    const result = await resolveStatementContexts('oren')

    const mgmt = result.contexts.find(c => c.kind === 'managed_owner') as ManagedOwnerStatementContext
    const inv = result.contexts.find(c => c.kind === 'investment') as InvestmentStatementContext

    expect(mgmt.authority).toBe('management_relationship')
    expect(inv.authority).toBe('partner_entry')
  })

  test('resolution result preserves entity evidence trail', async () => {
    setupDB(
      [ENTITIES.oren],
      { [ENTITIES.oren.id]: MGMT_RELS.oren },
      { [ENTITIES.oren.id]: PARTNER_ENTRIES.oren },
    )

    const result = await resolveStatementContexts('oren')

    expect(result.entityId).toBe('oren-uuid')
    expect(result.canonicalName).toBe('Oren')
    expect(result.entityType).toBe('investor')
  })
})

// ── 13. pending_verification cannot silently grant authority ─────────────────────

describe('pending_verification governance', () => {
  test('entity with ONLY pending_verification relationships → no managed_owner context', async () => {
    const pendingOnlyRels = [
      { property_name: 'Pending Property', verification_status: 'pending_verification', valid_to: null, status: 'active' },
    ]

    const pendingEntity = {
      id: 'pending-only-uuid',
      canonical_name: 'Pending Only',
      entity_type: 'managed_client',
      status: 'active',
    }

    setupDB(
      [pendingEntity],
      { [pendingEntity.id]: pendingOnlyRels },
      {},
    )

    const result = await resolveStatementContexts('pending-only')

    // No managed_owner context because no verified relationships
    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })

  test('Liora pending property is observable but does not create statement authority', async () => {
    setupDB(
      [ENTITIES.liora],
      { [ENTITIES.liora.id]: MGMT_RELS.liora },
      {},
    )

    const result = await resolveStatementContexts('liora')

    const ctx = result.contexts[0] as ManagedOwnerStatementContext
    // Verified property → authorized for statement
    expect(ctx.managedProperties).toContain('Liora Anafotia 202')
    // Pending property → NOT authorized for statement, but observable
    expect(ctx.managedProperties).not.toContain('Liora Anafotia 101')
    expect(ctx.pendingProperties).toContain('Liora Anafotia 101')
  })
})

// ── 14. Source unavailable — identity query failure ─────────────────────────────

describe('source unavailable — identity query', () => {
  test('entity_identity query failure → source_unavailable', async () => {
    mockSchema.mockImplementation(() => ({
      from: () => ({
        select: () => {
          throw new Error('connection refused')
        },
      }),
    }))

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('source_unavailable')
    expect(result.contexts).toHaveLength(0)
  })
})

// ── 14b. Source unavailable — partial authority failures (Correction 1) ────────
//
// Evidence First: query error ≠ empty source.
// A failed authority query must not be treated as "no data" — it must be
// treated as "we don't know", and the resolver must return source_unavailable
// with explicit failedSources.

describe('Correction 1 — source query failures must not be swallowed', () => {
  test('management_relationship fails while partner_entry succeeds → source_unavailable, NOT investment-only', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: PARTNER_ENTRIES.avi },
      { management_relationship: 'timeout' },
    )

    const result = await resolveStatementContexts('avi')

    // Must NOT return 'resolved' with investment-only — that would falsely imply
    // management scope was checked and found absent
    expect(result.status).toBe('source_unavailable')
    expect(result.contexts).toHaveLength(0)
    expect(result.entityId).toBe('avi-uuid')
    expect(result.canonicalName).toBe('Avi')

    // Failed source is explicitly recorded
    expect(result.failedSources).toHaveLength(1)
    expect(result.failedSources[0].source).toBe('management_relationship')
    expect(result.failedSources[0].code).toBe('timeout')
  })

  test('partner_entry fails while management_relationship succeeds → source_unavailable, NOT managed-owner-only', async () => {
    setupDB(
      [ENTITIES.neer],
      { [ENTITIES.neer.id]: MGMT_RELS.neer },
      {},
      { partner_entry: 'connection reset' },
    )

    const result = await resolveStatementContexts('neer')

    // Must NOT return 'resolved' with managed-owner-only — that would falsely imply
    // investment scope was checked and found absent
    expect(result.status).toBe('source_unavailable')
    expect(result.contexts).toHaveLength(0)
    expect(result.entityId).toBe('neer-uuid')

    // Failed source is explicitly recorded
    expect(result.failedSources).toHaveLength(1)
    expect(result.failedSources[0].source).toBe('partner_entry')
    expect(result.failedSources[0].code).toBe('connection reset')
  })

  test('both authority queries fail → source_unavailable with both sources listed', async () => {
    setupDB(
      [ENTITIES.oren],
      {},
      {},
      {
        management_relationship: 'db locked',
        partner_entry: 'db locked',
      },
    )

    const result = await resolveStatementContexts('oren')

    expect(result.status).toBe('source_unavailable')
    expect(result.contexts).toHaveLength(0)
    expect(result.entityId).toBe('oren-uuid')

    // Both failures recorded
    expect(result.failedSources).toHaveLength(2)
    const sources = result.failedSources.map(f => f.source)
    expect(sources).toContain('management_relationship')
    expect(sources).toContain('partner_entry')
  })

  test('both sources return valid empty results → no_contexts (not source_unavailable)', async () => {
    setupDB(
      [ENTITIES.jacob],
      {},
      {},
    )

    const result = await resolveStatementContexts('jacob')

    // Empty valid results from both sources = absence proven
    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
    // No failed sources — both were successfully inspected
    expect(result.failedSources).toHaveLength(0)
  })

  test('resolved results always have empty failedSources', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: PARTNER_ENTRIES.avi },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('resolved')
    expect(result.failedSources).toHaveLength(0)
  })
})

// ── 14c. Investment status allowlist (Correction 2) ───────────────────────────
//
// Only statuses in INVESTMENT_AUTHORIZED_STATUSES grant investment authority.
// Unknown/draft/pending/null/future statuses must be excluded.
// Do not invent status meanings — use real production values where available
// and synthetic unexpected values only to prove fail-closed behavior.

describe('Correction 2 — investment status explicit allowlist', () => {
  test('INVESTMENT_AUTHORIZED_STATUSES contains only "confirmed"', () => {
    expect(Array.from(INVESTMENT_AUTHORIZED_STATUSES)).toEqual(['confirmed'])
  })

  test('confirmed → authorized (investment context created)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [{ property_name: 'Villa Mazotos', status: 'confirmed' }] },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(1)
    expect(result.contexts[0].kind).toBe('investment')
  })

  test('void → excluded (no investment context)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [{ property_name: 'Villa Mazotos', status: 'void' }] },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })

  test('null status → excluded (no investment context)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [{ property_name: 'Villa Mazotos', status: null as unknown as string }] },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })

  test('draft → excluded (no investment context)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [{ property_name: 'Villa Mazotos', status: 'draft' }] },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })

  test('pending → excluded (no investment context)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [{ property_name: 'Villa Mazotos', status: 'pending' }] },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })

  test('unexpected future status → excluded (fail-closed)', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [{ property_name: 'Villa Mazotos', status: 'approved_pending_review' }] },
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('no_contexts')
    expect(result.contexts).toHaveLength(0)
  })

  test('mixed statuses → only confirmed entries create investment authority', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: [
        { property_name: 'Villa Mazotos', status: 'confirmed' },
        { property_name: 'Another Property', status: 'draft' },
        { property_name: 'Third Property', status: 'pending' },
      ]},
    )

    const result = await resolveStatementContexts('avi')

    expect(result.status).toBe('resolved')
    expect(result.contexts).toHaveLength(1)
    const inv = result.contexts[0] as InvestmentStatementContext
    expect(inv.investmentProperties).toEqual(['Villa Mazotos'])
    // draft and pending entries are excluded from investment authority
    expect(inv.investmentProperties).not.toContain('Another Property')
    expect(inv.investmentProperties).not.toContain('Third Property')
  })
})

// ── 15. Type contract verification ──────────────────────────────────────────────

describe('type contract', () => {
  test('managed_owner context has all required fields', async () => {
    setupDB(
      [ENTITIES.neer],
      { [ENTITIES.neer.id]: MGMT_RELS.neer },
      {},
    )

    const result = await resolveStatementContexts('neer')
    const ctx = result.contexts[0] as ManagedOwnerStatementContext

    // Verify discriminated union fields
    expect(ctx).toHaveProperty('kind', 'managed_owner')
    expect(ctx).toHaveProperty('entityId')
    expect(ctx).toHaveProperty('canonicalName')
    expect(ctx).toHaveProperty('managedProperties')
    expect(ctx).toHaveProperty('pendingProperties')
    expect(ctx).toHaveProperty('authority', 'management_relationship')
    // Ensure investment fields are NOT present
    expect(ctx).not.toHaveProperty('investmentProperties')
  })

  test('investment context has all required fields', async () => {
    setupDB(
      [ENTITIES.avi],
      {},
      { [ENTITIES.avi.id]: PARTNER_ENTRIES.avi },
    )

    const result = await resolveStatementContexts('avi')
    const ctx = result.contexts[0] as InvestmentStatementContext

    // Verify discriminated union fields
    expect(ctx).toHaveProperty('kind', 'investment')
    expect(ctx).toHaveProperty('entityId')
    expect(ctx).toHaveProperty('canonicalName')
    expect(ctx).toHaveProperty('investmentProperties')
    expect(ctx).toHaveProperty('authority', 'partner_entry')
    // Ensure management fields are NOT present
    expect(ctx).not.toHaveProperty('managedProperties')
    expect(ctx).not.toHaveProperty('pendingProperties')
  })
})
