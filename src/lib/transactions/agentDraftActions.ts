'use server'

/**
 * Phase 0D Draft-only capture. Session JWT + jj_staff_config.
 * Writes via public.create_agent_transaction_draft (finance schema stays hidden).
 * Never inserts into public.transactions. Never uses service-role to write drafts.
 * Browser-supplied roles are ignored. Exact Yossi/Anastasia UUID mapping is BLOCKED.
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  DRAFT_NOT_POSTED_MESSAGE,
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

interface CreateDraftRpcRow {
  readonly id: string
  readonly status: string
  readonly reused_existing: boolean
}

function firstRpcRow(data: CreateDraftRpcRow | CreateDraftRpcRow[] | null): CreateDraftRpcRow | null {
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
