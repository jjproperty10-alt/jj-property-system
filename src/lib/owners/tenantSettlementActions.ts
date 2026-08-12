'use server'

/**
 * tenantSettlementActions — Server Actions for Tenant Settlement
 * & Closing Statement lifecycle.
 *
 * P7 LTR Operations — Tenant Final Settlement + Closing Statement
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * V1.2 Correction 3 — Deposit Application Model:
 *   total_obligations = rent + utilities + charges − credits
 *   deposit_applied = LEAST(deposit_held, total_obligations)
 *   deposit_refund = deposit_held − deposit_applied
 *   net = total_obligations − deposit_applied
 *
 * Computation is RPC-side — this module validates input and forwards.
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - Modifying deposit lifecycle (P3 authoritative)
 *   - Modifying rent obligations (P1 authoritative)
 *   - Modifying utility obligations (P4 authoritative)
 *   - Modifying tenant charges (P5 authoritative)
 *   - Any settlement balance calculation in TypeScript
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type { SettlementStatus, ClosingStatementStatus } from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const VALID_SETTLEMENT_STATUSES = new Set<SettlementStatus>([
  'draft', 'approved', 'communicated', 'settled', 'disputed',
])

const VALID_CLOSING_STATEMENT_STATUSES = new Set<ClosingStatementStatus>([
  'draft', 'approved', 'sent', 'acknowledged',
])

// ─── Compute Tenant Settlement ──────────────────────────────────────────────

export interface ComputeSettlementInput {
  rentalContractId: string
  settlementDate: string
  notes?: string | null
}

export async function computeSettlementAction(
  input: ComputeSettlementInput,
): Promise<
  | { ok: true; result: { id: string; net_settlement_eur: number; settlement_direction: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!input.rentalContractId || !isValidUUID(input.rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }
  if (!input.settlementDate || !ISO_DATE_RE.test(input.settlementDate)) {
    return { ok: false, error: 'Settlement date is required (YYYY-MM-DD)' }
  }

  // ── RPC call ──────────────────────────────────────────────────────────────

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('compute_tenant_settlement', {
        p_rental_contract_id: input.rentalContractId,
        p_settlement_date: input.settlementDate,
        p_notes: input.notes?.trim() || null,
      })

    if (error) throw error
    if (!data) return { ok: false, error: 'Settlement computation returned no result' }

    // RPC returns JSONB — parse the result
    const result = typeof data === 'string' ? JSON.parse(data) : data
    // Handle array wrapping from SETOF
    const row = Array.isArray(result) ? result[0] : result

    return {
      ok: true,
      result: {
        id: String(row.id ?? row.settlement_run_id),
        net_settlement_eur: Number(row.net_settlement_eur ?? 0),
        settlement_direction: String(row.settlement_direction ?? 'balanced'),
      },
    }
  } catch (err) {
    console.error('[tenantSettlementActions] computeSettlementAction failed:', err)
    const message = err instanceof Error ? err.message : 'Settlement computation failed'
    return { ok: false, error: message }
  }
}

// ─── Update Settlement Status ───────────────────────────────────────────────

export interface UpdateSettlementStatusInput {
  settlementRunId: string
  newStatus: SettlementStatus
  notes?: string | null
}

export async function updateSettlementStatusAction(
  input: UpdateSettlementStatusInput,
): Promise<
  | { ok: true; result: { id: string; previous_status: string; new_status: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!input.settlementRunId || !isValidUUID(input.settlementRunId)) {
    return { ok: false, error: 'Invalid settlement run ID' }
  }
  if (!VALID_SETTLEMENT_STATUSES.has(input.newStatus)) {
    return { ok: false, error: `Invalid status: ${input.newStatus}` }
  }

  // ── RPC call ──────────────────────────────────────────────────────────────

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('update_settlement_status', {
        p_settlement_run_id: input.settlementRunId,
        p_new_status: input.newStatus,
        p_notes: input.notes?.trim() || null,
      })

    if (error) throw error
    if (!data) return { ok: false, error: 'Status update returned no result' }

    const result = typeof data === 'string' ? JSON.parse(data) : data
    const row = Array.isArray(result) ? result[0] : result

    return {
      ok: true,
      result: {
        id: String(row.id ?? input.settlementRunId),
        previous_status: String(row.previous_status ?? ''),
        new_status: String(row.new_status ?? input.newStatus),
      },
    }
  } catch (err) {
    console.error('[tenantSettlementActions] updateSettlementStatusAction failed:', err)
    const message = err instanceof Error ? err.message : 'Status update failed'
    return { ok: false, error: message }
  }
}

// ─── Create Closing Statement ───────────────────────────────────────────────

export interface CreateClosingStatementInput {
  settlementRunId: string
  propertyAddress?: string | null
  templateVersion?: string | null
  notes?: string | null
}

export async function createClosingStatementAction(
  input: CreateClosingStatementInput,
): Promise<
  | { ok: true; result: { id: string; statement_version: number; status: string } }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!input.settlementRunId || !isValidUUID(input.settlementRunId)) {
    return { ok: false, error: 'Invalid settlement run ID' }
  }

  // ── RPC call ──────────────────────────────────────────────────────────────

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('create_closing_statement', {
        p_settlement_run_id: input.settlementRunId,
        p_property_address: input.propertyAddress?.trim() || null,
        p_template_version: input.templateVersion?.trim() || null,
      })

    if (error) throw error
    if (!data) return { ok: false, error: 'Closing statement creation returned no result' }

    const result = typeof data === 'string' ? JSON.parse(data) : data
    const row = Array.isArray(result) ? result[0] : result

    return {
      ok: true,
      result: {
        id: String(row.id ?? row.statement_id),
        statement_version: Number(row.statement_version ?? 1),
        status: String(row.status ?? 'draft'),
      },
    }
  } catch (err) {
    console.error('[tenantSettlementActions] createClosingStatementAction failed:', err)
    const message = err instanceof Error ? err.message : 'Closing statement creation failed'
    return { ok: false, error: message }
  }
}
