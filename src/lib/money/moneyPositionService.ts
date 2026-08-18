/**
 * Money Position Service V2 — canonical company-level receivable/payable contract.
 *
 * Wiring Agent (2026-08-16). READ-ONLY. server-only. IO wrapper only —
 * pure aggregation + types live in ./moneyAggregate (unit-tested).
 *
 * Source: public.v_money_position — typed UNION of certified sources (NO double-count):
 *   CLIENT   ← v_counterparty_position (net after actual payments/transfers/offsets)
 *   EMPLOYEE ← v_anastasia_clearing   (cash-custodian; encodes DS-014 / BR-PAYMENT-INSTRUMENT-001)
 * Excluded (documented): PARTNER (partner↔partner equity), SUPPLIER (no source), TENANT (empty).
 *
 * SECURITY: v_money_position is service-role only. Uses createServiceClient().
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import {
  summarizeDirection,
  emptyDirectionSummary,
  normCounterpartyType,
  UNSUPPORTED_COUNTERPARTY_TYPES,
  type MoneyDirection,
  type CounterpartyType,
  type MoneyPositionLineDTO,
  type MoneyDirectionSummaryDTO,
  type UnsupportedCounterpartyTypeDTO,
} from './moneyAggregate'

export type {
  MoneyDirection,
  CounterpartyType,
  MoneyPositionLineDTO,
  MoneyDirectionSummaryDTO,
  CounterpartyTypeBucketDTO,
  UnsupportedCounterpartyTypeDTO,
} from './moneyAggregate'

export interface MoneyPositionDTO {
  readonly receivableToJJ: MoneyDirectionSummaryDTO
  readonly payableByJJ: MoneyDirectionSummaryDTO
  readonly asOfDate: string | null
  readonly scope: 'clients_and_employee_custodian_v2'
  readonly supportedCounterpartyTypes: readonly CounterpartyType[]
  readonly unsupportedCounterpartyTypes: readonly UnsupportedCounterpartyTypeDTO[]
  readonly sourceUnavailable: boolean
}

interface MoneyRow {
  money_position_id: string
  direction: MoneyDirection
  counterparty_contact_id: string | null
  counterparty_canonical_id: string | null
  counterparty_name: string | null
  counterparty_type: string
  canonical_owner_id: string | null
  canonical_property_id: string | null
  open_amount_eur: string | number | null
  signed_position_eur: string | number | null
  gross_amount_eur: string | number | null
  settled_movements_eur: string | number | null
  category: string
  subcategory: string | null
  business_reason: string | null
  confidence_status: string | null
  settlement_status: string
  source_system: string
  source_reference: string
  breakdown: unknown
  as_of_date: string | null
}

function str(v: string | number | null): string {
  return v == null ? '0' : String(v)
}

function mapLine(row: MoneyRow): MoneyPositionLineDTO {
  return {
    moneyPositionId: row.money_position_id,
    direction: row.direction,
    counterpartyCanonicalId: row.counterparty_canonical_id,
    counterpartyName: row.counterparty_name,
    counterpartyType: normCounterpartyType(row.counterparty_type),
    canonicalOwnerId: row.canonical_owner_id,
    canonicalPropertyId: row.canonical_property_id,
    amountEur: str(row.open_amount_eur),
    originalAmountEur: row.gross_amount_eur == null ? null : str(row.gross_amount_eur),
    settledAmountEur: row.settled_movements_eur == null ? null : str(row.settled_movements_eur),
    openAmountEur: str(row.open_amount_eur),
    category: row.category,
    subcategory: row.subcategory,
    businessReason: row.business_reason,
    obligationDate: null,
    dueDate: null,
    agingDays: null,
    confidenceStatus: row.confidence_status,
    settlementStatus: row.settlement_status,
    sourceSystem: row.source_system,
    sourceReference: row.source_reference,
    drillDownReference: row.breakdown ?? null,
    asOfDate: row.as_of_date,
  }
}

/**
 * Canonical company-level money position (V2). Fail-closed: on any source error
 * returns empty totals with sourceUnavailable=true (never mock).
 */
export async function getMoneyPosition(_period?: string): Promise<MoneyPositionDTO> {
  const base = {
    asOfDate: null as string | null,
    scope: 'clients_and_employee_custodian_v2' as const,
    supportedCounterpartyTypes: ['CLIENT', 'CASH_CUSTODIAN'] as CounterpartyType[],
    unsupportedCounterpartyTypes: UNSUPPORTED_COUNTERPARTY_TYPES,
  }

  let db: ReturnType<typeof createServiceClient>
  try {
    db = createServiceClient()
  } catch (err) {
    console.error('[moneyPosition] createServiceClient failed:', err)
    return { receivableToJJ: emptyDirectionSummary(), payableByJJ: emptyDirectionSummary(), ...base, sourceUnavailable: true }
  }

  let rows: MoneyRow[]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).from('v_money_position').select('*')
    if (error) throw error
    rows = (data ?? []) as MoneyRow[]
  } catch (err) {
    console.error('[moneyPosition] v_money_position query failed:', err)
    return { receivableToJJ: emptyDirectionSummary(), payableByJJ: emptyDirectionSummary(), ...base, sourceUnavailable: true }
  }

  const receivable = rows.filter(r => r.direction === 'RECEIVABLE_TO_JJ').map(mapLine)
  const payable = rows.filter(r => r.direction === 'PAYABLE_BY_JJ').map(mapLine)
  const asOfDate = rows.find(r => r.as_of_date)?.as_of_date ?? null

  return {
    receivableToJJ: summarizeDirection(receivable),
    payableByJJ: summarizeDirection(payable),
    ...base,
    asOfDate,
    sourceUnavailable: false,
  }
}
