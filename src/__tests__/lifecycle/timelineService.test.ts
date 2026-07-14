/**
 * @file timelineService.test.ts
 * @description Unit tests for lifecycle/timelineService.loadInvestmentTimeline()
 *
 * Hotfix coverage — entity_type filter bug (timeline 404 root cause):
 *   BEFORE: .eq('entity_type', 'person') → never matches 'investor' → always null → 404
 *   AFTER:  filter removed; canonical_name is unique; authorization via partner_entry
 *
 * Test matrix:
 *   T1  investor entity resolves correctly (Avi)
 *   T2  partner entity resolves correctly (Yossi)
 *   T3  unknown canonical_name returns null
 *   T4  known entity + wrong property returns null (authorization gate)
 *   T5  entity_type filter removal does not bypass partner_entry check
 *   T6  Avi / Villa Mazotos returns non-null DTO
 *   T7  Oren / Villa Mazotos 2 returns non-null DTO
 *   T8  cross-owner URL manipulation blocked (entity exists, partner_entry does not)
 *   T9  JJ fields never appear in returned DTO
 *   T10 financial values unchanged by filter fix
 */

import { loadInvestmentTimeline } from '@/lib/lifecycle/timelineService'
import { createServiceClient } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(),
}))

const mockCreateServiceClient = createServiceClient as jest.Mock

const AVI_ENTITY   = { id: 'avi-uuid',   entity_type: 'investor' }
const OREN_ENTITY  = { id: 'oren-uuid',  entity_type: 'investor' }
const YOSSI_ENTITY = { id: 'yossi-uuid', entity_type: 'partner'  }

const ENTRY_CHECK_ROW = [{ id: 'entry-uuid' }]

const SUMMARY_ROW = {
  ownership_percentage: 50,
  agreed_valuation_eur: 500000,
  required_capital_eur: 250000,
  capital_paid_eur: 250000,
  capital_remaining_eur: 0,
  total_distributions_eur: null,
  lifecycle_status: 'active',
}

const CAPITAL_EVENTS: unknown[] = [
  {
    id: 'evt-1',
    event_type: 'purchase_payment',
    amount_eur: 200000,
    effective_date: null,
    effective_date_confidence: 'pending_verification',
    description: 'Seller payment',
    payer_entity_id: 'jj-uuid',
    business_source: null,
    supersedes_event_id: null,
    status: 'active',
    running_capital_after: 200000,
    capital_remaining_after: 50000,
  },
]

const OWNERSHIP_PERIODS: unknown[] = []

function buildMockDb(overrides: {
  entityData?: unknown
  entityError?: unknown
  entryCheckData?: unknown
  entryCheckError?: unknown
  summaryData?: unknown
  capitalEventsData?: unknown
  ownershipPeriodsData?: unknown
  verificationTasksData?: unknown
} = {}) {
  let callIndex = 0
  const responses = [
    { data: overrides.entityData ?? AVI_ENTITY,          error: overrides.entityError     ?? null },
    { data: overrides.entryCheckData ?? ENTRY_CHECK_ROW, error: overrides.entryCheckError ?? null },
    { data: overrides.summaryData ?? SUMMARY_ROW,        error: null },
    { data: overrides.capitalEventsData ?? CAPITAL_EVENTS, error: null },
    { data: overrides.ownershipPeriodsData ?? OWNERSHIP_PERIODS, error: null },
    { data: overrides.verificationTasksData ?? [],        error: null },
  ]
  const chain: Record<string, unknown> = {}
  const methods = ['schema', 'from', 'select', 'eq', 'neq', 'in', 'single', 'limit', 'order', 'maybeSingle']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnThis() })
  const terminal = jest.fn().mockImplementation(() => {
    const resp = responses[callIndex] ?? { data: null, error: null }
    callIndex++
    return Promise.resolve(resp)
  })
  ;(chain['single']      as jest.Mock).mockImplementation(() => terminal())
  ;(chain['maybeSingle'] as jest.Mock).mockImplementation(() => terminal())
  ;(chain['limit']       as jest.Mock).mockImplementation(() => terminal())
  return chain
}

describe('loadInvestmentTimeline — entity_type filter hotfix', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('T1: resolves investor entity (entity_type=investor)', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: AVI_ENTITY }))
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')
    expect(dto).not.toBeNull()
    expect(dto?.owner.ownerName).toBe('Avi')
  })

  it('T2: resolves partner entity (entity_type=partner)', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: YOSSI_ENTITY }))
    const dto = await loadInvestmentTimeline('Yossi', 'Some Property')
    expect(dto).not.toBeNull()
    expect(dto?.owner.ownerName).toBe('Yossi')
  })

  it('T3: unknown canonical_name → null', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: null, entityError: { code: 'PGRST116' } }))
    const dto = await loadInvestmentTimeline('NoSuchPerson', 'Villa Mazotos')
    expect(dto).toBeNull()
  })

  it('T4: valid entity + wrong property → null (authorization gate)', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: AVI_ENTITY, entryCheckData: [] }))
    const dto = await loadInvestmentTimeline('Avi', 'Unrelated Property')
    expect(dto).toBeNull()
  })

  it('T5: entity_type filter removal does not bypass partner_entry check', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: AVI_ENTITY, entryCheckData: [] }))
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos 2')
    expect(dto).toBeNull()
  })

  it('T6: Avi / Villa Mazotos → returns DTO', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: AVI_ENTITY }))
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')
    expect(dto).not.toBeNull()
    expect(dto?.property.propertyName).toBe('Villa Mazotos')
  })

  it('T7: Oren / Villa Mazotos 2 → returns DTO (null capital stays null — P-ARCH-1)', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({
      entityData: OREN_ENTITY,
      summaryData: { ...SUMMARY_ROW, ownership_percentage: 35, agreed_valuation_eur: 520000, required_capital_eur: null, capital_paid_eur: null, capital_remaining_eur: null },
    }))
    const dto = await loadInvestmentTimeline('Oren', 'Villa Mazotos 2')
    expect(dto).not.toBeNull()
    expect(dto?.summary.capitalPaid).toBeNull()
    expect(dto?.summary.capitalRemaining).toBeNull()
  })

  it('T8: cross-owner URL manipulation → null', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: OREN_ENTITY, entryCheckData: [] }))
    const dto = await loadInvestmentTimeline('Oren', 'Villa Mazotos')
    expect(dto).toBeNull()
  })

  it('T9: JJ internal fields never appear in DTO (P-ARCH-6)', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: AVI_ENTITY }))
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')
    const dtoStr = JSON.stringify(dto)
    expect(dtoStr).not.toContain('jj_margin')
    expect(dtoStr).not.toContain('jj_cost_basis')
    expect(dtoStr).not.toContain('jj_net')
  })

  it('T10: financial values match source data exactly', async () => {
    mockCreateServiceClient.mockReturnValue(buildMockDb({ entityData: AVI_ENTITY }))
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')
    expect(dto?.summary.ownershipPercentage).toBe(50)
    expect(dto?.summary.agreedValuation).toBe(500000)
    expect(dto?.summary.requiredCapital).toBe(250000)
    expect(dto?.summary.capitalPaid).toBe(250000)
    expect(dto?.summary.capitalRemaining).toBe(0)
  })
})
