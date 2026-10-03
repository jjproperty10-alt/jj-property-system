/**
 * One verified company plus active staff membership lets the three paths
 * finish their reads. A missing company, a refused resolver, or a missing
 * staff/membership permission returns no data and sends no relation read.
 *
 * The company resolver SQL itself still does not read staff or membership.
 * These tests cover the session check that now runs before the reads.
 */
const mockState = {
  mode: 'ok' as 'ok' | 'throw' | 'null' | 'undefined' | 'empty',
  permission: 'allow' as 'allow' | 'nonstaff' | 'nonmember' | 'inactive' | 'rpc-error',
  companyId: '00000000-0000-4000-8000-00000000000a',
  sent: [] as string[],
  serviceResolves: 0,
  user: { id: 'user-1' } as { id: string } | null,
  rows: {
    v_cashbox_audit: [{ cash_box_name: 'JJ', balance: '10.00' }],
    v_anastasia_clearing: { anastasia_owes_jj: '7.00' },
    v_ceo_summary: { total_receivables: '2.00' },
    v_jj_company_pl: { net_company_pl: '3.00' },
    entity_registry: {
      id: 'entity-mazotos',
      canonical_name: 'Villa Mazotos',
      entity_type: 'partnership_property',
    },
    partnership_ownership: [
      {
        partner_name: 'Avi',
        ownership_pct: '50',
        effective_from: '2020-01-01',
        effective_to: null,
        confirmation_status: 'confirmed',
      },
    ],
  } as Record<string, unknown>,
}

jest.mock('@/lib/supabase', () => {
  const { gateServiceReads } = jest.requireActual<typeof import('@/lib/auth/serviceRoleCompanyGate')>(
    '@/lib/auth/serviceRoleCompanyGate',
  )

  function make(relation: string) {
    const filter = {
      eq() {
        return filter
      },
      order() {
        return filter
      },
      single() {
        return filter
      },
      maybeSingle() {
        return filter
      },
      limit() {
        return filter
      },
      gte() {
        return filter
      },
      lte() {
        return filter
      },
      in() {
        return filter
      },
      then(
        onFulfilled?: ((value: unknown) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
      ) {
        mockState.sent.push(relation)
        return Promise.resolve({ data: mockState.rows[relation] ?? null, error: null }).then(onFulfilled, onRejected)
      },
    }
    return filter
  }

  function buildClient(): {
    from: (relation: string) => { select: () => ReturnType<typeof make> }
    schema: () => ReturnType<typeof buildClient>
  } {
    const client = {
      from(relation: string) {
        return { select: () => make(relation) }
      },
      schema() {
        return buildClient()
      },
    }
    return client
  }

  function resolveCompany() {
    mockState.serviceResolves += 1
    if (mockState.mode === 'throw') throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
    if (mockState.mode === 'null' || mockState.mode === 'undefined' || mockState.mode === 'empty') {
      throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
    }
    return mockState.companyId
  }

  return {
    resolveSoleServiceCompany: () => Promise.resolve(resolveCompany()),
    createServiceClient: () => gateServiceReads(buildClient(), async () => resolveCompany()),
  }
})

function mockSessionRpc(fn: string) {
  if (mockState.permission === 'rpc-error') return { data: null, error: { message: 'rpc down' } }
  if (fn === 'require_jj_staff') {
    if (mockState.permission === 'nonstaff' || mockState.permission === 'inactive') {
      return { data: null, error: { message: 'not staff' } }
    }
    return { data: mockState.user?.id ?? null, error: null }
  }
  if (fn === 'is_company_member') {
    if (mockState.permission === 'nonmember') return { data: false, error: null }
    return { data: true, error: null }
  }
  return { data: null, error: { message: `unexpected rpc ${fn}` } }
}

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockState.user }, error: null }),
    },
    rpc: async (fn: string) => mockSessionRpc(fn),
    schema: () => ({
      rpc: async (fn: string) => mockSessionRpc(fn),
    }),
  }),
}))

function decisionArgs() {
  return {
    entityId: 'Jacob',
    entityType: 'partner',
    periodStart: new Date(2026, 6, 1),
    periodEnd: new Date(2026, 6, 31),
    decisionType: 'approve_withdrawal',
  }
}

async function loadComponents() {
  const [{ fetchAll }, { fetchOwnershipForProperty }, { loadFinanceDecision }] = await Promise.all([
    import('@/lib/ceo/fetchCeoDashboard'),
    import('@/lib/ownership/ownershipService'),
    import('@/lib/finance/loadFinanceDecision'),
  ])
  return { fetchAll, fetchOwnershipForProperty, loadFinanceDecision }
}

describe('one active company: the three clients still return their data', () => {
  beforeEach(() => {
    mockState.mode = 'ok'
    mockState.permission = 'allow'
    mockState.sent = []
    mockState.serviceResolves = 0
    mockState.user = { id: 'user-1' }
  })

  test('CEO page receives all 4 views, ownership is the real percentage, the decision page returns a position', async () => {
    const { fetchAll, fetchOwnershipForProperty, loadFinanceDecision } = await loadComponents()

    const dashboard = await fetchAll()
    expect(dashboard.errors).toEqual([])
    expect(dashboard.cashboxes).toEqual([{ cash_box_name: 'JJ', balance: '10.00' }])
    expect(dashboard.anastasia).toEqual({ anastasia_owes_jj: '7.00' })
    expect(dashboard.summary).toEqual({ total_receivables: '2.00' })
    expect(dashboard.pl).toEqual({ net_company_pl: '3.00' })
    expect(mockState.sent.slice().sort()).toEqual(
      ['v_anastasia_clearing', 'v_cashbox_audit', 'v_ceo_summary', 'v_jj_company_pl'].sort(),
    )

    mockState.sent = []
    const record = await fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')
    expect(record.entityId).toBe('entity-mazotos')
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.ownershipPct).toBe(50)
    expect(record.ownershipPct).not.toBe(100)
    expect(mockState.sent).toEqual(['entity_registry', 'partnership_ownership'])

    mockState.sent = []
    const loaded = await loadFinanceDecision(decisionArgs())
    expect(loaded.position.entityId).toBe('Jacob')
    expect(loaded.decision.entityId).toBe('Jacob')
    expect(loaded.decision.decisionType).toBe('approve_withdrawal')
    expect(mockState.sent).toEqual(expect.arrayContaining(['claim_templates', 'v_cashbox_audit']))
  })
})

describe('company context fail-closed: no view data and no ownership passthrough', () => {
  beforeEach(() => {
    mockState.permission = 'allow'
    mockState.sent = []
    mockState.serviceResolves = 0
    mockState.user = { id: 'user-1' }
  })

  async function expectNoData(mode: 'throw' | 'null' | 'undefined' | 'empty') {
    mockState.mode = mode
    mockState.sent = []
    const { fetchAll, fetchOwnershipForProperty } = await loadComponents()
    const dashboard = await fetchAll()
    expect(dashboard.cashboxes).toEqual([])
    expect(dashboard.anastasia).toBeNull()
    expect(dashboard.summary).toBeNull()
    expect(dashboard.pl).toBeNull()
    expect(dashboard.settlement).toBeNull()
    expect(dashboard.errors).toEqual(['BLOCKED_BY_COMPANY_CONTEXT'])
    await expect(fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')).rejects.toThrow(
      'BLOCKED_BY_COMPANY_CONTEXT',
    )
    expect(mockState.sent).toEqual([])
  }

  test('resolver throws', async () => {
    await expectNoData('throw')
  })

  test('resolver returns null', async () => {
    await expectNoData('null')
  })

  test('resolver returns undefined', async () => {
    await expectNoData('undefined')
  })

  test('resolver returns an empty string', async () => {
    await expectNoData('empty')
  })
})

describe('staff and membership fail closed before any service-role relation read', () => {
  beforeEach(() => {
    mockState.mode = 'ok'
    mockState.permission = 'allow'
    mockState.sent = []
    mockState.serviceResolves = 0
    mockState.user = { id: 'user-1' }
  })

  async function expectNoPermissionData() {
    const { fetchAll, fetchOwnershipForProperty, loadFinanceDecision } = await loadComponents()
    mockState.sent = []
    mockState.serviceResolves = 0
    const dashboard = await fetchAll()
    expect(dashboard.cashboxes).toEqual([])
    expect(dashboard.anastasia).toBeNull()
    expect(dashboard.summary).toBeNull()
    expect(dashboard.pl).toBeNull()
    expect(dashboard.errors).toEqual(['BLOCKED_BY_MISSING_PERMISSION'])
    await expect(fetchOwnershipForProperty('Villa Mazotos', 'Avi', '2026-06-01')).rejects.toThrow(
      'BLOCKED_BY_MISSING_PERMISSION',
    )
    await expect(loadFinanceDecision(decisionArgs())).rejects.toThrow('BLOCKED_BY_MISSING_PERMISSION')
    expect(mockState.sent).toEqual([])
  }

  test('staff + non-member returns no data and sends no read', async () => {
    mockState.permission = 'nonmember'
    await expectNoPermissionData()
  })

  test('member + non-staff returns no data and sends no read', async () => {
    mockState.permission = 'nonstaff'
    await expectNoPermissionData()
    expect(mockState.serviceResolves).toBe(0)
  })

  test('inactive staff returns no data and sends no read', async () => {
    mockState.permission = 'inactive'
    await expectNoPermissionData()
    expect(mockState.serviceResolves).toBe(0)
  })

  test('an RPC error returns no data and sends no read', async () => {
    mockState.permission = 'rpc-error'
    await expectNoPermissionData()
    expect(mockState.serviceResolves).toBe(0)
  })

  test('an unauthenticated user returns no data and sends no read', async () => {
    mockState.user = null
    await expectNoPermissionData()
    expect(mockState.serviceResolves).toBe(0)
  })
})
