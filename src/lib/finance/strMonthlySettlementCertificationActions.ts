'use server'

/**
 * Session-JWT actions for generic monthly STR owner-settlement certifications.
 * Browser → authenticateStatementUser → createSupabaseServerClient → public RPC.
 * Does not write public.transactions. Does not wire PDF or client-report components.
 */

import 'server-only'

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { isValidUUID } from '@/lib/owners/validation'
import {
  assertStrMonthlySettlementRpcAuthorized,
  UnauthorizedStrMonthlySettlementError,
} from './strMonthlySettlementCertificationRpcAuth'
import { toExactCents } from './strMonthlySettlementCertificationContract'
import {
  STR_COMPONENT_RECONCILIATION_STATUSES,
  STR_MONTHLY_LINE_FIELDS,
  STR_MONTHLY_SETTLEMENT_RPC,
  STR_MONTHLY_SOURCE_AUTHORITIES,
  type ApplyStrMonthlySettlementCertificationInput,
  type StrMonthlySettlementLineInput,
  type StrMonthlySettlementRpcResult,
} from './strMonthlySettlementCertificationTypes'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_START = /^\d{4}-\d{2}-01$/
const COMPONENT_KEYS = [
  'gross_accommodation',
  'platform_fee',
  'cleaning_amount',
  'tax_amount',
  'management_fee',
  'other_adjustments',
] as const

function sessionDb() {
  return createSupabaseServerClient()
}

function staffOrError(
  auth: Awaited<ReturnType<typeof authenticateStatementUser>>,
): { ok: true; userId: string; staffRole: string } | { ok: false; error: string } {
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  try {
    assertStrMonthlySettlementRpcAuthorized({
      jwtRole: 'authenticated',
      staffRole: auth.staffRole,
    })
  } catch (err) {
    if (err instanceof UnauthorizedStrMonthlySettlementError) return { ok: false, error: err.message }
    throw err
  }
  return { ok: true, userId: auth.userId, staffRole: auth.staffRole }
}

function asResult(data: unknown): StrMonthlySettlementRpcResult {
  const row = data as StrMonthlySettlementRpcResult
  return {
    id: String(row.id),
    status: row.status,
    replay: Boolean(row.replay),
    inserted_count: Number(row.inserted_count ?? 0),
    inserted: row.inserted,
    actor: row.actor,
  }
}

function validateLines(
  lines: readonly StrMonthlySettlementLineInput[],
  totalOwnerNet: number,
  periodFrom: string,
  periodTo: string,
): string | null {
  if (!Array.isArray(lines) || lines.length < 1) return 'lines must not be empty'
  const orders = new Set<number>()
  const months = new Set<string>()
  let sum = 0
  for (const line of lines) {
    const raw = line as unknown as Record<string, unknown>
    for (const key of Object.keys(raw)) {
      if (!(STR_MONTHLY_LINE_FIELDS as readonly string[]).includes(key)) return 'line field is not allowed'
    }
    if (!Number.isInteger(line.line_order) || line.line_order < 1) return 'invalid line_order'
    if (orders.has(line.line_order)) return 'duplicate line_order'
    orders.add(line.line_order)
    if (!MONTH_START.test(line.month_start)) return 'month_start must be the first day of the month'
    const [yearText, monthText] = line.month_start.split('-')
    const monthEnd = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).toISOString().slice(0, 10)
    if (line.month_start < periodFrom || monthEnd > periodTo) return 'month is outside the certification period'
    if (months.has(line.month_start)) return 'duplicate month_start'
    months.add(line.month_start)
    if (!(STR_MONTHLY_SOURCE_AUTHORITIES as readonly string[]).includes(line.source_authority)) {
      return 'source_authority is not recognized'
    }
    if (!(STR_COMPONENT_RECONCILIATION_STATUSES as readonly string[]).includes(line.component_reconciliation_status)) {
      return 'component_reconciliation_status is not recognized'
    }
    if (!line.evidence_ref.trim() || !line.evidence_note.trim()) return 'line evidence fields must be non-empty'
    if (line.reservation_count != null && (!Number.isInteger(line.reservation_count) || line.reservation_count < 0)) {
      return 'reservation_count must be a non-negative integer or null'
    }
    if (line.nights != null && (!Number.isInteger(line.nights) || line.nights < 0)) {
      return 'nights must be a non-negative integer or null'
    }
    const ownerCents = toExactCents(line.owner_net)
    if (ownerCents == null) return 'owner_net must be exact cents'
    sum += ownerCents
    for (const key of COMPONENT_KEYS) {
      const value = line[key]
      if (value == null) continue
      if (line.component_reconciliation_status === 'certified_total_only') {
        return 'certified_total_only lines cannot carry component amounts'
      }
      if (toExactCents(value) == null) return `${key} must be exact cents or null`
    }
  }
  const totalCents = toExactCents(totalOwnerNet)
  if (totalCents == null) return 'total_owner_net must be exact cents'
  if (sum !== totalCents) return 'header total_owner_net does not equal sum of monthly owner_net lines'
  return null
}

export async function applyStrMonthlySettlementCertificationAction(
  input: ApplyStrMonthlySettlementCertificationInput,
): Promise<{ ok: true; result: StrMonthlySettlementRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(input.entityId)) return { ok: false, error: 'Invalid entity_id' }
  if (!isValidUUID(input.propertyId)) return { ok: false, error: 'Invalid property_id' }
  if (input.supersedesId != null && !isValidUUID(input.supersedesId)) {
    return { ok: false, error: 'Invalid supersedes_id' }
  }
  if (
    !ISO_DATE.test(input.periodFrom) ||
    !ISO_DATE.test(input.periodTo) ||
    input.periodFrom > input.periodTo ||
    !input.reason.trim() ||
    !input.evidenceRef.trim() ||
    !input.idempotencyKey.trim()
  ) {
    return { ok: false, error: 'Missing required certification fields' }
  }
  if (!Number.isInteger(input.version) || input.version < 1) return { ok: false, error: 'Invalid version' }
  const lineError = validateLines(input.lines, input.totalOwnerNet, input.periodFrom, input.periodTo)
  if (lineError) return { ok: false, error: lineError }

  const { data, error } = await sessionDb().rpc(STR_MONTHLY_SETTLEMENT_RPC.apply, {
    p_entity_id: input.entityId,
    p_property_id: input.propertyId,
    p_period_from: input.periodFrom,
    p_period_to: input.periodTo,
    p_version: input.version,
    p_supersedes_id: input.supersedesId,
    p_total_owner_net: input.totalOwnerNet,
    p_reason: input.reason.trim(),
    p_evidence_ref: input.evidenceRef.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    p_lines: input.lines,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}

export async function voidStrMonthlySettlementCertificationAction(
  id: string,
  reason: string,
  evidenceRef: string,
): Promise<{ ok: true; result: StrMonthlySettlementRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (!isValidUUID(id) || !reason.trim() || !evidenceRef.trim()) {
    return { ok: false, error: 'Invalid id, reason, or evidence_ref' }
  }
  const { data, error } = await sessionDb().rpc(STR_MONTHLY_SETTLEMENT_RPC.void, {
    p_id: id,
    p_reason: reason.trim(),
    p_evidence_ref: evidenceRef.trim(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}
