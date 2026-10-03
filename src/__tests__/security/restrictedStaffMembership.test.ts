/**
 * Restricted staff actions go through the real createServiceClient().
 * A staff user who is not a member of the resolved company is denied and
 * no relation is read. A staff member can read contacts. Capital upsert
 * still denies a member who is not an admin, and still allows an active
 * user_roles superadmin. The service client is not asked for user_roles.
 */
const sent: string[] = []
const session = {
  userId: 'user-1' as string | null,
  staff: 'user-1' as string | null,
  member: true as boolean | null,
  staffRole: 'finance_admin',
  roleRows: [] as Array<{ role?: string; is_active?: boolean }>,
}

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: session.userId ? { id: session.userId } : null },
        error: null,
      }),
    },
    rpc: async (fn: string) => {
      if (fn === 'require_jj_staff') {
        return session.staff
          ? { data: session.staff, error: null }
          : { data: null, error: { message: 'not staff' } }
      }
      if (fn === 'is_company_member') {
        return { data: session.member, error: null }
      }
      return { data: null, error: { message: fn } }
    },
    from(relation: string) {
      sent.push(`session:${relation}`)
      const row = {
        select() {
          return row
        },
        eq() {
          return row
        },
        limit() {
          return row
        },
        then(
          onFulfilled?: ((value: unknown) => unknown) | null,
          onRejected?: ((reason: unknown) => unknown) | null,
        ) {
          return Promise.resolve({ data: session.roleRows, error: null }).then(onFulfilled, onRejected)
        },
      }
      return row
    },
  }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: 'company-1', error: null }),
    from(relation: string) {
      sent.push(relation)
      const row: Record<string, () => unknown> = {}
      const chain = () => row
      for (const method of ['select', 'eq', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'upsert', 'update', 'delete', 'ilike']) {
        row[method] = chain
      }
      row.then = (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => {
        const data = relation === 'jj_staff_config'
          ? { staff_role: session.staffRole, is_active: true }
          : relation === 'contacts'
            ? [{ id: 'c1', name: 'Ada' }]
            : null
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
      }
      return row
    },
  }),
}))

function capitalRow() {
  return {
    property_name: 'Villa Mazotos',
    partner_name: 'Avi',
    ownership_percent: 50,
    entry_date: null,
    jj_original_acquisition_cost: null,
    partner_entry_valuation: 100,
    amount_paid_by_partner: 10,
    notes: null,
  }
}

beforeEach(() => {
  sent.length = 0
  session.userId = 'user-1'
  session.staff = 'user-1'
  session.member = true
  session.staffRole = 'finance_admin'
  session.roleRows = []
})

describe('restricted staff actions and company membership', () => {
  test('a staff non-member is denied and no relation is read', async () => {
    session.member = false
    const { listStaffContacts } = await import('@/lib/staff/restrictedStaffActions')
    await expect(listStaffContacts()).resolves.toEqual({ ok: false, error: 'not authorized' })
    expect(sent).toEqual([])
  })

  test('a staff member can read contacts', async () => {
    const { listStaffContacts } = await import('@/lib/staff/restrictedStaffActions')
    const result = await listStaffContacts()
    expect(result).toEqual({ ok: true, contacts: [{ id: 'c1', name: 'Ada' }] })
    expect(sent).toContain('jj_staff_config')
    expect(sent).toContain('contacts')
    expect(sent).not.toContain('user_roles')
  })

  test('admin-only capital upsert denies a staff member who is not an admin', async () => {
    session.roleRows = [{ role: 'employee', is_active: true }]
    const { upsertPartnershipCapital } = await import('@/lib/staff/restrictedStaffActions')
    await expect(upsertPartnershipCapital(capitalRow())).resolves.toEqual({ ok: false, error: 'not authorized' })
    expect(sent).toContain('session:user_roles')
    expect(sent).not.toContain('user_roles')
    expect(sent).not.toContain('partnership_capital')
  })

  test('an active superadmin can upsert capital without a ceo staff role', async () => {
    session.roleRows = [{ role: 'superadmin', is_active: true }]
    const { upsertPartnershipCapital } = await import('@/lib/staff/restrictedStaffActions')
    await expect(upsertPartnershipCapital(capitalRow())).resolves.toEqual({ ok: true })
    expect(sent).toContain('session:user_roles')
    expect(sent).not.toContain('user_roles')
    expect(sent).toContain('partnership_capital')
  })
})
