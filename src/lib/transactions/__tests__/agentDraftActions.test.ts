jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockFrom = jest.fn()
const mockFinanceFrom = jest.fn()
const mockSession = {
  from: (...args: unknown[]) => mockFrom(...args),
  schema: (name: string) => {
    if (name !== 'finance') throw new Error(`unexpected schema ${name}`)
    return { from: (...args: unknown[]) => mockFinanceFrom(...args) }
  },
}

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => mockSession,
}))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => {
    throw new Error('service-role must not write drafts')
  },
}))

import { createAgentTransactionDraft } from '../agentDraftActions'
import { DRAFT_NOT_POSTED_MESSAGE } from '@/lib/ledger/agentDraft'

function staffAuth() {
  return { ok: true as const, userId: 'staff-user-1', staffRole: 'operations', isActive: true }
}

function chainInsert(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const api: Record<string, unknown> = {}
  api.insert = jest.fn(() => api)
  api.select = jest.fn(() => api)
  api.eq = jest.fn(() => api)
  api.maybeSingle = jest.fn(() => Promise.resolve(result))
  return api
}

describe('createAgentTransactionDraft', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFrom.mockReset()
    mockFinanceFrom.mockReset()
  })

  it('denies partner/owner (not staff)', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    const r = await createAgentTransactionDraft({
      date: '2026-09-16',
      property_name: 'Villa Mazotos',
      category: 'Management',
      subcategory: 'Other',
      idempotency_key: 'k1',
      role: 'owner',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/not authorized/i)
    expect(mockFinanceFrom).not.toHaveBeenCalled()
  })

  it('authorized staff can create a draft with NULL empty amount', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('properties')
      return { select: () => Promise.resolve({ data: [{ id: 'vm1', name: 'Villa Mazotos' }], error: null }) }
    })
    const inserted = chainInsert({ data: { id: 'draft-1', status: 'draft' }, error: null })
    mockFinanceFrom.mockReturnValue(inserted)

    const r = await createAgentTransactionDraft({
      date: '2026-09-16',
      property_name: 'Villa Mazotos',
      category: 'Management',
      subcategory: 'Other',
      amount_eur: '',
      idempotency_key: 'k2',
      role: 'ceo',
      staffRole: 'owner',
    })
    expect(r).toEqual({
      ok: true,
      draftId: 'draft-1',
      status: 'draft',
      message: DRAFT_NOT_POSTED_MESSAGE,
      reusedExisting: false,
    })
    const payload = (inserted.insert as jest.Mock).mock.calls[0][0][0]
    expect(payload.amount_eur).toBeNull()
    expect(payload.created_by).toBe('staff-user-1')
    expect(payload.posted_transaction_id).toBeNull()
    expect(payload.status).toBe('draft')
    expect(mockFrom).not.toHaveBeenCalledWith('transactions')
  })

  it('unresolved property becomes needs_review and keeps property_id null', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({ data: [{ id: 'vm1', name: 'Villa Mazotos' }], error: null }),
    })
    const inserted = chainInsert({ data: { id: 'draft-2', status: 'needs_review' }, error: null })
    mockFinanceFrom.mockReturnValue(inserted)

    const r = await createAgentTransactionDraft({
      date: '2026-09-16',
      property_name: 'Not A Real Property',
      category: 'Airbnb',
      subcategory: 'Cleaning',
      idempotency_key: 'k3',
    })
    expect(r.ok).toBe(true)
    const payload = (inserted.insert as jest.Mock).mock.calls[0][0][0]
    expect(payload.property_id).toBeNull()
    expect(payload.status).toBe('needs_review')
  })

  it('duplicate idempotency key does not insert a second draft', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({ data: [{ id: 'vm1', name: 'Villa Mazotos' }], error: null }),
    })
    let calls = 0
    const api: Record<string, unknown> = {}
    api.insert = jest.fn(() => api)
    api.select = jest.fn(() => api)
    api.eq = jest.fn(() => api)
    api.maybeSingle = jest.fn(() => {
      calls += 1
      if (calls === 1) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      return Promise.resolve({ data: { id: 'existing-draft', status: 'draft' }, error: null })
    })
    mockFinanceFrom.mockReturnValue(api)

    const r = await createAgentTransactionDraft({
      date: '2026-09-16',
      property_name: 'Villa Mazotos',
      category: 'Management',
      subcategory: 'Other',
      idempotency_key: 'same-key',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.draftId).toBe('existing-draft')
      expect(r.reusedExisting).toBe(true)
    }
    expect(api.insert).toHaveBeenCalledTimes(1)
  })
})
