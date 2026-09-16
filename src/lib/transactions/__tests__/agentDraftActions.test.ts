jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockFrom = jest.fn()
const mockRpc = jest.fn()
const mockSession = {
  from: (...args: unknown[]) => mockFrom(...args),
  rpc: (...args: unknown[]) => mockRpc(...args),
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

describe('createAgentTransactionDraft', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFrom.mockReset()
    mockRpc.mockReset()
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
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('authorized staff can create a draft with NULL empty amount', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('properties')
      return { select: () => Promise.resolve({ data: [{ id: 'vm1', name: 'Villa Mazotos' }], error: null }) }
    })
    mockRpc.mockResolvedValue({
      data: [{ id: 'draft-1', status: 'draft', reused_existing: false }],
      error: null,
    })

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
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe('create_agent_transaction_draft')
    const payload = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(payload.p_amount_eur).toBeNull()
    expect(payload.p_property_id).toBe('vm1')
    expect(payload.p_status).toBe('draft')
    expect(payload).not.toHaveProperty('created_by')
    expect(payload).not.toHaveProperty('p_created_by')
    expect(payload).not.toHaveProperty('posted_transaction_id')
    expect(payload).not.toHaveProperty('p_posted_transaction_id')
    expect(mockFrom).not.toHaveBeenCalledWith('transactions')
  })

  it('unresolved property becomes needs_review and keeps property_id null', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({ data: [{ id: 'vm1', name: 'Villa Mazotos' }], error: null }),
    })
    mockRpc.mockResolvedValue({
      data: [{ id: 'draft-2', status: 'needs_review', reused_existing: false }],
      error: null,
    })

    const r = await createAgentTransactionDraft({
      date: '2026-09-16',
      property_name: 'Not A Real Property',
      category: 'Airbnb',
      subcategory: 'Cleaning',
      idempotency_key: 'k3',
    })
    expect(r.ok).toBe(true)
    const payload = mockRpc.mock.calls[0][1] as Record<string, unknown>
    expect(payload.p_property_id).toBeNull()
    expect(payload.p_status).toBe('needs_review')
  })

  it('duplicate idempotency key does not insert a second draft', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockReturnValue({
      select: () => Promise.resolve({ data: [{ id: 'vm1', name: 'Villa Mazotos' }], error: null }),
    })
    mockRpc.mockResolvedValue({
      data: [{ id: 'existing-draft', status: 'draft', reused_existing: true }],
      error: null,
    })

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
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})
