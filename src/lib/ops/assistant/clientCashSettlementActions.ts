'use server'

/**
 * Session-JWT client cash settlement. Execute is invoked only from the
 * explicit confirmation button. Send / microphone must never call execute.
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type Failure = { readonly ok: false; readonly error: string }

function authError(error: string): Failure {
  return { ok: false, error: error === 'NO_SESSION' ? 'You must be signed in' : 'Not authorized' }
}

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (data == null) return null
  return Array.isArray(data) ? (data[0] ?? null) : data
}

export async function listClientSettlementEntities(): Promise<
  { readonly ok: true; readonly entities: readonly { id: string; canonicalName: string }[] } | Failure
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('list_client_settlement_entities')
  if (error || data == null) return { ok: false, error: error?.message ?? 'Could not list clients.' }
  const rows = Array.isArray(data) ? data : [data]
  return {
    ok: true,
    entities: rows.map((r: { id: string; canonical_name: string }) => ({
      id: String(r.id),
      canonicalName: String(r.canonical_name),
    })),
  }
}

export async function previewClientCashSettlement(input: {
  readonly entityId: string
  readonly direction: 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'
  readonly amount: number
  readonly effectiveDate: string
}): Promise<{ readonly ok: true; readonly preview: Record<string, unknown> } | Failure> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('preview_client_cash_settlement', {
    p_entity_id: input.entityId,
    p_direction: input.direction,
    p_amount: input.amount,
    p_effective_date: input.effectiveDate,
  })
  const row = firstRpcRow(data as Record<string, unknown> | Record<string, unknown>[] | null)
  if (error || !row) return { ok: false, error: error?.message ?? 'Preview failed.' }
  return { ok: true, preview: row }
}

export async function readClientSettlementBalance(input: {
  readonly entityId: string
  readonly asOf: string
}): Promise<{ readonly ok: true; readonly payload: Record<string, unknown> } | Failure> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('read_client_settlement_balance', {
    p_entity_id: input.entityId,
    p_as_of: input.asOf,
  })
  const row = firstRpcRow(data as Record<string, unknown> | Record<string, unknown>[] | null)
  if (error || !row) return { ok: false, error: error?.message ?? 'Balance read failed.' }
  return { ok: true, payload: row }
}

export async function executeClientCashSettlement(input: {
  readonly entityId: string
  readonly direction: 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'
  readonly amount: number
  readonly effectiveDate: string
  readonly previewHash: string
  readonly canonicalSnapshot: Record<string, unknown>
  readonly idempotencyKey: string
}): Promise<
  | {
      readonly ok: true
      readonly transactionId: string
      readonly replay: boolean
      readonly reader: Record<string, unknown> | null
      readonly reportUpdated: boolean
    }
  | Failure
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return authError(auth.error)
  const session = createSupabaseServerClient()
  const { data, error } = await session.rpc('execute_client_cash_settlement', {
    p_entity_id: input.entityId,
    p_direction: input.direction,
    p_amount: input.amount,
    p_effective_date: input.effectiveDate,
    p_preview_hash: input.previewHash,
    p_canonical_snapshot: input.canonicalSnapshot,
    p_idempotency_key: input.idempotencyKey,
  })
  const row = firstRpcRow(data as Record<string, unknown> | Record<string, unknown>[] | null)
  if (error || !row) return { ok: false, error: error?.message ?? 'Execute failed.' }
  const transactionId = String(row.transaction_id ?? '')
  const { data: readerData, error: readerError } = await session.rpc(
    'read_client_settlement_balance',
    {
      p_entity_id: input.entityId,
      p_as_of: input.effectiveDate,
    },
  )
  const reader = firstRpcRow(
    readerData as Record<string, unknown> | Record<string, unknown>[] | null,
  )
  const reportUpdated =
    !readerError &&
    reader != null &&
    reader.unavailable === false &&
    reader.remaining_r != null
  return {
    ok: true,
    transactionId,
    replay: Boolean(row.replay),
    reader: reportUpdated ? reader : null,
    reportUpdated,
  }
}
