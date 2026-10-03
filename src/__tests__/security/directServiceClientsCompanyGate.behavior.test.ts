/**
 * One verified company lets the three former direct clients finish their reads.
 * A missing or empty company id, and a refused resolver, return no data and
 * send no read.
 *
 * FINDING: this gate does not check staff role or company membership.
 * resolve_service_read_company (see the throwaway test) allows only a userless
 * service_role session plus exactly one active company. It does not read
 * user_roles or access.company_memberships. requireDecisionSessionUser() only
 * checks that auth.getUser() returned a user. An authenticated user with no
 * staff role and no company membership is not rejected by either check.
 */
const mockState = {
  mode: 'ok' as 'ok' | 'throw' | 'null' | 'undefined' | 'empty',
  companyId: '00000000-0000-4000-8000-00000000000a',
  sent: [] as string[],
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { gateServiceReads } = require('@/lib/auth/serviceRoleCompanyGate')

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

  return {
    createServiceClient: () =>
      gateServiceReads(buildClient(), async () => {
        if (mockState.mode === 'throw') throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
        if (mockState.mode === 'null') return null
        if (mockState.mode === 'undefined') return undefined
        if (mockState.mode === 'empty') return ''
        return mockState.companyId
      }),
  }
})

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockState.user }, error: null }),
    },
  }),
}))

async function loadComponents() {
  const [{ fetchAll }, { fetchOwnershipForProperty }, { requireDecisionSessionUser }] = await Promise.all([
    import('@/app/(app)/page'),
    import('@/lib/ownership/ownershipService'),
    import('@/app/(app)/finance/decision/[partner]/[period]/page'),
  ])
  return { fetchAll, fetchOwnershipForProperty, requireDecisionSessionUser }
}

describe('one active company: the three clients still return their data', () => {
  beforeEach(() => {
    mockState.mode = 'ok'
    mockState.sent = []
    mockState.user = { id: 'user-1' }
  })

  test('CEO page receives all 4 views, ownership is the real percentage, getUser returns the session user', async () => {
    const { fetchAll, fetchOwnershipForProperty, requireDecisionSessionUser } = await loadComponents()

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
    const user = await requireDecisionSessionUser()
    expect(user.id).toBe('user-1')
    expect(mockState.sent).toEqual([])
  })
})

describe('company context fail-closed: no view data and no ownership passthrough', () => {
  beforeEach(() => {
    mockState.sent = []
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

describe('decision page session check', () => {
  beforeEach(() => {
    mockState.mode = 'ok'
    mockState.sent = []
  })

  test('unauthenticated getUser throws and reads nothing', async () => {
    mockState.user = null
    const { requireDecisionSessionUser } = await loadComponents()
    await expect(requireDecisionSessionUser()).rejects.toThrow('Not authenticated')
    expect(mockState.sent).toEqual([])
  })

  test('finding: an authenticated user with no staff role and no membership is not rejected', async () => {
    mockState.user = { id: 'user-without-staff-or-membership' }
    const { requireDecisionSessionUser } = await loadComponents()
    const user = await requireDecisionSessionUser()
    expect(user.id).toBe('user-without-staff-or-membership')
    expect(mockState.sent).toEqual([])
  })
})
