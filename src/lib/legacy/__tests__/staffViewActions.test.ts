import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { readStaffView, type StaffViewRequest } from '@/lib/legacy/staffViewActions'

jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: jest.fn(),
}))

const authMock = authenticateStatementUser as jest.MockedFunction<typeof authenticateStatementUser>
const serviceMock = createServiceClient as jest.MockedFunction<typeof createServiceClient>

function queryBuilder(rows: unknown[]) {
  const builder: Record<string, jest.Mock> & { then?: (resolve: (value: unknown) => void) => void } = {
    select: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(async () => ({ data: rows[0] ?? null, error: null, count: null })),
  }
  for (const key of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit'] as const) {
    builder[key].mockReturnValue(builder)
  }
  builder.then = (resolve) => {
    resolve({ data: rows, error: null, count: rows.length })
  }
  return builder
}

const staff = { ok: true as const, userId: 'staff-user', staffRole: 'ceo', isActive: true as const }

beforeEach(() => {
  authMock.mockReset()
  serviceMock.mockReset()
})

describe('readStaffView authorization', () => {
  const clientTransactions: StaffViewRequest = {
    view: 'v_rpt_client_transactions',
    eq: { canonical_property_name: 'Example Property' },
  }

  test('a guest with no session gets nothing and the service client is not opened', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })

    const result = await readStaffView(clientTransactions)

    expect(result).toEqual({ data: null, error: { message: 'not authorized', code: '42501' }, count: null })
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('a signed-in user who is not active staff gets nothing', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })

    const result = await readStaffView(clientTransactions)

    expect(result.error?.code).toBe('42501')
    expect(result.data).toBeNull()
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('an inactive staff user gets nothing', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })

    const result = await readStaffView({ view: 'v_cashbox_audit' })

    expect(result.error?.code).toBe('42501')
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('an auth failure gets nothing', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'AUTH_ERROR' })

    const result = await readStaffView({ view: 'v_owner_balances' })

    expect(result.error?.code).toBe('42501')
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('a guest cannot read the client-report contact list', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })

    const result = await readStaffView({
      view: 'v_rpt_contact_properties',
      select: 'contact_id,contact_name,contact_type',
      order: { column: 'contact_name' },
      limit: 10000,
    })

    expect(result).toEqual({ data: null, error: { message: 'not authorized', code: '42501' }, count: null })
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('a signed-in user who is not staff cannot read the client-report property catalog', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })

    const result = await readStaffView({
      view: 'v_rpt_contact_properties',
      select: 'canonical_name',
      order: { column: 'canonical_name' },
      limit: 10000,
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('42501')
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('active staff can read the client-report contact list and no other name is queried', async () => {
    authMock.mockResolvedValue(staff)
    const builder = queryBuilder([{ contact_id: 'c1', contact_name: 'Example', contact_type: null }])
    const from = jest.fn(() => builder)
    serviceMock.mockReturnValue({ from } as never)

    const result = await readStaffView({
      view: 'v_rpt_contact_properties',
      select: 'contact_id,contact_name,contact_type',
      order: { column: 'contact_name' },
      limit: 10000,
    })

    expect(result.error).toBeNull()
    expect(result.data).toEqual([{ contact_id: 'c1', contact_name: 'Example', contact_type: null }])
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('v_rpt_contact_properties')
  })

  test('active staff can read one whitelisted view and no other name is queried', async () => {
    authMock.mockResolvedValue(staff)
    const builder = queryBuilder([{ property_name: 'Example' }])
    const from = jest.fn(() => builder)
    serviceMock.mockReturnValue({ from } as never)

    const result = await readStaffView({ view: 'v_property_summary', order: { column: 'name' } })

    expect(result.error).toBeNull()
    expect(result.data).toEqual([{ property_name: 'Example' }])
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('v_property_summary')
    expect(authMock).toHaveBeenCalledTimes(1)
  })
})

describe('readStaffView allow-list', () => {
  test.each([
    'transactions',
    'rental_contracts',
    'jj_staff_config',
    'v_client_property_ledger',
    'v_jj_company_pl',
    'v_open_balances',
    'v_settlement_verification',
    'v_property_summary;select',
  ])('rejects %s before staff lookup or a database read', async (view) => {
    const result = await readStaffView({ view: view as 'v_property_summary' })

    expect(result.error).toEqual({ message: 'view is not available', code: '22023' })
    expect(authMock).not.toHaveBeenCalled()
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('rejects a select list that is not a column name', async () => {
    const result = await readStaffView({
      view: 'v_rpt_client_transactions',
      select: 'id, tenant_name from rental_contracts',
    })

    expect(result.error?.code).toBe('22023')
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('rejects a filter column that is not an identifier', async () => {
    const result = await readStaffView({
      view: 'v_rpt_client_transactions',
      eq: { 'contact_id);drop': 'x' },
    })

    expect(result.error?.code).toBe('22023')
    expect(authMock).not.toHaveBeenCalled()
    expect(serviceMock).not.toHaveBeenCalled()
  })
})
