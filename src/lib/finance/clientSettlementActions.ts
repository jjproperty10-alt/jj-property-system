'use server'

/**
 * Session-JWT actions for the client settlement overlay.
 * Browser → authenticateStatementUser → createSupabaseServerClient → public RPC.
 * Never uses the service-role client (auth.uid() would be null).
 * Does not write public.transactions. No Owner Workspace integration.
 */

import 'server-only'

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { isValidUUID } from '@/lib/owners/validation'
import {
  assertClientSettlementRpcAuthorized,
  UnauthorizedClientSettlementError,
} from './clientSettlementRpcAuth'
import {
  CLIENT_SETTLEMENT_EVENT_TYPES,
  CLIENT_SETTLEMENT_RPC,
  type ClientSettlementRpcResult,
  type OpenClientSettlementInput,
} from './clientSettlementTypes'

function sessionDb() {
  return createSupabaseServerClient()
}

function staffOrError(
  auth: Awaited<ReturnType<typeof authenticateStatementUser>>,
): { ok: true; userId: string; staffRole: string } | { ok: false; error: string } {
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  try {
    assertClientSettlementRpcAuthorized({
      jwtRole: 'authenticated',
      staffRole: auth.staffRole,
    })
  } catch (err) {
    if (err instanceof UnauthorizedClientSettlementError) return { ok: false, error: err.message }
    throw err
  }
  return { ok: true, userId: auth.userId, staffRole: auth.staffRole }
}

function asResult(data: unknown): ClientSettlementRpcResult {
  const row = data as ClientSettlementRpcResult
  return {
    id: String(row.id),
    status: row.status,
    replay: Boolean(row.replay),
    inserted_count: Number(row.inserted_count ?? 0),
    inserted: row.inserted,
    actor: row.actor,
  }
}

export async function openClientSettlementEventAction(
  input: OpenClientSettlementInput,
): Promise<{ ok: true; result: ClientSettlementRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(input.entityId)) return { ok: false, error: 'Invalid entity_id' }
  if (input.counterpartyEntityId != null && !isValidUUID(input.counterpartyEntityId)) {
    return { ok: false, error: 'Invalid counterparty_entity_id' }
  }
  if (input.sourceTransactionId != null && !isValidUUID(input.sourceTransactionId)) {
    return { ok: false, error: 'Invalid source_transaction_id' }
  }
  if (!(CLIENT_SETTLEMENT_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    return { ok: false, error: 'Invalid event_type' }
  }
  if (!(input.settlementAmount > 0) || !input.effectiveDate || !input.reason.trim() || !input.evidenceRef.trim() || !input.idempotencyKey.trim()) {
    return { ok: false, error: 'Missing required settlement fields' }
  }

  const { data, error } = await sessionDb().rpc(CLIENT_SETTLEMENT_RPC.open, {
    p_entity_id: input.entityId,
    p_counterparty_entity_id: input.counterpartyEntityId,
    p_effective_date: input.effectiveDate,
    p_event_type: input.eventType,
    p_settlement_amount: input.settlementAmount,
    p_source_transaction_id: input.sourceTransactionId,
    p_reason: input.reason.trim(),
    p_evidence_ref: input.evidenceRef.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}

export async function approveClientSettlementEventAction(
  id: string,
  reason: string,
): Promise<{ ok: true; result: ClientSettlementRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(id) || !reason.trim()) return { ok: false, error: 'Invalid id or reason' }
  const { data, error } = await sessionDb().rpc(CLIENT_SETTLEMENT_RPC.approve, {
    p_id: id,
    p_reason: reason.trim(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}

export async function applyClientSettlementEventAction(
  id: string,
): Promise<{ ok: true; result: ClientSettlementRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(id)) return { ok: false, error: 'Invalid id' }
  const { data, error } = await sessionDb().rpc(CLIENT_SETTLEMENT_RPC.apply, { p_id: id })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}

export async function voidClientSettlementEventAction(
  id: string,
  reason: string,
): Promise<{ ok: true; result: ClientSettlementRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(id) || !reason.trim()) return { ok: false, error: 'Invalid id or reason' }
  const { data, error } = await sessionDb().rpc(CLIENT_SETTLEMENT_RPC.void, {
    p_id: id,
    p_reason: reason.trim(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}
