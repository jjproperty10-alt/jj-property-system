'use server'

/**
 * Phase 0D Draft-only capture. Session JWT + jj_staff_config.
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

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  return /duplicate key|unique constraint/i.test(err.message ?? '')
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

  const row = {
    created_by: auth.userId,
    status,
    date: input.date,
    property_id: propertyId,
    property_name_input: propertyNameInput,
    category: input.category,
    subcategory: input.subcategory,
    payer_input: input.payer?.trim() ? input.payer.trim() : null,
    payee_input: input.payee?.trim() ? input.payee.trim() : null,
    amount_eur: amountEur,
    client_charge: clientCharge,
    description: input.description?.trim() ? input.description.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    source_type: 'manual_form',
    schema_version: 1,
    idempotency_key: idempotencyKey,
    posted_transaction_id: null,
    approved_by: null,
    approved_at: null,
  }

  const { data: inserted, error: insertError } = await session
    .schema('finance')
    .from('agent_transaction_drafts')
    .insert([row])
    .select('id, status')
    .maybeSingle()

  if (insertError && isUniqueViolation(insertError)) {
    const { data: existing, error: existingError } = await session
      .schema('finance')
      .from('agent_transaction_drafts')
      .select('id, status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingError || !existing) {
      return { ok: false, error: 'Draft already exists for this key.' }
    }
    return {
      ok: true,
      draftId: String((existing as { id: string }).id),
      status: String((existing as { status: string }).status),
      message: DRAFT_NOT_POSTED_MESSAGE,
      reusedExisting: true,
    }
  }

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Draft was not saved.' }
  }

  return {
    ok: true,
    draftId: String((inserted as { id: string }).id),
    status: String((inserted as { status: string }).status),
    message: DRAFT_NOT_POSTED_MESSAGE,
    reusedExisting: false,
  }
}
