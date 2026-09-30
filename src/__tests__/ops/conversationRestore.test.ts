import {
  assessConversationRestore,
  CONVERSATION_COMPANY_DEPENDENCY,
  CONVERSATION_OTHER_COMPANY,
  CONVERSATION_UNAUTHORIZED,
} from '@/lib/ops/assistant/conversationRestore'

describe('conversation restore isolation', () => {
  const actor = {
    actorUserId: 'user-1',
    actorIsActiveStaff: true,
    actorCompanyId: 'company-a',
    conversationOwnerId: 'user-1',
    conversationCompanyId: 'company-a',
  }

  it('refuses an unauthorized user', () => {
    const decision = assessConversationRestore({ ...actor, actorIsActiveStaff: false })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.error).toBe(CONVERSATION_UNAUTHORIZED)
  })

  it('blocks a conversation that belongs to another company', () => {
    const decision = assessConversationRestore({ ...actor, conversationCompanyId: 'company-b' })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.error).toBe(CONVERSATION_OTHER_COMPANY)
  })

  it('blocks restore when the conversation has no company', () => {
    const decision = assessConversationRestore({ ...actor, conversationCompanyId: null, actorCompanyId: null })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.error).toBe(CONVERSATION_COMPANY_DEPENDENCY)
    expect(decision.error).toContain('הסכמה קפואה')
  })
})
