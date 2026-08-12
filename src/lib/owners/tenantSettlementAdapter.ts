/**
 * tenantSettlementAdapter — Read-only data consumer for Tenant Settlement
 * & Closing Statements.
 *
 * P7 LTR Operations — Tenant Final Settlement + Closing Statement
 *
 * Architecture: ownerWorkspaceService → tenantSettlementAdapter → lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to TenantSettlementRunDTO / TenantClosingStatementDTO /
 *   TenantClosingPositionDTO
 * - Returns empty arrays / null cleanly when no data exists (normal state)
 *
 * Boundary:
 * - Read-only — zero writes (writes go through server actions)
 * - No financial calculations (RPC computes settlement)
 * - No deposit lifecycle logic (P3 authoritative)
 * - No rent logic (P1 authoritative)
 * - No utility logic (P4 authoritative)
 * - No charge logic (P5 authoritative)
 * - Does NOT import any other adapter (G3-18)
 *
 * V1.2 Correction 3 — Deposit Application Model:
 *   total_obligations = rent + utilities + charges − credits
 *   deposit_applied = LEAST(deposit_held, total_obligations)
 *   deposit_refund = deposit_held − deposit_applied
 *   net = total_obligations − deposit_applied
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-4: No delete — status transitions only
 *   P-ARCH-5: lifecycle schema isolation
 *   P-ARCH-6: Tenant NEVER sees JJ margin, internal payer/payee, partner settlement
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  TenantSettlementRunDTO,
  SettlementDirection,
  SettlementStatus,
  TenantClosingStatementDTO,
  ClosingStatementStatus,
  TenantClosingPositionDTO,
} from './ownerWorkspaceTypes'

// ─── Validated type guards ──────────────────────────────────────────────────

const VALID_SETTLEMENT_DIRECTIONS = new Set<SettlementDirection>([
  'tenant_owes_jj', 'jj_owes_tenant', 'balanced',
])

const VALID_SETTLEMENT_STATUSES = new Set<SettlementStatus>([
  'draft', 'approved', 'communicated', 'settled', 'disputed',
])

const VALID_CLOSING_STATEMENT_STATUSES = new Set<ClosingStatementStatus>([
  'draft', 'approved', 'sent', 'acknowledged',
])

// ─── Row → DTO mappers (pure) ───────────────────────────────────────────────

function mapSettlementRunRow(row: Record<string, unknown>): TenantSettlementRunDTO | null {
  const direction = String(row.settlement_direction ?? '')
  const status = String(row.status ?? '')

  if (!VALID_SETTLEMENT_DIRECTIONS.has(direction as SettlementDirection)) {
    console.error(`[tenantSettlementAdapter] Invalid settlement_direction "${direction}" for run ${row.id}`)
    return null
  }
  if (!VALID_SETTLEMENT_STATUSES.has(status as SettlementStatus)) {
    console.error(`[tenantSettlementAdapter] Invalid status "${status}" for run ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    tenantName: String(row.tenant_name),
    settlementDate: String(row.settlement_date),

    rentOutstandingEur: Number(row.rent_outstanding_eur ?? 0),
    utilityOutstandingEur: Number(row.utility_outstanding_eur ?? 0),
    tenantChargesEur: Number(row.tenant_charges_eur ?? 0),
    creditsEur: Number(row.credits_eur ?? 0),
    depositHeldEur: Number(row.deposit_held_eur ?? 0),

    totalObligationsEur: Number(row.total_obligations_eur ?? 0),
    depositAppliedToObligations: Number(row.deposit_applied_to_obligations ?? 0),
    depositRefundEur: Number(row.deposit_refund_eur ?? 0),

    netSettlementEur: Number(row.net_settlement_eur ?? 0),
    settlementDirection: direction as SettlementDirection,

    status: status as SettlementStatus,
    componentDetails: (row.component_details as Record<string, unknown>) ?? {},
    approvedBy: row.approved_by != null ? String(row.approved_by) : null,
    approvedAt: row.approved_at != null ? String(row.approved_at) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapClosingStatementRow(row: Record<string, unknown>): TenantClosingStatementDTO | null {
  const status = String(row.status ?? '')

  if (!VALID_CLOSING_STATEMENT_STATUSES.has(status as ClosingStatementStatus)) {
    console.error(`[tenantSettlementAdapter] Invalid closing statement status "${status}" for ${row.id}`)
    return null
  }

  return {
    id: String(row.id),
    settlementRunId: String(row.settlement_run_id),
    rentalContractId: String(row.rental_contract_id),
    tenantName: String(row.tenant_name),
    propertyAddress: row.property_address != null ? String(row.property_address) : null,
    statementDate: String(row.statement_date),
    statementVersion: Number(row.statement_version ?? 1),

    depositAmountEur: Number(row.deposit_amount_eur ?? 0),
    rentBalanceEur: Number(row.rent_balance_eur ?? 0),
    utilityBalanceEur: Number(row.utility_balance_eur ?? 0),
    damageChargesEur: Number(row.damage_charges_eur ?? 0),
    creditsEur: Number(row.credits_eur ?? 0),

    totalObligationsEur: Number(row.total_obligations_eur ?? 0),
    depositAppliedToObligations: Number(row.deposit_applied_to_obligations ?? 0),
    depositRefundEur: Number(row.deposit_refund_eur ?? 0),
    finalBalanceEur: Number(row.final_balance_eur ?? 0),

    status: status as ClosingStatementStatus,
    sentAt: row.sent_at != null ? String(row.sent_at) : null,
    sentVia: row.sent_via != null ? String(row.sent_via) : null,
    documentReference: row.document_reference != null ? String(row.document_reference) : null,
    templateVersion: row.template_version != null ? String(row.template_version) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapClosingPositionRow(row: Record<string, unknown>): TenantClosingPositionDTO | null {
  const direction = String(row.settlement_direction ?? '')
  const settlementStatus = String(row.settlement_status ?? '')

  if (!VALID_SETTLEMENT_DIRECTIONS.has(direction as SettlementDirection)) {
    console.error(`[tenantSettlementAdapter] Invalid direction in closing position for run ${row.settlement_run_id}`)
    return null
  }
  if (!VALID_SETTLEMENT_STATUSES.has(settlementStatus as SettlementStatus)) {
    console.error(`[tenantSettlementAdapter] Invalid settlement_status in closing position for run ${row.settlement_run_id}`)
    return null
  }

  const stmtStatus = row.statement_status != null ? String(row.statement_status) : null
  const validStmtStatus = stmtStatus != null && VALID_CLOSING_STATEMENT_STATUSES.has(stmtStatus as ClosingStatementStatus)
    ? (stmtStatus as ClosingStatementStatus)
    : null

  return {
    settlementRunId: String(row.settlement_run_id),
    rentalContractId: String(row.rental_contract_id),
    propertyId: String(row.property_id),
    tenantName: String(row.tenant_name),
    settlementDate: String(row.settlement_date),
    netSettlementEur: Number(row.net_settlement_eur ?? 0),
    settlementDirection: direction as SettlementDirection,
    settlementStatus: settlementStatus as SettlementStatus,

    closingStatementId: row.closing_statement_id != null ? String(row.closing_statement_id) : null,
    statementVersion: row.statement_version != null ? Number(row.statement_version) : null,
    statementStatus: validStmtStatus,
    finalBalanceEur: row.final_balance_eur != null ? Number(row.final_balance_eur) : null,
    sentAt: row.sent_at != null ? String(row.sent_at) : null,
  }
}

// ─── Public API — Settlement Runs ───────────────────────────────────────────

/**
 * Fetch all settlement runs for a rental contract.
 */
export async function fetchContractSettlementRuns(
  rentalContractId: string,
): Promise<readonly TenantSettlementRunDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_contract_settlement_runs', {
        p_rental_contract_id: rentalContractId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapSettlementRunRow)
      .filter((dto): dto is TenantSettlementRunDTO => dto !== null)
  } catch (err) {
    console.error('[tenantSettlementAdapter] fetchContractSettlementRuns failed:', err)
    return []
  }
}

// ─── Public API — Closing Statements ────────────────────────────────────────

/**
 * Fetch a single closing statement by ID.
 */
export async function fetchClosingStatement(
  statementId: string,
): Promise<TenantClosingStatementDTO | null> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_closing_statement', {
        p_statement_id: statementId,
      })

    if (error) throw error
    if (!data) return null

    // RPC returns SETOF — may be array with 0 or 1 row
    const rows = Array.isArray(data) ? data : [data]
    if (rows.length === 0) return null

    return mapClosingStatementRow(rows[0] as Record<string, unknown>)
  } catch (err) {
    console.error('[tenantSettlementAdapter] fetchClosingStatement failed:', err)
    return null
  }
}

// ─── Public API — Closing Position (composition view) ───────────────────────

/**
 * Fetch closing position for a rental contract — settlement + latest statement.
 * Uses v_tenant_closing_position composition view via get_contract_closing_position RPC.
 */
export async function fetchClosingPosition(
  rentalContractId: string,
): Promise<readonly TenantClosingPositionDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_contract_closing_position', {
        p_rental_contract_id: rentalContractId,
      })

    if (error) throw error
    if (!data || !Array.isArray(data)) return []

    return (data as Record<string, unknown>[])
      .map(mapClosingPositionRow)
      .filter((dto): dto is TenantClosingPositionDTO => dto !== null)
  } catch (err) {
    console.error('[tenantSettlementAdapter] fetchClosingPosition failed:', err)
    return []
  }
}
