/**
 * ownerSettlementAdapter — Settlement Engine V1.2 data consumer.
 *
 * Architecture: Owner Workspace → ownerSettlementAdapter → v_contact_settlement_summary
 *
 * Responsibility:
 * - Reads settlement balances from v_contact_settlement_summary (sole authority)
 * - Reads temporal transition status from settlement_temporal_transitions
 * - Derives balance direction from sign convention:
 *     positive net_jj_settlement = Client owes JJ
 *     negative net_jj_settlement = JJ owes Client
 *     zero = Settled
 * - Returns OwnerSettlementDTO — UI renders only, no recalculation
 *
 * Boundary rules:
 * - Never reads public.transactions directly
 * - Never recalculates settlement — reads engine-computed values
 * - Never modifies any data
 * - Fail-closed: returns null when data unavailable
 *
 * @see SETTLEMENT_V1_2_IMPLEMENTATION_REPORT.md — engine authority
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type { OwnerSettlementDTO, EuroAmount } from './ownerWorkspaceTypes'

// ─── DB Row Types (internal) ─────────────────────────────────────────────────

interface SettlementSummaryRow {
  contact_id: string
  contact_name: string
  total_rows: number
  net_jj_settlement: number
  net_deal_balance: number | null
}

interface TemporalTransitionRow {
  contact_name_from: string
  contact_name_to: string
  certification_status: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveDirection(net: number): 'jj_owes_owner' | 'owner_owes_jj' | 'balanced' {
  if (net > 0) return 'owner_owes_jj'   // Client owes JJ
  if (net < 0) return 'jj_owes_owner'   // JJ owes Client
  return 'balanced'
}

function toEur(n: number): EuroAmount {
  return String(n)
}

function buildSettlementDTO(
  row: SettlementSummaryRow,
  temporalStatus: 'green' | 'yellow',
  temporalReason: string | null,
): OwnerSettlementDTO {
  const net = Number(row.net_jj_settlement)
  return {
    balanceDirection: deriveDirection(net),
    balanceEur: toEur(Math.abs(net)),
    netJjSettlement: toEur(net),
    temporalStatus,
    temporalReason,
    totalRows: row.total_rows,
  }
}

// ─── Temporal Status Resolution ──────────────────────────────────────────────

/**
 * Temporal query result — distinguishes success from failure.
 * G5 fail-closed: when querySucceeded is false, callers must NOT default to 'green'.
 */
interface TemporalQueryResult {
  querySucceeded: boolean
  yellowContacts: Map<string, string>
}

/**
 * Fetch YELLOW contacts from settlement_temporal_transitions.
 * Returns a TemporalQueryResult to distinguish success from failure.
 *
 * G5 fail-closed semantics:
 * - querySucceeded=true + not in map → GREEN (verified clean)
 * - querySucceeded=true + in map → YELLOW (flagged transition)
 * - querySucceeded=false → caller must NOT assign GREEN
 */
async function fetchTemporalYellowContacts(): Promise<TemporalQueryResult> {
  const sb = createServiceClient()
  const yellowContacts = new Map<string, string>()

  try {
    const { data, error } = await sb
      .from('settlement_temporal_transitions')
      .select('contact_name_from, contact_name_to, certification_status')
      .eq('certification_status', 'yellow')

    if (error) throw error

    if (data) {
      for (const row of data as TemporalTransitionRow[]) {
        yellowContacts.set(
          row.contact_name_from,
          `Temporal transition: property transferred to ${row.contact_name_to}`,
        )
        yellowContacts.set(
          row.contact_name_to,
          `Temporal transition: property received from ${row.contact_name_from}`,
        )
      }
    }

    return { querySucceeded: true, yellowContacts }
  } catch (err) {
    console.error(
      '[ownerSettlementAdapter] fetchTemporalYellowContacts failed:',
      err instanceof Error ? err.message : String(err),
    )
    return { querySucceeded: false, yellowContacts }
  }
}

/**
 * Resolve temporal status for a contact given the query result.
 * G5 fail-closed: returns 'yellow' when query failed — never 'green' on failure.
 */
function resolveTemporalStatus(
  contactName: string,
  temporal: TemporalQueryResult,
): { status: 'green' | 'yellow'; reason: string | null } {
  if (!temporal.querySucceeded) {
    return {
      status: 'yellow',
      reason: 'Temporal status could not be verified — fail-closed (G5)',
    }
  }
  const reason = temporal.yellowContacts.get(contactName)
  if (reason) {
    return { status: 'yellow', reason }
  }
  return { status: 'green', reason: null }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch all settlement summaries (batch — for Owners Room list).
 * Returns a Map<contactName, OwnerSettlementDTO>.
 *
 * Fail-closed: returns empty map on any DB error.
 * G5: temporal query failure → all contacts get 'yellow' (never false green).
 */
export async function fetchAllSettlements(): Promise<Map<string, OwnerSettlementDTO>> {
  const result = new Map<string, OwnerSettlementDTO>()

  try {
    const sb = createServiceClient()

    // Parallel: settlement summaries + temporal transitions
    const [summaryResult, temporal] = await Promise.all([
      sb.from('v_contact_settlement_summary').select('*'),
      fetchTemporalYellowContacts(),
    ])

    if (summaryResult.error) throw summaryResult.error
    if (!summaryResult.data) return result

    for (const row of summaryResult.data as SettlementSummaryRow[]) {
      const name = row.contact_name
      const { status, reason } = resolveTemporalStatus(name, temporal)
      const dto = buildSettlementDTO(row, status, reason)
      result.set(name, dto)
    }
  } catch (err) {
    console.error(
      '[ownerSettlementAdapter] fetchAllSettlements failed:',
      err instanceof Error ? err.message : String(err),
    )
  }

  return result
}

/**
 * Fetch settlement for a single contact by name.
 * Returns null when the contact has no settlement data or on DB error.
 * G5: temporal query failure → contact gets 'yellow' (never false green).
 */
export async function fetchSettlementByName(
  contactName: string,
): Promise<OwnerSettlementDTO | null> {
  try {
    const sb = createServiceClient()

    const [summaryResult, temporal] = await Promise.all([
      sb
        .from('v_contact_settlement_summary')
        .select('*')
        .eq('contact_name', contactName)
        .limit(1)
        .single(),
      fetchTemporalYellowContacts(),
    ])

    if (summaryResult.error) {
      // PGRST116 = no rows found — not an error, just no settlement data
      if (summaryResult.error.code === 'PGRST116') return null
      throw summaryResult.error
    }

    const row = summaryResult.data as SettlementSummaryRow
    const { status, reason } = resolveTemporalStatus(contactName, temporal)

    return buildSettlementDTO(row, status, reason)
  } catch (err) {
    console.error(
      '[ownerSettlementAdapter] fetchSettlementByName failed:',
      contactName,
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
