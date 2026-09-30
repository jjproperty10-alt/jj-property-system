/**
 * Restore gate for ?c= conversations.
 * ops_conversations has created_by but no operating company.
 * The finance schema freeze forbids adding that column here.
 */

export const CONVERSATION_COMPANY_DEPENDENCY =
  'שחזור השיחה חסום. לשיחה אין חברה, ולכן הבידוד לפי חברה אינו מוכח. אימות המשתמש נשאר. הוספת חברה לשיחה דורשת שינוי סכמה, והסכמה קפואה.'

export const CONVERSATION_OTHER_COMPANY =
  'השיחה שייכת לחברה אחרת.'

export const CONVERSATION_UNAUTHORIZED = 'Not authorized'

export interface ConversationRestoreInput {
  readonly actorUserId: string | null
  readonly actorIsActiveStaff: boolean
  readonly actorCompanyId: string | null
  readonly conversationOwnerId: string | null
  readonly conversationCompanyId: string | null
}

export type ConversationRestoreDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string }

export function assessConversationRestore(input: ConversationRestoreInput): ConversationRestoreDecision {
  if (!input.actorIsActiveStaff || !input.actorUserId) {
    return { ok: false, error: CONVERSATION_UNAUTHORIZED }
  }
  if (input.conversationOwnerId && input.conversationOwnerId !== input.actorUserId) {
    return { ok: false, error: CONVERSATION_UNAUTHORIZED }
  }
  if (!input.conversationCompanyId) {
    return { ok: false, error: CONVERSATION_COMPANY_DEPENDENCY }
  }
  if (!input.actorCompanyId || input.actorCompanyId !== input.conversationCompanyId) {
    return { ok: false, error: CONVERSATION_OTHER_COMPANY }
  }
  return { ok: true }
}
