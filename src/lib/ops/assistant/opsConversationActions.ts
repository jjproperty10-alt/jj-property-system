'use server'

/**
 * Session-JWT Operations conversation wrappers.
 * Never uses service-role. Never writes public.transactions.
 * Persists only text explicitly submitted with Send.
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { OPS_MESSAGE_BODY_MAX } from '@/lib/ops/types'
import { exactUniqueCatalogName, type ApprovedPropertyAlias } from '@/lib/ops/assistant/transactionDraftCollector'
import { assessConversationRestore } from '@/lib/ops/assistant/conversationRestore'
import { createAgentTransactionDraft } from '@/lib/transactions/agentDraftActions'
import type { CreateAgentDraftInput, CreateAgentDraftResult } from '@/lib/transactions/agentDraftActions'

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (data == null) return null
  return Array.isArray(data) ? (data[0] ?? null) : data
}

export type OpsActionFailure = { readonly ok: false; readonly error: string }

export type CreateOpsConversationResult =
  | { readonly ok: true; readonly conversationId: string; readonly status: string; readonly reusedExisting: boolean }
  | OpsActionFailure

export type AppendOpsMessageResult =
  | { readonly ok: true; readonly messageId: string; readonly reusedExisting: boolean }
  | OpsActionFailure

export interface OpsListedMessage {
  readonly id: string
  readonly direction: string
  readonly body: string
  readonly created_at: string
}

export type ListOpsConversationResult =
  | {
      readonly ok: true
      readonly conversationId: string
      readonly status: string
      readonly suggestedPropertyName: string | null
      readonly messages: readonly OpsListedMessage[]
    }
  | OpsActionFailure

export type PropertyCatalogResult =
  | { readonly ok: true; readonly properties: readonly { id: string; name: string }[] }
  | OpsActionFailure

function authError(error: 'NO_SESSION' | 'NOT_STAFF' | 'STAFF_INACTIVE' | 'AUTH_ERROR' | string): OpsActionFailure {
  return { ok: false, error: error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
}

export async function createWebOpsConversation(
  idempotencyKey: string,
  suggestedPropertyName?: string | null,
): Promise<CreateOpsConversationResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const key = idempotencyKey.trim()
  if (!key) return { ok: false, error: 'Missing idempotency key.' }

  const session = createSupabaseServerClient()
  let canonicalName: string | null = null
  const rawSuggestion = suggestedPropertyName?.trim() ?? ''
  if (rawSuggestion) {
    const catalog = await listAssistantProperties()
    canonicalName = catalog.ok ? exactUniqueCatalogName(rawSuggestion, catalog.properties) : null
  }
  const { data, error } = await session.rpc('create_ops_conversation', {
    p_channel: 'web',
    p_idempotency_key: key,
    p_external_thread_id: null,
    p_suggested_property_name: canonicalName,
  })
  const row = firstRpcRow(data as { id: string; status: string; reused_existing: boolean }[] | { id: string; status: string; reused_existing: boolean } | null)
  if (error || !row) return { ok: false, error: error?.message ?? 'Conversation was not created.' }
  return {
    ok: true,
    conversationId: String(row.id),
    status: String(row.status),
    reusedExisting: Boolean(row.reused_existing),
  }
}

export async function appendOpsInboundMessage(input: {
  readonly conversationId: string
  readonly body: string
  readonly idempotencyKey: string
}): Promise<AppendOpsMessageResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const body = input.body.trim()
  if (body.length < 1 || body.length > OPS_MESSAGE_BODY_MAX) {
    return { ok: false, error: 'Message must be between 1 and 2000 characters.' }
  }
  const key = input.idempotencyKey.trim()
  if (!key) return { ok: false, error: 'Missing idempotency key.' }

  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('append_ops_inbound_message', {
    p_conversation_id: input.conversationId,
    p_body: body,
    p_idempotency_key: key,
    p_external_message_id: null,
  })
  const row = firstRpcRow(data as { id: string; reused_existing: boolean }[] | { id: string; reused_existing: boolean } | null)
  if (error || !row) return { ok: false, error: error?.message ?? 'Message was not saved.' }
  return { ok: true, messageId: String(row.id), reusedExisting: Boolean(row.reused_existing) }
}

export async function listOpsConversation(
  conversationId: string,
): Promise<ListOpsConversationResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const id = conversationId.trim()
  if (!id) return { ok: false, error: 'Missing conversation id.' }

  const restore = assessConversationRestore({
    actorUserId: auth.userId,
    actorIsActiveStaff: auth.isActive,
    actorCompanyId: null,
    conversationOwnerId: auth.userId,
    conversationCompanyId: null,
  })
  if (!restore.ok) return { ok: false, error: restore.error }

  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('list_ops_conversation', {
    p_conversation_id: id,
  })
  const row = firstRpcRow(data as Record<string, unknown>[] | Record<string, unknown> | null)
  if (error || !row) return { ok: false, error: error?.message ?? 'Conversation was not found.' }
  const messagesRaw = Array.isArray(row.messages) ? row.messages : []
  const messages: OpsListedMessage[] = messagesRaw.map((m: Record<string, unknown>) => ({
    id: String(m.id ?? ''),
    direction: String(m.direction ?? ''),
    body: String(m.body ?? ''),
    created_at: String(m.created_at ?? ''),
  }))
  const storedName = typeof row.suggested_property_name === 'string' ? row.suggested_property_name : null
  return {
    ok: true,
    conversationId: String(row.conversation_id ?? id),
    status: String(row.status ?? ''),
    suggestedPropertyName: storedName && storedName.trim() ? storedName.trim() : null,
    messages,
  }
}

export async function listAssistantPropertyAliases(): Promise<
  | { readonly ok: true; readonly aliases: readonly ApprovedPropertyAlias[] }
  | OpsActionFailure
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const session = createSupabaseServerClient()
  const { data, error } = await session.from('property_name_aliases').select('raw_name, canonical_name')
  if (error || data == null) return { ok: true, aliases: [] }
  return {
    ok: true,
    aliases: (data as { raw_name: string | null; canonical_name: string | null }[])
      .filter((row) => row.raw_name && row.canonical_name)
      .map((row) => ({ rawName: String(row.raw_name), canonicalName: String(row.canonical_name) })),
  }
}

export async function listAssistantProperties(): Promise<PropertyCatalogResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const session = createSupabaseServerClient()
  const { data, error } = await session.from('properties').select('id, name').order('name')
  if (error || data == null) return { ok: false, error: 'Could not resolve property catalog.' }
  return {
    ok: true,
    properties: (data as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })),
  }
}

export async function createAssistantTransactionDraft(
  input: CreateAgentDraftInput,
): Promise<CreateAgentDraftResult> {
  return createAgentTransactionDraft(input)
}

export async function submitAssistantInbound(input: {
  readonly conversationId: string | null
  readonly conversationIdempotencyKey: string
  readonly body: string
  readonly messageIdempotencyKey: string
  readonly suggestedPropertyName?: string | null
}): Promise<
  | { readonly ok: true; readonly conversationId: string; readonly messageId: string }
  | OpsActionFailure
> {
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Empty message was not sent.' }

  let conversationId = input.conversationId
  if (!conversationId) {
    const created = await createWebOpsConversation(
      input.conversationIdempotencyKey,
      input.suggestedPropertyName,
    )
    if (!created.ok) return created
    conversationId = created.conversationId
  }
  const appended = await appendOpsInboundMessage({
    conversationId,
    body,
    idempotencyKey: input.messageIdempotencyKey,
  })
  if (!appended.ok) return appended
  return { ok: true, conversationId, messageId: appended.messageId }
}
