jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockSession = {
  from: (...args: unknown[]) => mockFrom(...args),
  rpc: (...args: unknown[]) => mockRpc(...args),
}

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => mockSession,
}))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => {
    throw new Error('service-role must not write ops assistant')
  },
}))

const createDraftMock = jest.fn()
jest.mock('@/lib/transactions/agentDraftActions', () => ({
  createAgentTransactionDraft: (...args: unknown[]) => createDraftMock(...args),
}))

import {
  appendOpsInboundMessage,
  createAssistantTransactionDraft,
  createWebOpsConversation,
  listOpsConversation,
  submitAssistantInbound,
} from '@/lib/ops/assistant/opsConversationActions'
import fs from 'fs'
import path from 'path'

function staffAuth() {
  return { ok: true as const, userId: 'staff-user-1', staffRole: 'operations', isActive: true }
}

describe('ops conversation wrappers', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRpc.mockReset()
    mockFrom.mockReset()
    createDraftMock.mockReset()
  })

  it('uses session JWT RPCs with idempotency keys and no service client', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockRpc.mockResolvedValue({
      data: [{ id: 'conv-1', status: 'open', reused_existing: false }],
      error: null,
    })
    const created = await createWebOpsConversation('conv-key')
    expect(created.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('create_ops_conversation', expect.objectContaining({
      p_channel: 'web',
      p_idempotency_key: 'conv-key',
      p_external_thread_id: null,
      p_suggested_property_name: null,
    }))
    expect(mockFrom).not.toHaveBeenCalled()
    mockRpc.mockResolvedValue({ data: [{ id: 'msg-1', reused_existing: false }], error: null })
    const appended = await appendOpsInboundMessage({
      conversationId: 'conv-1',
      body: 'שילמתי 120 אירו',
      idempotencyKey: 'msg-key',
    })
    expect(appended.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('append_ops_inbound_message', expect.objectContaining({
      p_idempotency_key: 'msg-key',
      p_conversation_id: 'conv-1',
    }))
  })

  it('does not persist empty/partial speech and never touches public.transactions', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    const empty = await submitAssistantInbound({
      conversationId: null,
      conversationIdempotencyKey: 'c',
      body: '   ',
      messageIdempotencyKey: 'm',
    })
    expect(empty.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'lib', 'ops', 'assistant', 'opsConversationActions.ts'),
      'utf8',
    )
    expect(src).toContain('createSupabaseServerClient')
    expect(src).not.toContain('createServiceClient')
    expect(src).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(src).toContain('createAgentTransactionDraft')
    expect(src).not.toContain(['approveAndPost', 'AgentTransactionDraft'].join(''))
  })

  function catalog(rows: { id: string; name: string }[]) {
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'properties') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }
    })
  }

  it('stores a suggestion only when the staff catalog has one exact name', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    mockRpc.mockResolvedValue({
      data: [{ id: 'conv-1', status: 'open', reused_existing: false }],
      error: null,
    })
    catalog([
      { id: '1', name: 'Mobile Test House' },
      { id: '2', name: 'Tamir Kiti' },
      { id: '3', name: 'Tamir Dekelia' },
    ])
    await createWebOpsConversation('unique-key', 'Mobile Test House')
    expect(mockRpc).toHaveBeenLastCalledWith('create_ops_conversation', expect.objectContaining({
      p_suggested_property_name: 'Mobile Test House',
    }))
    await createWebOpsConversation('partial-key', 'Tamir')
    expect(mockRpc).toHaveBeenLastCalledWith('create_ops_conversation', expect.objectContaining({
      p_suggested_property_name: null,
    }))
    await createWebOpsConversation('unknown-key', 'Not A Real House')
    expect(mockRpc).toHaveBeenLastCalledWith('create_ops_conversation', expect.objectContaining({
      p_suggested_property_name: null,
    }))
  })

  it('blocks conversation restore when company isolation is unproven', async () => {
    mockAuth.mockResolvedValue(staffAuth())
    const listed = await listOpsConversation('conv-1')
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.error).toContain('הבידוד לפי חברה אינו מוכח')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('refuses conversation restore for an unauthorized user', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    const listed = await listOpsConversation('conv-1')
    expect(listed.ok).toBe(false)
    if (listed.ok) return
    expect(listed.error).toBe('Not authorized')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('create draft delegates to createAgentTransactionDraft and is idempotent per key', async () => {
    createDraftMock
      .mockResolvedValueOnce({ ok: true, draftId: 'd1', status: 'draft', message: 'x', reusedExisting: false })
      .mockResolvedValueOnce({ ok: true, draftId: 'd1', status: 'draft', message: 'x', reusedExisting: true })
    const input = {
      date: '2026-09-17',
      property_name: 'Tamir Kiti',
      category: 'Management',
      subcategory: 'Electricity',
      idempotency_key: 'same-key',
    }
    const a = await createAssistantTransactionDraft(input)
    const b = await createAssistantTransactionDraft(input)
    expect(a.ok && a.draftId).toBe('d1')
    expect(b.ok && b.reusedExisting).toBe(true)
    expect(createDraftMock).toHaveBeenCalledTimes(2)
    expect(createDraftMock.mock.calls[0][0].idempotency_key).toBe('same-key')
    expect(createDraftMock.mock.calls[1][0].idempotency_key).toBe('same-key')
  })
})
