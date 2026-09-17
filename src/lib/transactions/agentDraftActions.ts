'use server'

/**
 * Session JWT + jj_staff_config. finance schema stays hidden.
 * Draft create/edit/reject never write the ledger table from the app.
 * Posting is only via public.approve_and_post_agent_transaction_draft (p_id).
 * Never uses service-role on the write path. Browser-supplied roles are ignored.
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  DRAFT_NOT_POSTED_MESSAGE,
  DRAFT_POSTED_MESSAGE,
  DRAFT_REJECTED_MESSAGE,
  parseOptionalEur,
  resolveDraftStatus,
  resolveExactPropertyId,
} from '@/lib/ledger/agentDraft'

export interface CreateAgentDraftInput {
  readonly date: string
  readonly property_name: string
  readonly category: string
  readonly subcategory: string
  readonly description?: string
  readonly notes?: string
  readonly payer?: string
  readonly payee?: string
  readonly amount_eur?: string
  readonly client_charge?: string
  readonly idempotency_key: string
  /** Ignored if present — never trusted. */
  readonly role?: string
  readonly staffRole?: string
}

export type CreateAgentDraftResult =
  | { readonly ok: true; readonly draftId: string; readonly status: string; readonly message: string; readonly reusedExisting: boolean }
  | { readonly ok: false; readonly error: string }

export interface AgentDraftInboxRow {
  readonly id: string
  readonly date: string
  readonly property: string
  readonly category: string
  readonly subcategory: string
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: string | null
  readonly client_charge: string | null
  readonly notes: string | null
  readonly status: string
  readonly created_at: string
  readonly posted_transaction_id: string | null
}

export type ListAgentDraftsResult =
  | { readonly ok: true; readonly drafts: readonly AgentDraftInboxRow[] }
  | { readonly ok: false; readonly error: string }

interface CreateDraftRpcRow {
  readonly id: string
  readonly status: string
  readonly reused_existing: boolean
}

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (data == null) return null
  return Array.isArray(data) ? (data[0] ?? null) : data
}

export async function createAgentTransactionDraft(
  input: CreateAgentDraftInput,
): Promise<CreateAgentDraftResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
  }

  if (!input.date || !input.category || !input.subcategory) {
    return { ok: false, error: 'Date, category, and subcategory are required.' }
  }
  const idempotencyKey = (input.idempotency_key ?? '').trim()
  if (!idempotencyKey) {
    return { ok: false, error: 'Missing idempotency key.' }
  }

  const session = createSupabaseServerClient()
  const { data: catalog, error: catalogError } = await session
    .from('properties')
    .select('id, name')

  if (catalogError || catalog == null) {
    return { ok: false, error: 'Could not resolve property catalog.' }
  }

  const propertyNameInput = (input.property_name ?? '').trim()
  const propertyId = resolveExactPropertyId(propertyNameInput, catalog as { id: string; name: string }[])
  const status = resolveDraftStatus({ propertyId, propertyNameInput })
  const amountEur = parseOptionalEur(input.amount_eur)
  const clientCharge = parseOptionalEur(input.client_charge)

  const { data, error } = await session.rpc('create_agent_transaction_draft', {
    p_date: input.date,
    p_property_id: propertyId,
    p_property_name_input: propertyNameInput,
    p_category: input.category,
    p_subcategory: input.subcategory,
    p_payer_input: input.payer?.trim() ? input.payer.trim() : null,
    p_payee_input: input.payee?.trim() ? input.payee.trim() : null,
    p_amount_eur: amountEur,
    p_client_charge: clientCharge,
    p_description: input.description?.trim() ? input.description.trim() : null,
    p_notes: input.notes?.trim() ? input.notes.trim() : null,
    p_status: status,
    p_idempotency_key: idempotencyKey,
    p_source_type: 'manual_form',
    p_schema_version: 1,
  })

  const row = firstRpcRow(data as CreateDraftRpcRow | CreateDraftRpcRow[] | null)
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Draft was not saved.' }
  }

  return {
    ok: true,
    draftId: String(row.id),
    status: String(row.status),
    message: DRAFT_NOT_POSTED_MESSAGE,
    reusedExisting: Boolean(row.reused_existing),
  }
}

interface ListDraftRpcRow {
  readonly id?: string | null
  readonly date?: string | null
  readonly property_id?: string | null
  readonly property_name_input?: string | null
  readonly category?: string | null
  readonly subcategory?: string | null
  readonly description?: string | null
  readonly notes?: string | null
  readonly payer_input?: string | null
  readonly payee_input?: string | null
  readonly amount_eur?: string | number | null
  readonly client_charge?: string | number | null
  readonly status?: string | null
  readonly created_at?: string | null
  readonly posted_transaction_id?: string | null
}

function asOptionalText(value: string | number | null | undefined): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function mapListRow(row: ListDraftRpcRow): AgentDraftInboxRow {
  return {
    id: String(row.id ?? ''),
    date: String(row.date ?? ''),
    property: String(row.property_name_input ?? ''),
    category: String(row.category ?? ''),
    subcategory: String(row.subcategory ?? ''),
    description: asOptionalText(row.description),
    payer: asOptionalText(row.payer_input),
    payee: asOptionalText(row.payee_input),
    amount_eur: asOptionalText(row.amount_eur),
    client_charge: asOptionalText(row.client_charge),
    notes: asOptionalText(row.notes),
    status: String(row.status ?? ''),
    created_at: String(row.created_at ?? ''),
    posted_transaction_id: asOptionalText(row.posted_transaction_id),
  }
}

export async function listAgentTransactionDrafts(): Promise<ListAgentDraftsResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
  }

  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('list_agent_transaction_drafts')
  if (error) {
    return { ok: false, error: error.message ?? 'Drafts could not be loaded.' }
  }

  const rows = Array.isArray(data) ? data : data == null ? [] : [data]
  return {
    ok: true,
    drafts: (rows as ListDraftRpcRow[]).map(mapListRow),
  }
}

export type GetAgentDraftResult =
  | { readonly ok: true; readonly draft: AgentDraftInboxRow }
  | { readonly ok: false; readonly error: string }

export async function getAgentTransactionDraft(draftId: string): Promise<GetAgentDraftResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
  }
  const id = draftId.trim()
  if (!id) return { ok: false, error: 'Missing draft id.' }

  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('get_agent_transaction_draft', { p_id: id })
  const row = firstRpcRow(data as ListDraftRpcRow | ListDraftRpcRow[] | null)
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Draft was not found.' }
  }
  return { ok: true, draft: mapListRow(row) }
}

export type MutateAgentDraftResult =
  | { readonly ok: true; readonly draftId: string; readonly status: string; readonly message: string }
  | { readonly ok: false; readonly error: string }

export async function updateAgentTransactionDraft(
  input: CreateAgentDraftInput & { readonly id: string },
): Promise<MutateAgentDraftResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
  }
  if (!input.id || !input.date || !input.category || !input.subcategory) {
    return { ok: false, error: 'Id, date, category, and subcategory are required.' }
  }

  const session = createSupabaseServerClient()
  const { data: catalog, error: catalogError } = await session
    .from('properties')
    .select('id, name')
  if (catalogError || catalog == null) {
    return { ok: false, error: 'Could not resolve property catalog.' }
  }

  const propertyNameInput = (input.property_name ?? '').trim()
  const propertyId = resolveExactPropertyId(propertyNameInput, catalog as { id: string; name: string }[])
  const status = resolveDraftStatus({ propertyId, propertyNameInput })

  const { data, error } = await session.rpc('update_agent_transaction_draft', {
    p_id: input.id,
    p_date: input.date,
    p_property_id: propertyId,
    p_property_name_input: propertyNameInput,
    p_category: input.category,
    p_subcategory: input.subcategory,
    p_payer_input: input.payer?.trim() ? input.payer.trim() : null,
    p_payee_input: input.payee?.trim() ? input.payee.trim() : null,
    p_amount_eur: parseOptionalEur(input.amount_eur),
    p_client_charge: parseOptionalEur(input.client_charge),
    p_description: input.description?.trim() ? input.description.trim() : null,
    p_notes: input.notes?.trim() ? input.notes.trim() : null,
    p_status: status,
  })
  const row = firstRpcRow(data as CreateDraftRpcRow | CreateDraftRpcRow[] | null)
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Draft was not updated.' }
  }
  return {
    ok: true,
    draftId: String(row.id),
    status: String(row.status),
    message: DRAFT_NOT_POSTED_MESSAGE,
  }
}

export async function rejectAgentTransactionDraft(draftId: string): Promise<MutateAgentDraftResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
  }
  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('reject_agent_transaction_draft', { p_id: draftId })
  const row = firstRpcRow(data as CreateDraftRpcRow | CreateDraftRpcRow[] | null)
  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Draft was not rejected.' }
  }
  return {
    ok: true,
    draftId: String(row.id),
    status: String(row.status),
    message: DRAFT_REJECTED_MESSAGE,
  }
}

export type ApproveAgentDraftResult =
  | {
      readonly ok: true
      readonly draftId: string
      readonly status: string
      readonly postedTransactionId: string
      readonly reusedExisting: boolean
      readonly message: string
    }
  | { readonly ok: false; readonly error: string }

interface ApproveRpcRow {
  readonly id: string
  readonly status: string
  readonly posted_transaction_id: string
  readonly reused_existing: boolean
}

export async function approveAndPostAgentTransactionDraft(
  draftId: string,
): Promise<ApproveAgentDraftResult> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { ok: false, error: auth.error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
  }
  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('approve_and_post_agent_transaction_draft', { p_id: draftId })
  const row = firstRpcRow(data as ApproveRpcRow | ApproveRpcRow[] | null)
  if (error || !row?.posted_transaction_id) {
    return { ok: false, error: error?.message ?? 'Draft was not posted.' }
  }
  return {
    ok: true,
    draftId: String(row.id),
    status: String(row.status),
    postedTransactionId: String(row.posted_transaction_id),
    reusedExisting: Boolean(row.reused_existing),
    message: DRAFT_POSTED_MESSAGE,
  }
}
