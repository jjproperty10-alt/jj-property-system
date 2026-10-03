import fs from 'fs'
import path from 'path'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import {
  addContactLink,
  countStaffContacts,
  createStaffContact,
  deleteStaffContact,
  listContactLinks,
  getStaffEntity,
  listStaffAccountingRules,
  listStaffContacts,
  listStaffEntities,
  readContactOpeningBalances,
  removeContactLink,
  searchStaffContacts,
  upsertPartnershipCapital,
} from '@/lib/staff/restrictedStaffActions'

jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: jest.fn(),
}))

const authMock = authenticateStatementUser as jest.MockedFunction<typeof authenticateStatementUser>
const serviceMock = createServiceClient as jest.MockedFunction<typeof createServiceClient>
const staff = { ok: true as const, userId: 'staff-user', staffRole: 'finance_admin', isActive: true as const }

function builder(result: { data?: unknown; error?: { message: string } | null; count?: number | null }) {
  const api: Record<string, jest.Mock> & { then?: (resolve: (value: unknown) => void) => void } = {}
  for (const method of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'lte', 'order', 'ilike', 'limit']) {
    api[method] = jest.fn(() => api)
  }
  api.then = (resolve) => {
    resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null })
  }
  return api
}

function clientFor(result: { data?: unknown; error?: { message: string } | null; count?: number | null }) {
  const query = builder(result)
  const from = jest.fn(() => query)
  serviceMock.mockReturnValue({ from } as never)
  return { from, query }
}

beforeEach(() => {
  authMock.mockReset()
  serviceMock.mockReset()
})

describe('restricted staff actions', () => {
  test('a guest cannot read contacts and the service client stays closed', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const result = await listStaffContacts()
    expect(result).toEqual({ ok: false, error: 'not authorized' })
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('a signed-in non-staff user cannot write contacts', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    const result = await createStaffContact({
      name: 'Ada',
      type: 'owner',
      email: null,
      phone: null,
      property_name: null,
      notes: null,
    })
    expect(result).toEqual({ ok: false, error: 'not authorized' })
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('invalid contact input is rejected before the staff check', async () => {
    const result = await createStaffContact({
      name: ' ',
      type: 'owner',
      email: null,
      phone: null,
      property_name: null,
      notes: null,
    })
    expect(result).toEqual({ ok: false, error: 'invalid input' })
    expect(authMock).not.toHaveBeenCalled()
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('staff reads contacts only after the staff check', async () => {
    const order: string[] = []
    authMock.mockImplementation(async () => {
      order.push('auth')
      return staff
    })
    const query = builder({ data: [{ id: 'c1', name: 'Ada' }] })
    const from = jest.fn(() => {
      order.push('service')
      return query
    })
    serviceMock.mockImplementation(() => {
      order.push('client')
      return { from } as never
    })

    const result = await listStaffContacts()

    expect(result.ok).toBe(true)
    expect(from).toHaveBeenCalledWith('contacts')
    expect(order).toEqual(['auth', 'client', 'service'])
  })

  test('staff insert, delete, link, and search use the service role', async () => {
    authMock.mockResolvedValue(staff)
    const created = clientFor({})
    expect(await createStaffContact({
      name: 'Ada',
      type: 'owner',
      email: null,
      phone: null,
      property_name: null,
      notes: null,
    })).toEqual({ ok: true })
    expect(created.from).toHaveBeenCalledWith('contacts')
    expect(created.query.insert).toHaveBeenCalled()

    const removed = clientFor({})
    expect(await deleteStaffContact('contact-1')).toEqual({ ok: true })
    expect(removed.from).toHaveBeenCalledWith('contacts')
    expect(removed.query.delete).toHaveBeenCalled()

    const links = clientFor({ data: [{ id: 'l1', is_deleted: false }, { id: 'l2', is_deleted: true }] })
    const listed = await listContactLinks('Villa Mazotos')
    expect(listed).toEqual({ ok: true, links: [{ id: 'l1', is_deleted: false }] })
    expect(links.from).toHaveBeenCalledWith('contact_properties')

    const found = clientFor({ data: [{ id: 'c1', name: 'Ada', type: 'owner', is_deleted: false }] })
    expect(await searchStaffContacts('Ada')).toEqual({
      ok: true,
      contacts: [{ id: 'c1', name: 'Ada', type: 'owner' }],
    })
    expect(found.from).toHaveBeenCalledWith('contacts')

    const linked = clientFor({})
    expect(await addContactLink({
      contactId: 'contact-1',
      propertyName: 'Villa Mazotos',
      role: 'owner',
      status: 'confirmed',
    })).toEqual({ ok: true })
    expect(linked.from).toHaveBeenCalledWith('contact_properties')

    const unlinked = clientFor({})
    expect(await removeContactLink('link-1')).toEqual({ ok: true })
    expect(unlinked.query.update).toHaveBeenCalledWith({ is_deleted: true })
  })

  test('staff can upsert partnership capital and a guest cannot', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    const row = {
      property_name: 'Villa Mazotos',
      partner_name: 'Avi',
      ownership_percent: 50,
      entry_date: null,
      jj_original_acquisition_cost: null,
      partner_entry_valuation: 100,
      amount_paid_by_partner: 10,
      notes: null,
    }
    expect(await upsertPartnershipCapital(row)).toEqual({ ok: false, error: 'not authorized' })
    expect(serviceMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue({ ...staff, staffRole: 'ceo' })
    const saved = clientFor({})
    expect(await upsertPartnershipCapital(row)).toEqual({ ok: true })
    expect(saved.from).toHaveBeenCalledWith('partnership_capital')
    expect(saved.from).not.toHaveBeenCalledWith('user_roles')
    expect(saved.query.upsert).toHaveBeenCalled()
  })

  test('non-admin staff cannot upsert partnership capital', async () => {
    authMock.mockResolvedValue(staff)
    const row = {
      property_name: 'Villa Mazotos',
      partner_name: 'Avi',
      ownership_percent: 50,
      entry_date: null,
      jj_original_acquisition_cost: null,
      partner_entry_valuation: 100,
      amount_paid_by_partner: 10,
      notes: null,
    }
    const query = builder({ data: [{ role: 'employee', is_active: true }] })
    const from = jest.fn(() => query)
    serviceMock.mockReturnValue({ from } as never)

    expect(await upsertPartnershipCapital(row)).toEqual({ ok: false, error: 'not authorized' })
    expect(from).toHaveBeenCalledWith('user_roles')
    expect(from).not.toHaveBeenCalledWith('partnership_capital')
    expect(query.upsert).not.toHaveBeenCalled()
  })

  test('an active superadmin can upsert partnership capital without a ceo staff role', async () => {
    authMock.mockResolvedValue(staff)
    const row = {
      property_name: 'Villa Mazotos',
      partner_name: 'Avi',
      ownership_percent: 50,
      entry_date: null,
      jj_original_acquisition_cost: null,
      partner_entry_valuation: 100,
      amount_paid_by_partner: 10,
      notes: null,
    }
    const query = builder({ data: [{ role: 'superadmin', is_active: true }] })
    const from = jest.fn(() => query)
    serviceMock.mockReturnValue({ from } as never)

    expect(await upsertPartnershipCapital(row)).toEqual({ ok: true })
    expect(query.upsert).toHaveBeenCalled()
  })

  test('staff can read the entity tables that file 5 restricts', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    expect(await getStaffEntity('entity-1')).toEqual({ ok: false, error: 'not authorized' })
    expect(serviceMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue(staff)
    const entity = clientFor({ data: [{ id: 'entity-1', canonical_name: 'Villa Mazotos' }] })
    const loaded = await getStaffEntity('entity-1')
    expect(loaded.ok).toBe(true)
    expect(entity.from).toHaveBeenCalledWith('entity_registry')

    const listed = clientFor({ data: [] })
    expect((await listStaffEntities({ is_active: true })).ok).toBe(true)
    expect(listed.from).toHaveBeenCalledWith('entity_registry')

    const rules = clientFor({ data: [] })
    expect((await listStaffAccountingRules()).ok).toBe(true)
    expect(rules.from).toHaveBeenCalledWith('accounting_rules')
  })

  test('staff opening-balance read fills defaults and a guest gets nothing', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const denied = await readContactOpeningBalances({
      contactId: 'contact-1',
      propertyNames: ['Villa Mazotos'],
      asOfDate: '2026-10-03',
    })
    expect(denied).toEqual({ ok: false, error: 'not authorized' })
    expect(serviceMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue(staff)
    const loaded = clientFor({
      data: [{ id: 'ob1', property_name: 'Villa Mazotos', balance_eur: '12.5', as_of_date: '2026-01-01' }],
    })
    const result = await readContactOpeningBalances({
      contactId: 'contact-1',
      propertyNames: ['Villa Mazotos', 'Other House'],
      asOfDate: '2026-10-03',
    })
    expect(loaded.from).toHaveBeenCalledWith('contact_opening_balances')
    expect(result).toEqual({
      ok: true,
      entries: [
        { property_name: 'Villa Mazotos', balance_eur: 12.5, as_of_date: '2026-01-01', id: 'ob1', source: 'db' },
        { property_name: 'Other House', balance_eur: 0, as_of_date: null, id: null, source: 'default' },
      ],
    })
  })

  test('a bad opening-balance date never opens the service client', async () => {
    const result = await readContactOpeningBalances({
      contactId: 'contact-1',
      propertyNames: ['Villa Mazotos'],
      asOfDate: '03-10-2026',
    })
    expect(result).toEqual({ ok: false, error: 'invalid input' })
    expect(authMock).not.toHaveBeenCalled()
    expect(serviceMock).not.toHaveBeenCalled()
  })

  test('the settings contact count is staff-gated', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    expect(await countStaffContacts()).toEqual({ count: null, error: { message: 'not authorized' } })
    expect(serviceMock).not.toHaveBeenCalled()

    authMock.mockResolvedValue(staff)
    const counted = clientFor({ count: 4 })
    expect(await countStaffContacts()).toEqual({ count: 4, error: null })
    expect(counted.from).toHaveBeenCalledWith('contacts')
  })
})

describe('anon singleton does not touch the restricted tables', () => {
  const root = path.join(process.cwd(), 'src')

  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') return []
        return files(full)
      }
      return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
    })
  }

  test('no application file imports the anon singleton', () => {
    const importers = files(root).filter(file =>
      fs.readFileSync(file, 'utf8').includes("import { supabase } from '@/lib/supabase'"),
    )
    expect(importers).toEqual([])
  })

  test('no application file writes user_roles', () => {
    const offenders: string[] = []
    for (const file of files(root)) {
      const body = fs.readFileSync(file, 'utf8')
      if (body.includes('admin_manage_user_role')) offenders.push(file)
      const chunks = body.split("from('user_roles')").slice(1)
      for (const chunk of chunks) {
        const untilNextFrom = chunk.split('.from(')[0]
        if (/\.(insert|update|delete|upsert)\(/.test(untilNextFrom)) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
