/**
 * rentPositionAdapter — Read-only data consumer for Rent Position + Obligations + Terms.
 *
 * P1 LTR Operations — Rent Terms + Expected Rent + FIFO Allocator
 *
 * Architecture: ownerWorkspaceService → rentPositionAdapter → lifecycle RPCs
 *
 * Responsibility:
 * - Calls lifecycle RPCs via Supabase (service_role only)
 * - Maps raw DB rows to RentPositionDTO / RentObligationRowDTO / RentTermDTO
 * - Returns empty arrays cleanly when no data exists (normal state)
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations
 * - No tenant payment matching (that's the FIFO RPC's job)
 * - No settlement, ownership, or P&L logic
 * - Does NOT import: rentalContractAdapter, ownerFinancialAdapter (G3-18)
 *
 * Three-authority separation:
 *   Service Engagement = what service JJ provides
 *   Rental Contract = who is renting, terms, period
 *   Rent Terms = expected rent amounts over time (THIS ADAPTER reads)
 *   Rent Obligations = monthly expected-vs-received tracking (THIS ADAPTER reads)
 *   Tenant Payment = actual rent money (public.transactions — NOT touched)
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  RentPositionDTO,
  RentObligationRowDTO,
  RentObligationStatus,
  RentTermDTO,
  RentTermReason,
  RentProrataSegment,
  SettlementEvidenceEntry,
  RentalContractStatus,
} from './ownerWorkspaceTypes'

// ─── DB Row Types (internal — not exported) ─────────────────────────────────

interface RentPositionRow {
  rental_contract_id: string
  property_id: string
  tenant_name: string
  contract_start: string
  contract_end: string | null
  contract_status: string
  current_monthly_rent: number | null
  total_obligations: number
  received_count: number
  outstanding_count: number
  overdue_count: number
  total_expected_eur: number
  total_received_eur: number
  outstanding_eur: number
  latest_obligation_month: string | null
  received_by_jj_eur: number
  received_by_jacob_eur: number
  received_by_yossi_eur: number
  received_by_anastasia_eur: number
}

interface RentObligationRow {
  id: string
  rent_term_id: string
  prorata_details: unknown[] | null
  obligation_month: string
  due_date: string
  expected_amount_eur: number
  received_amount_eur: number
  unapplied_credit_eur: number
  status: string
  tenant_name: string
  settlement_evidence: unknown[] | null
}

interface RentTermRow {
  id: string
  rental_contract_id: string
  monthly_rent_eur: number
  effective_from: string
  effective_to: string | null
  reason: string
  governing_evidence: string | null
}

// ─── Validated type guards ──────────────────────────────────────────────────

const VALID_OBL_STATUSES = new Set<RentObligationStatus>([
  'expected', 'due', 'partial', 'received', 'overdue', 'waived', 'reversed',
])

function isValidOblStatus(value: string): value is RentObligationStatus {
  return VALID_OBL_STATUSES.has(value as RentObligationStatus)
}

const VALID_CONTRACT_STATUSES = new Set<RentalContractStatus>([
  'draft', 'active', 'expired', 'terminated',
])

function isValidContractStatus(value: string): value is RentalContractStatus {
  return VALID_CONTRACT_STATUSES.has(value as RentalContractStatus)
}

const VALID_TERM_REASONS = new Set<RentTermReason>([
  'initial', 'annual_increase', 'renegotiation', 'correction', 'market_adjustment',
])

function isValidTermReason(value: string): value is RentTermReason {
  return VALID_TERM_REASONS.has(value as RentTermReason)
}

// ─── Row → DTO mappers (pure) ───────────────────────────────────────────────

function mapPositionRow(row: RentPositionRow): RentPositionDTO | null {
  if (!isValidContractStatus(row.contract_status)) {
    console.error(
      `[rentPositionAdapter] Invalid contract status "${row.contract_status}" for contract ${row.rental_contract_id}`,
    )
    return null
  }

  return {
    rentalContractId: row.rental_contract_id,
    propertyId: row.property_id,
    tenantName: row.tenant_name,
    currentMonthlyRent: row.current_monthly_rent != null ? Number(row.current_monthly_rent) : null,
    contractStart: row.contract_start,
    contractEnd: row.contract_end ?? null,
    contractStatus: row.contract_status,
    totalObligations: Number(row.total_obligations),
    receivedCount: Number(row.received_count),
    outstandingCount: Number(row.outstanding_count),
    overdueCount: Number(row.overdue_count),
    totalExpectedEur: String(row.total_expected_eur),
    totalReceivedEur: String(row.total_received_eur),
    outstandingEur: String(row.outstanding_eur),
    latestObligationMonth: row.latest_obligation_month ?? null,
    receivedByJjEur: String(row.received_by_jj_eur),
    receivedByJacobEur: String(row.received_by_jacob_eur),
    receivedByYossiEur: String(row.received_by_yossi_eur),
    receivedByAnastasiaEur: String(row.received_by_anastasia_eur),
  }
}

function mapObligationRow(row: RentObligationRow): RentObligationRowDTO | null {
  if (!isValidOblStatus(row.status)) {
    console.error(
      `[rentPositionAdapter] Invalid obligation status "${row.status}" for obligation ${row.id}`,
    )
    return null
  }

  // Parse prorata details
  let prorataDetails: readonly RentProrataSegment[] | null = null
  if (Array.isArray(row.prorata_details) && row.prorata_details.length > 0) {
    prorataDetails = (row.prorata_details as Record<string, unknown>[]).map(seg => ({
      rentTermId: String(seg.rent_term_id ?? ''),
      monthlyRentEur: Number(seg.monthly_rent_eur ?? 0),
      segmentStart: String(seg.segment_start ?? ''),
      segmentEnd: String(seg.segment_end ?? ''),
      segmentDays: Number(seg.segment_days ?? 0),
      segmentAmountEur: Number(seg.segment_amount_eur ?? 0),
    }))
  }

  // Parse settlement evidence
  let evidence: readonly SettlementEvidenceEntry[] | null = null
  if (Array.isArray(row.settlement_evidence) && row.settlement_evidence.length > 0) {
    evidence = (row.settlement_evidence as Record<string, unknown>[]).map(e => ({
      source_transaction_id: e.source_transaction_id != null ? String(e.source_transaction_id) : null,
      payer: String(e.payer ?? ''),
      payee: String(e.payee ?? ''),
      amount: Number(e.amount ?? 0),
      date: String(e.date ?? ''),
      mechanism: String(e.mechanism ?? ''),
      allocation_order: Number(e.allocation_order ?? 0),
    }))
  }

  return {
    id: row.id,
    rentTermId: row.rent_term_id,
    prorataDetails,
    obligationMonth: row.obligation_month,
    dueDate: row.due_date,
    expectedAmountEur: String(row.expected_amount_eur),
    receivedAmountEur: String(row.received_amount_eur),
    unappliedCreditEur: String(row.unapplied_credit_eur),
    status: row.status as RentObligationStatus,
    tenantName: row.tenant_name,
    settlementEvidence: evidence,
  }
}

function mapTermRow(row: RentTermRow): RentTermDTO | null {
  if (!isValidTermReason(row.reason)) {
    console.error(
      `[rentPositionAdapter] Invalid term reason "${row.reason}" for term ${row.id}`,
    )
    return null
  }

  return {
    id: row.id,
    rentalContractId: row.rental_contract_id,
    monthlyRentEur: Number(row.monthly_rent_eur),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    reason: row.reason as RentTermReason,
    governingEvidence: row.governing_evidence ?? null,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch rent position for all contracts on a property.
 * Returns empty array when no contracts/obligations exist (normal state).
 */
export async function fetchPropertyRentPosition(
  propertyId: string,
): Promise<readonly RentPositionDTO[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_property_rent_position', {
        p_property_id: propertyId,
      })

    if (error) throw error
    if (!data) return []

    return (data as RentPositionRow[])
      .map(mapPositionRow)
      .filter((dto): dto is RentPositionDTO => dto !== null)
  } catch (err) {
    console.error('[rentPositionAdapter] fetchPropertyRentPosition failed:', err)
    return []
  }
}

/**
 * Fetch all rent obligations for a specific rental contract.
 * Returns empty array when no obligations exist (normal state).
 */
export async function fetchRentObligations(
  rentalContractId: string,
): Promise<readonly RentObligationRowDTO[]> {
  try {
    const sb = createServiceClient()

    // Direct query via service_role — obligations are RLS deny-all
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('rent_obligations')
      .select('id, rent_term_id, prorata_details, obligation_month, due_date, expected_amount_eur, received_amount_eur, unapplied_credit_eur, status, tenant_name, settlement_evidence')
      .eq('rental_contract_id', rentalContractId)
      .order('obligation_month', { ascending: true })

    if (error) throw error
    if (!data) return []

    return (data as RentObligationRow[])
      .map(mapObligationRow)
      .filter((dto): dto is RentObligationRowDTO => dto !== null)
  } catch (err) {
    console.error('[rentPositionAdapter] fetchRentObligations failed:', err)
    return []
  }
}

/**
 * Fetch rent term history for a rental contract.
 * Returns empty array when no terms exist (normal state).
 */
export async function fetchRentTermHistory(
  rentalContractId: string,
): Promise<readonly RentTermDTO[]> {
  try {
    const sb = createServiceClient()

    // Direct query via service_role — terms are RLS deny-all
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('rent_terms')
      .select('id, rental_contract_id, monthly_rent_eur, effective_from, effective_to, reason, governing_evidence')
      .eq('rental_contract_id', rentalContractId)
      .order('effective_from', { ascending: true })

    if (error) throw error
    if (!data) return []

    return (data as RentTermRow[])
      .map(mapTermRow)
      .filter((dto): dto is RentTermDTO => dto !== null)
  } catch (err) {
    console.error('[rentPositionAdapter] fetchRentTermHistory failed:', err)
    return []
  }
}
