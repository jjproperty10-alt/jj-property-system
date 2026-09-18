'use server'

/**
 * Session-JWT actions for certified client opening obligations.
 * Browser → authenticateStatementUser → createSupabaseServerClient → public RPC.
 * Never uses the service-role client (auth.uid() would be null).
 * Does not write public.transactions. No Owner Workspace / RC3 / PDF wiring.
 */

import 'server-only'

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { isValidUUID } from '@/lib/owners/validation'
import {
  assertClientSettlementCertificationRpcAuthorized,
  UnauthorizedClientSettlementCertificationError,
} from './clientSettlementCertificationRpcAuth'
import {
  CLIENT_SETTLEMENT_CERTIFICATION_RPC,
  type ApplyClientSettlementOpeningCertificationInput,
  type ClientSettlementCertificationLineInput,
  type ClientSettlementCertificationRpcResult,
} from './clientSettlementCertificationTypes'

function sessionDb() {
  return createSupabaseServerClient()
}

function staffOrError(
  auth: Awaited<ReturnType<typeof authenticateStatementUser>>,
): { ok: true; userId: string; staffRole: string } | { ok: false; error: string } {
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  try {
    assertClientSettlementCertificationRpcAuthorized({
      jwtRole: 'authenticated',
      staffRole: auth.staffRole,
    })
  } catch (err) {
    if (err instanceof UnauthorizedClientSettlementCertificationError) return { ok: false, error: err.message }
    throw err
  }
  return { ok: true, userId: auth.userId, staffRole: auth.staffRole }
}

function asResult(data: unknown): ClientSettlementCertificationRpcResult {
  const row = data as ClientSettlementCertificationRpcResult
  return {
    id: String(row.id),
    status: row.status,
    replay: Boolean(row.replay),
    inserted_count: Number(row.inserted_count ?? 0),
    inserted: row.inserted,
    actor: row.actor,
  }
}

function toCents(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 1e-8) return null
  return cents
}

function validateLines(
  lines: readonly ClientSettlementCertificationLineInput[],
  totalDueToJj: number,
): string | null {
  if (!Array.isArray(lines) || lines.length < 1) return 'lines must not be empty'
  const orders = new Set<number>()
  const keys = new Set<string>()
  let sum = 0
  for (const line of lines) {
    if (!Number.isInteger(line.line_order) || line.line_order < 1) return 'invalid line_order'
    if (orders.has(line.line_order)) return 'duplicate line_order'
    orders.add(line.line_order)
    const key = `${line.property_key}\u001f${line.component_code}`
    if (keys.has(key)) return 'duplicate line key'
    keys.add(key)
    if (
      !line.property_key.trim() ||
      !line.property_name.trim() ||
      !line.component_code.trim() ||
      !line.reason.trim() ||
      !line.evidence_ref.trim()
    ) {
      return 'line text fields must be non-empty'
    }
    const lineCents = toCents(line.amount_due_to_jj)
    if (lineCents == null) return 'amount_due_to_jj must be exact cents'
    sum += lineCents
  }
  const totalCents = toCents(totalDueToJj)
  if (totalCents == null) return 'total_due_to_jj must be exact cents'
  if (sum !== totalCents) {
    return 'header total_due_to_jj does not equal sum of lines'
  }
  return null
}

export async function applyClientSettlementOpeningCertificationAction(
  input: ApplyClientSettlementOpeningCertificationInput,
): Promise<{ ok: true; result: ClientSettlementCertificationRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(input.entityId)) return { ok: false, error: 'Invalid entity_id' }
  if (input.supersedesId != null && !isValidUUID(input.supersedesId)) {
    return { ok: false, error: 'Invalid supersedes_id' }
  }
  if (!input.asOf || !input.reason.trim() || !input.evidenceRef.trim() || !input.idempotencyKey.trim()) {
    return { ok: false, error: 'Missing required certification fields' }
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    return { ok: false, error: 'Invalid version' }
  }
  const lineError = validateLines(input.lines, input.totalDueToJj)
  if (lineError) return { ok: false, error: lineError }

  const { data, error } = await sessionDb().rpc(CLIENT_SETTLEMENT_CERTIFICATION_RPC.apply, {
    p_entity_id: input.entityId,
    p_as_of: input.asOf,
    p_reason: input.reason.trim(),
    p_evidence_ref: input.evidenceRef.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    p_version: input.version,
    p_supersedes_id: input.supersedesId,
    p_total_due_to_jj: input.totalDueToJj,
    p_lines: input.lines,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}

export async function voidClientSettlementOpeningCertificationAction(
  id: string,
  reason: string,
  evidenceRef: string,
): Promise<{ ok: true; result: ClientSettlementCertificationRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(id) || !reason.trim() || !evidenceRef.trim()) {
    return { ok: false, error: 'Invalid id, reason, or evidence_ref' }
  }
  const { data, error } = await sessionDb().rpc(CLIENT_SETTLEMENT_CERTIFICATION_RPC.void, {
    p_id: id,
    p_reason: reason.trim(),
    p_evidence_ref: evidenceRef.trim(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}
