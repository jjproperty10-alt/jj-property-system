/**
 * Generic certified monthly STR owner-settlement types.
 * owner_net is an approved accounting value. Components are informational.
 * No production client IDs or certified amounts live here.
 */

export const STR_MONTHLY_SETTLEMENT_STATUSES = ['draft', 'approved', 'applied', 'void'] as const
export type StrMonthlySettlementStatus = (typeof STR_MONTHLY_SETTLEMENT_STATUSES)[number]

export const STR_MONTHLY_SETTLEMENT_STAFF_ROLES = ['ceo', 'finance_admin'] as const
export type StrMonthlySettlementStaffRole = (typeof STR_MONTHLY_SETTLEMENT_STAFF_ROLES)[number]

export const STR_MONTHLY_SOURCE_AUTHORITIES = [
  'platform_statement',
  'owner_statement',
  'approved_reconstruction',
] as const
export type StrMonthlySourceAuthority = (typeof STR_MONTHLY_SOURCE_AUTHORITIES)[number]

export const STR_COMPONENT_RECONCILIATION_STATUSES = [
  'complete',
  'partial',
  'certified_total_only',
] as const
export type StrComponentReconciliationStatus =
  (typeof STR_COMPONENT_RECONCILIATION_STATUSES)[number]

export const STR_MONTHLY_CURRENCY = 'EUR' as const

export const STR_COUNT_UNAVAILABLE_LABEL = 'לא זמין'

/** This layer explains an STR credit. It does not post that credit again. */
export const STR_MONTHLY_SETTLEMENT_ROLE = 'explanatory_str_credit' as const
export const STR_MONTHLY_ADDS_TO_CERTIFIED_CLOSING = false as const

export const STR_MONTHLY_LINE_FIELDS = [
  'month_start',
  'reservation_count',
  'nights',
  'owner_net',
  'source_authority',
  'evidence_ref',
  'evidence_note',
  'line_order',
  'metadata',
  'component_reconciliation_status',
  'gross_accommodation',
  'platform_fee',
  'cleaning_amount',
  'tax_amount',
  'management_fee',
  'other_adjustments',
] as const

export interface StrMonthlyComponentAmounts {
  readonly gross_accommodation?: number
  readonly platform_fee?: number
  readonly cleaning_amount?: number
  readonly tax_amount?: number
  readonly management_fee?: number
  readonly other_adjustments?: number
}

export interface StrMonthlySettlementLineInput {
  readonly line_order: number
  readonly month_start: string
  readonly reservation_count?: number | null
  readonly nights?: number | null
  readonly owner_net: number
  readonly source_authority: StrMonthlySourceAuthority
  readonly evidence_ref: string
  readonly evidence_note: string
  readonly component_reconciliation_status: StrComponentReconciliationStatus
  readonly metadata?: Record<string, unknown>
  readonly gross_accommodation?: number | null
  readonly platform_fee?: number | null
  readonly cleaning_amount?: number | null
  readonly tax_amount?: number | null
  readonly management_fee?: number | null
  readonly other_adjustments?: number | null
}

export interface ApplyStrMonthlySettlementCertificationInput {
  readonly entityId: string
  readonly propertyId: string
  readonly periodFrom: string
  readonly periodTo: string
  readonly version: number
  readonly supersedesId: string | null
  readonly totalOwnerNet: number
  readonly reason: string
  readonly evidenceRef: string
  readonly idempotencyKey: string
  readonly lines: readonly StrMonthlySettlementLineInput[]
}

export interface StrMonthlySettlementRpcResult {
  readonly id: string
  readonly status: StrMonthlySettlementStatus
  readonly replay: boolean
  readonly inserted_count: number
  readonly inserted?: boolean
  readonly actor?: string
}

export const STR_MONTHLY_SETTLEMENT_RPC = {
  apply: 'apply_str_monthly_settlement_certification',
  void: 'void_str_monthly_settlement_certification',
  read: 'read_certified_str_monthly_settlement',
} as const
