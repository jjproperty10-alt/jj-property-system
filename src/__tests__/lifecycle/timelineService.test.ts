/**
 * @file timelineService.test.ts
 * @description Tests for loadInvestmentTimeline() — Timeline Data Mapping Hotfix
 *
 * Defects covered:
 *   D1 — summary view must be queried by partner_name + property_name (not entity_id)
 *   D2 — capital_event.notes (DB) is selected and mapped → DTO event description
 *   D3 — verification_tasks filtered by source_id (not record_id)
 *   E  — schema/query errors must not silently produce Unknown values or empty timelines
 *
 * Business rules verified:
 *   Avi / Villa Mazotos: 50% ownership, €500K valuation, €250K required,
 *     €250K paid, €0 remaining, fully_paid, exactly 2 events (€200K + €50K)
 *   Oren / Villa Mazotos 2: 35% ownership, capital_paid = null (P-ARCH-1)
 *   No €30K event. No JJ internal fields. Cross-owner authorization enforced.
 */

import { loadInvestmentTimeline } from '@/lib/lifecycle/timelineService'
import { createServiceClient }    from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ createServiceClient: jest.fn() }))

const mockCreateServiceClient = createServiceClient as jest.Mock

// ── Mock builder ─────────────────────────────────────────────────────────────

interface MockResponse {
  data:    unknown
  error:   unknown
  count?:  number | null
}

interface MockDb {
  db:            Record<string, jest.Mock>
  eqHistory:     Array<[string, unknown]>
  selectHistory: string[]
  inHistory:     Array<[string, unknown[]]>
}

/**
 * Build a Supabase client mock that:
 *   - Returns sequential responses on terminal calls (.single(), .limit(), await-chain)
 *   - Captures all .eq(), .select(), and .in() calls for assertion
 *
 * Terminal resolution order:
 *   • .single()  → consumes next response (Steps 1, 2, 3)
 *   • .limit()   → consumes next response (Step 2 auth check)
 *   • await chain (for .order() and .in() endings) → consumes next response (Steps 4a–4d)
 */
function buildMockDb(responses: MockResponse[]): MockDb {
  const eqHistory:     Array<[string, unknown]>  = []
  const selectHistory: string[]                   = []
  const inHistory:     Array<[string, unknown[]]> = []
  let   callIndex = 0

  const terminal = (): Promise<MockResponse> => {
    const resp = responses[callIndex++] ?? { data: null, error: null }
    return Promise.resolve(resp)
  }

  const db: Record<string, jest.Mock> = {
    schema: jest.fn(),
    from:   jest.fn(),
    order:  jest.fn(),
    neq:    jest.fn(),
    // Capture select calls; also makes chain awaitable for count queries
    select: jest.fn(),
    eq:     jest.fn(),
    in:     jest.fn(),
    single: jest.fn(),
    limit:  jest.fn(),
  }

  // All chain methods return the mock db itself (chainable)
  db.schema.mockReturnValue(db)
  db.from.mockReturnValue(db)
  db.order.mockReturnValue(db)
  db.neq.mockReturnValue(db)

  db.select.mockImplementation((s: string) => {
    if (typeof s === 'string') selectHistory.push(s)
    return db
  })

  db.eq.mockImplementation((col: string, val: unknown) => {
    eqHistory.push([col, val])
    return db
  })

  db.in.mockImplementation((col: string, vals: unknown[]) => {
    inHistory.push([col, vals as unknown[]])
    return db
  })

  // Terminal calls consume the next response
  db.single.mockImplementation(terminal)
  db.limit.mockImplementation(terminal)

  // Make the chain itself awaitable (for queries ending with .order() or .in())
  // JavaScript calls .then() when you `await` a non-Promise object.
  ;(db as any).then = jest.fn().mockImplementation(
    (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      terminal().then(resolve, reject)
  )

  return { db, eqHistory, selectHistory, inHistory }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AVI_ENTITY  = { id: 'avi-uuid',  entity_type: 'investor' }
const OREN_ENTITY = { id: 'oren-uuid', entity_type: 'investor' }

const ENTRY_CHECK = [{ id: 'entry-uuid' }]

/** Matches actual v_partner_investment_statement column names. */
const AVI_SUMMARY = {
  property_name:              'Villa Mazotos',
  partner_name:               'Avi',
  ownership_pct:              50,
  agreed_entry_valuation_eur: 500000,
  required_entry_capital_eur: 250000,
  capital_paid_eur:           250000,
  capital_remaining_eur:      0,
  total_distributions_eur:    0,
  entry_status:               'fully_paid',
}

const OREN_SUMMARY = {
  property_name:              'Villa Mazotos 2',
  partner_name:               'Oren',
  ownership_pct:              35,
  agreed_entry_valuation_eur: 520000,
  required_entry_capital_eur: 182000,
  capital_paid_eur:           null,   // P-ARCH-1: capital unknown
  capital_remaining_eur:      null,
  total_distributions_eur:    0,
  entry_status:               'capital_unknown',
}

const AVI_PARTNER_ENTRY = {
  id:                         'pe-uuid',
  property_name:              'Villa Mazotos',
  entity_id:                  'avi-uuid',
  event_type:                 'partner_entry',
  event_nature:               'business_event',
  entry_date:                 null,
  entry_date_note:            'pending_verification',
  ownership_pct:              50,
  agreed_entry_valuation_eur: 500000,
  required_entry_capital_eur: 250000,
  status:                     'confirmed',
  created_at:                 '2026-07-01T00:00:00Z',
  business_source:            null,
}

/** D2: DB column is `notes`, not `description`. */
const AVI_CAPITAL_200K = {
  id:                        'cap-200k',
  property_name:             'Villa Mazotos',
  entity_id:                 'avi-uuid',
  event_type:                'capital_event',
  event_subtype:             'partner_entry_payment',
  event_nature:              'accounting_event',
  direction:                 'inflow',
  amount_eur:                200000,
  effective_date:            null,
  effective_date_confidence: 'pending_verification',
  notes:                     'Avi paid €200,000 directly to property seller.',
  payer_name:                'Avi',
  payee_name:                'Seller',
  status:                    'confirmed',
  created_at:                '2026-07-01T00:00:00Z',
  business_source:           null,
}

const AVI_CAPITAL_50K = {
  id:                        'cap-50k',
  property_name:             'Villa Mazotos',
  entity_id:                 'avi-uuid',
  event_type:                'capital_event',
  event_subtype:             'partner_entry_payment',
  event_nature:              'accounting_event',
  direction:                 'inflow',
  amount_eur:                50000,
  effective_date:            null,
  effective_date_confidence: 'pending_verification',
  notes:                     'Avi paid €50,000 to Yossi as entry settlement. The single correct amount — legacy €30,000 was incorrect.',
  payer_name:                'Avi',
  payee_name:                'Yossi',
  status:                    'confirmed',
  created_at:                '2026-07-02T00:00:00Z',
  business_source:           null,
}

const OREN_PARTNER_ENTRY = {
  id:                         'oren-pe-uuid',
  property_name:              'Villa Mazotos 2',
  entity_id:                  'oren-uuid',
  event_type:                 'partner_entry',
  event_nature:               'business_event',
  entry_date:                 null,
  entry_date_note:            'pending_verification',
  ownership_pct:              35,
  agreed_entry_valuation_eur: 520000,
  required_entry_capital_eur: 182000,
  status:                     'confirmed',
  created_at:                 '2026-07-01T00:00:00Z',
  business_source:            null,
}

// ── Happy-path helpers ────────────────────────────────────────────────────────

/**
 * Avi / Villa Mazotos — 7 sequential responses:
 * 1. entity_identity  → AVI_ENTITY
 * 2. partner_entry auth check  → ENTRY_CHECK
 * 3. v_partner_investment_statement  → AVI_SUMMARY
 * 4a. partner_entry rows  → [AVI_PARTNER_ENTRY]
 * 4b. capital_event rows  → [AVI_CAPITAL_200K, AVI_CAPITAL_50K]
 * 4c. ownership_period rows  → []
 * 4d. verification_tasks rows → 2 task rows (D3 F3: SELECT rows, not COUNT)
 */
function aviHappyPath(): MockDb {
  return buildMockDb([
    { data: AVI_ENTITY,                          error: null },
    { data: ENTRY_CHECK,                         error: null },
    { data: AVI_SUMMARY,                         error: null },
    { data: [AVI_PARTNER_ENTRY],                 error: null },
    { data: [AVI_CAPITAL_200K, AVI_CAPITAL_50K], error: null },
    { data: [],                                  error: null },
    {
      // D3 F3: SELECT rows (not COUNT). Two tasks for Avi's capital events.
      data: [
        { id: 'task-1', priority: 'high', source_table: 'capital_event', source_id: 'cap-200k', missing_field: 'effective_date' },
        { id: 'task-2', priority: 'high', source_table: 'capital_event', source_id: 'cap-50k',  missing_field: 'effective_date' },
      ],
      error: null,
    },
  ])
}

/**
 * Oren / Villa Mazotos 2 — 7 sequential responses.
 * No capital events (capital_unknown).
 */
function orenHappyPath(): MockDb {
  return buildMockDb([
    { data: OREN_ENTITY,          error: null },
    { data: [{ id: 'oren-pe' }],  error: null },
    { data: OREN_SUMMARY,         error: null },
    { data: [OREN_PARTNER_ENTRY], error: null },
    { data: [],                   error: null },   // no capital events
    { data: [],                   error: null },   // no ownership periods
    {
      // D3 F3: SELECT rows — 1 task for oren-pe-uuid
      data: [
        { id: 'task-3', priority: 'high', source_table: 'partner_entry', source_id: 'oren-pe-uuid', missing_field: 'effective_from' },
      ],
      error: null,
    },
  ])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('loadInvestmentTimeline — data mapping hotfix (D1/D2/D3/E)', () => {
  beforeEach(() => jest.clearAllMocks())

  // ─── D1: partner_name on summary view ──────────────────────────────────────

  it('T1 (D1): summary view is queried by partner_name', async () => {
    const { db, eqHistory } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    expect(dto).not.toBeNull()
    expect(eqHistory).toContainEqual(['partner_name', 'Avi'])
  })

  it('T2 (D1): summary view is also filtered by property_name', async () => {
    const { db, eqHistory } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    // Both partner_name and property_name must appear as eq calls for the view
    expect(eqHistory).toContainEqual(['partner_name',  'Avi'          ])
    expect(eqHistory).toContainEqual(['property_name', 'Villa Mazotos'])
  })

  // ─── D2: notes → description mapping ───────────────────────────────────────

  it('T3 (D2): capital_event select includes "notes", not "description" as a bare column', async () => {
    const { db, selectHistory } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const hasNotes = selectHistory.some(s => s.includes('notes'))
    expect(hasNotes).toBe(true)

    // `description` must not appear as a column name in any select
    // (it does not exist in the DB — it is a projection interface field only)
    const descriptionColumns = selectHistory.flatMap(s =>
      s.split(',').map(f => f.trim()).filter(f => f === 'description')
    )
    expect(descriptionColumns).toHaveLength(0)
  })

  it('T4 (D2): capital_event.notes is mapped to DTO event description', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const capitalEvts = dto?.events.filter(e => e.eventType === 'capital_event') ?? []
    const event200k   = capitalEvts.find(e => e.amount === 200000)
    const event50k    = capitalEvts.find(e => e.amount === 50000)

    // notes value must appear as description in the projected event
    expect(event200k?.description).toContain('200,000')
    expect(event50k?.description).toContain('50,000')
  })

  // ─── D3: source_id on verification_tasks ────────────────────────────────────

  it('T5 (D3): verification_tasks uses source_id, never record_id', async () => {
    const { db, inHistory } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const sourceIdCalls = inHistory.filter(([col]) => col === 'source_id')
    expect(sourceIdCalls.length).toBeGreaterThanOrEqual(1)

    const recordIdCalls = inHistory.filter(([col]) => col === 'record_id')
    expect(recordIdCalls).toHaveLength(0)
  })

  it('T6 (D3): relevant verification task rows are reflected in DTO evidence count', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    // Mock returns 2 task rows for Avi's two capital events (F3: SELECT rows, not COUNT)
    expect(dto?.evidence.openVerificationTasks).toBe(2)
  })

  it('T7 (D3): verification_tasks query skipped when allEventIds is empty', async () => {
    // Avi auth passes but all event queries return empty arrays
    const { db, inHistory } = buildMockDb([
      { data: AVI_ENTITY,    error: null },
      { data: ENTRY_CHECK,   error: null },
      { data: AVI_SUMMARY,   error: null },
      { data: [],            error: null },   // no partner_entry rows
      { data: [],            error: null },   // no capital events
      { data: [],            error: null },   // no ownership periods
      // No 7th call — task query is guarded by allEventIds.length > 0
    ])
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    expect(dto?.evidence.openVerificationTasks).toBe(0)
    // source_id .in() must not have been called
    const sourceIdCalls = inHistory.filter(([col]) => col === 'source_id')
    expect(sourceIdCalls).toHaveLength(0)
  })

  // ─── E: explicit error handling ─────────────────────────────────────────────

  it('T8 (E): schema error on summary view throws — does not produce silent Unknown', async () => {
    const SCHEMA_ERR = {
      data:  null,
      error: { code: 'PGRST200', message: 'column entity_id does not exist', hint: null },
    }
    const { db } = buildMockDb([
      { data: AVI_ENTITY,    error: null },
      { data: ENTRY_CHECK,   error: null },
      SCHEMA_ERR,   // summary view schema error
    ])
    mockCreateServiceClient.mockReturnValue(db)

    await expect(loadInvestmentTimeline('Avi', 'Villa Mazotos'))
      .rejects.toThrow('[timelineService] summary view query failed')
  })

  // ─── Business correctness ──────────────────────────────────────────────────

  it('T9: unknown capital (Oren) stays null — P-ARCH-1', async () => {
    const { db } = orenHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Oren', 'Villa Mazotos 2')

    expect(dto?.summary.capitalPaid).toBeNull()
    expect(dto?.summary.capitalRemaining).toBeNull()
    expect(dto?.property.lifecycleStatus).toBe('capital_unknown')
  })

  it('T10: Avi summary is fully populated', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    expect(dto?.summary.currentOwnershipPct).toBe(50)
    expect(dto?.summary.agreedEntryValuation).toBe(500000)
    expect(dto?.summary.requiredCapital).toBe(250000)
    expect(dto?.summary.capitalPaid).toBe(250000)
    expect(dto?.summary.capitalRemaining).toBe(0)
    expect(dto?.property.lifecycleStatus).toBe('fully_paid')
  })

  it('T11: Avi has exactly two capital events in timeline', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const capitalEvts = dto?.events.filter(e => e.eventType === 'capital_event') ?? []
    expect(capitalEvts).toHaveLength(2)
  })

  it('T12: Avi €50,000 event appears exactly once', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const evts50k = dto?.events.filter(e => e.amount === 50000) ?? []
    expect(evts50k).toHaveLength(1)
  })

  it('T13: no €30,000 event appears in Avi timeline', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const evts30k = dto?.events.filter(e => e.amount === 30000) ?? []
    expect(evts30k).toHaveLength(0)
  })

  it('T14: Oren capital paid and remaining remain null (capital_unknown)', async () => {
    const { db } = orenHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Oren', 'Villa Mazotos 2')

    expect(dto).not.toBeNull()
    expect(dto?.summary.capitalPaid).toBeNull()
    expect(dto?.summary.capitalRemaining).toBeNull()
    expect(dto?.summary.currentOwnershipPct).toBe(35)
    expect(dto?.summary.agreedEntryValuation).toBe(520000)
  })

  it('T15: no JJ internal fields leak into partner DTO (P-ARCH-6)', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const str = JSON.stringify(dto)
    expect(str).not.toContain('jj_margin')
    expect(str).not.toContain('jj_cost_basis')
    expect(str).not.toContain('jj_net')
    expect(str).not.toContain('jj_total_cost')
    expect(str).not.toContain('jj_purchase_price')
  })

  it('T16: cross-owner URL manipulation is blocked', async () => {
    // Oren entity exists but has no partner_entry for Villa Mazotos (Avi's property)
    const { db } = buildMockDb([
      { data: OREN_ENTITY, error: null },
      { data: [],          error: null },   // no partner_entry → unauthorized
    ])
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Oren', 'Villa Mazotos')

    expect(dto).toBeNull()
  })

  it('T17: financial amounts are not modified by service (€200K + €50K = €250K required)', async () => {
    const { db } = aviHappyPath()
    mockCreateServiceClient.mockReturnValue(db)
    const dto = await loadInvestmentTimeline('Avi', 'Villa Mazotos')

    const capitalEvts = dto?.events.filter(e => e.eventType === 'capital_event') ?? []
    const total = capitalEvts.reduce((sum, e) => sum + (e.amount ?? 0), 0)

    expect(total).toBe(250000)           // 200K + 50K = 250K = requiredCapital
    expect(dto?.summary.requiredCapital).toBe(250000)
    expect(total).toBe(dto?.summary.requiredCapital)
  })
})
