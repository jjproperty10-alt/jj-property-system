import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import {
  countStaffRentalContracts,
  createStaffRentalContract,
  listStaffRentalContracts,
  readStaffRentalContract,
} from '@/lib/legacy/staffRentalContracts'

jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: jest.fn(),
}))

const authMock = authenticateStatementUser as jest.MockedFunction<typeof authenticateStatementUser>
const serviceMock = createServiceClient as jest.MockedFunction<typeof createServiceClient>

const staff = { ok: true as const, userId: 'staff-user', staffRole: 'ceo', isActive: true as const }
const contractId = '11111111-1111-4111-8111-111111111111'
const propertyId = '22222222-2222-4222-8222-222222222222'

function queryBuilder(rows: unknown[]) {
  const builder: Record<string, jest.Mock> & { then?: (resolve: (value: unknown) => void) => void } = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    insert: jest.fn(),
    single: jest.fn(async () => ({ data: rows[0] ?? null, error: null, count: null })),
  }
  for (const key of ['select', 'eq', 'order', 'limit', 'insert'] as const) {
    builder[key].mockReturnValue(builder)
  }
  builder.then = (resolve) => {
    resolve({ data: rows, error: null, count: rows.length })
  }
  return builder
}

const insertInput = {
  property_id: propertyId,
  tenant_name: 'Example tenant',
  start_date: '2026-01-01',
  end_date: null,
  monthly_rent: 1000,
  deposit: 0,
  payment_day: 1,
  management_fee_type: 'percentage' as const,
  management_fee_value: 10,
  notes: null,
}

beforeEach(() => {
  authMock.mockReset()
  serviceMock.mockReset()
})

describe('public rental contract staff gate', () => {
  test.each([
    ['guest', { ok: false as const, error: 'NO_SESSION' as const }],
    ['signed-in non-staff', { ok: false as const, error: 'NOT_STAFF' as const }],
    ['inactive staff', { ok: false as const, error: 'STAFF_INACTIVE' as const }],
  ])('%s cannot list, read, count, or create contracts', async (_label, auth) => {
    authMock.mockResolvedValue(auth)

    const listed = await listStaffRentalContracts('list')
    const read = await readStaffRentalContract(contractId)
    const counted = await countStaffRentalContracts()
    const created = await createStaffRentalContract(insertInput)

    expect(listed.error?.code).toBe('42501')
    expect(read.error?.code).toBe('42501')
    expect(counted.error?.code).toBe('42501')
    expect(created.error?.code).toBe('42501')
    expect(listed.data).toBeNull()
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('active staff reads only public.rental_contracts', async () => {
    authMock.mockResolvedValue(staff)
    const builder = queryBuilder([{ id: contractId, tenant_name: 'Example tenant' }])
    const from = jest.fn(() => builder)
    serviceMock.mockReturnValue({ from } as never)

    const result = await listStaffRentalContracts('list')

    expect(result.error).toBeNull()
    expect(result.data).toEqual([{ id: contractId, tenant_name: 'Example tenant' }])
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('rental_contracts')
  })

  test('a bad contract id is rejected before staff lookup', async () => {
    const result = await readStaffRentalContract('not-a-contract')

    expect(result.error?.code).toBe('22023')
    expect(authMock).not.toHaveBeenCalled()
    expect(serviceMock).not.toHaveBeenCalled()
  })
})
