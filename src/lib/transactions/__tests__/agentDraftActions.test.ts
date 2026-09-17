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

import {
  createAgentTransactionDraft,
  listAgentTransactionDrafts,
  approveAndPostAgentTransactionDraft,
  rejectAgentTransactionDraft,
  updateAgentTransactionDraft,
} from '../agentDraftActions'
import { DRAFT_NOT_POSTED_MESSAGE, DRAFT_POSTED_MESSAGE, DRAFT_REJECTED_MESSAGE } from '@/lib/ledger/agentDraft'

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

describe('listAgentTransactionDrafts', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  it('denies partner/owner (not staff)', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    const r = await listAgentTransactionDrafts()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/not authorized/i)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('authorized staff loads drafts through the public list RPC', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockRpc.mockResolvedValue({
      data: [{
        id: '9e449d3b-1ef5-4714-bf64-1a13d8af79b2',
        date: '2026-08-31',
        property_name_input: 'Liron and Alon',
        category: 'Management',
        subcategory: 'Tenant Payment',
        description: 'rent',
        notes: null,
        payer_input: 'Tenant',
        payee_input: 'Yossi',
        amount_eur: '550.00',
        client_charge: null,
        status: 'draft',
        created_at: '2026-09-16T20:53:16.517073+00:00',
        posted_transaction_id: null,
      }],
      error: null,
    })

    const r = await listAgentTransactionDrafts()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.drafts).toHaveLength(1)
      expect(r.drafts[0]).toEqual({
        id: '9e449d3b-1ef5-4714-bf64-1a13d8af79b2',
        date: '2026-08-31',
        property: 'Liron and Alon',
        category: 'Management',
        subcategory: 'Tenant Payment',
        description: 'rent',
        payer: 'Tenant',
        payee: 'Yossi',
        amount_eur: '550.00',
        client_charge: null,
        notes: null,
        status: 'draft',
        created_at: '2026-09-16T20:53:16.517073+00:00',
        posted_transaction_id: null,
      })
    }
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe('list_agent_transaction_drafts')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('approveAndPostAgentTransactionDraft', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  it('posts only through the public approve RPC and never inserts into transactions', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockRpc.mockResolvedValue({
      data: [{
        id: 'draft-1',
        status: 'posted',
        posted_transaction_id: 'tx-1',
        reused_existing: false,
      }],
      error: null,
    })
    const r = await approveAndPostAgentTransactionDraft('draft-1')
    expect(r).toEqual({
      ok: true,
      draftId: 'draft-1',
      status: 'posted',
      postedTransactionId: 'tx-1',
      reusedExisting: false,
      message: DRAFT_POSTED_MESSAGE,
    })
    expect(mockRpc).toHaveBeenCalledWith('approve_and_post_agent_transaction_draft', { p_id: 'draft-1' })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalledWith('transactions')
  })

  it('replay returns the same posted transaction id', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockRpc.mockResolvedValue({
      data: [{
        id: 'draft-1',
        status: 'posted',
        posted_transaction_id: 'tx-1',
        reused_existing: true,
      }],
      error: null,
    })
    const r = await approveAndPostAgentTransactionDraft('draft-1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.postedTransactionId).toBe('tx-1')
      expect(r.reusedExisting).toBe(true)
    }
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})

describe('rejectAgentTransactionDraft', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  it('rejects through the public reject RPC and never deletes the draft', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockRpc.mockResolvedValue({ data: [{ id: 'draft-1', status: 'rejected' }], error: null })
    const r = await rejectAgentTransactionDraft('draft-1')
    expect(r).toEqual({
      ok: true,
      draftId: 'draft-1',
      status: 'rejected',
      message: DRAFT_REJECTED_MESSAGE,
    })
    expect(mockRpc).toHaveBeenCalledWith('reject_agent_transaction_draft', { p_id: 'draft-1' })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('updateAgentTransactionDraft', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockFrom.mockReset()
    mockRpc.mockReset()
  })

  it('updates draft fields only through the public update RPC', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('properties')
      return { select: () => Promise.resolve({ data: [{ id: 'p1', name: 'Liron and Alon' }], error: null }) }
    })
    mockRpc.mockResolvedValue({ data: [{ id: 'draft-1', status: 'draft' }], error: null })
    const r = await updateAgentTransactionDraft({
      id: 'draft-1',
      date: '2026-08-31',
      property_name: 'Liron and Alon',
      category: 'Management',
      subcategory: 'Tenant Payment',
      description: 'rent',
      notes: '',
      payer: 'Tenant',
      payee: 'Yossi',
      amount_eur: '550',
      client_charge: '',
      idempotency_key: 'draft-1',
    })
    expect(r).toEqual({
      ok: true,
      draftId: 'draft-1',
      status: 'draft',
      message: DRAFT_NOT_POSTED_MESSAGE,
    })
    expect(mockRpc.mock.calls[0][0]).toBe('update_agent_transaction_draft')
    expect(mockRpc.mock.calls[0][1]).toMatchObject({
      p_id: 'draft-1',
      p_status: 'draft',
      p_amount_eur: 550,
      p_client_charge: null,
    })
    expect(mockFrom).not.toHaveBeenCalledWith('transactions')
  })
})

