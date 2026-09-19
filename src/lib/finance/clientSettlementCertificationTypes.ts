/**
 * Certified client opening-obligation overlay types.
 * Settlement overlay only. Never cash ledger, never JJ P&L.
 * No production client IDs or certified amounts live here.
 */

export const CLIENT_SETTLEMENT_CERTIFICATION_TYPE = 'opening_property_obligations' as const
export type ClientSettlementCertificationType = typeof CLIENT_SETTLEMENT_CERTIFICATION_TYPE

export const CLIENT_SETTLEMENT_CERTIFICATION_STATUSES = [
  'draft',
  'approved',
  'applied',
  'void',
] as const
export type ClientSettlementCertificationStatus =
  (typeof CLIENT_SETTLEMENT_CERTIFICATION_STATUSES)[number]

export const CLIENT_SETTLEMENT_CERTIFICATION_STAFF_ROLES = ['ceo', 'finance_admin'] as const
export type ClientSettlementCertificationStaffRole =
  (typeof CLIENT_SETTLEMENT_CERTIFICATION_STAFF_ROLES)[number]

export const CLIENT_SETTLEMENT_CERTIFICATION_CURRENCY = 'EUR' as const

export interface ClientSettlementCertificationLineInput {
  readonly line_order: number
  readonly property_key: string
  readonly property_name: string
  readonly component_code: string
  readonly amount_due_to_jj: number
  readonly reason: string
  readonly evidence_ref: string
  readonly metadata?: Record<string, unknown>
}

export interface ApplyClientSettlementOpeningCertificationInput {
  readonly entityId: string
  readonly asOf: string
  readonly reason: string
  readonly evidenceRef: string
  readonly idempotencyKey: string
  readonly version: number
  readonly supersedesId: string | null
  readonly totalDueToJj: number
  readonly lines: readonly ClientSettlementCertificationLineInput[]
}

export interface ClientSettlementCertificationRpcResult {
  readonly id: string
  readonly status: ClientSettlementCertificationStatus
  readonly replay: boolean
  readonly inserted_count: number
  readonly inserted?: boolean
  readonly actor?: string
}

export const CLIENT_SETTLEMENT_CERTIFICATION_RPC = {
  apply: 'apply_client_settlement_opening_certification',
  void: 'void_client_settlement_opening_certification',
  read: 'read_certified_client_settlement',
  staffRead: 'read_client_settlement_balance',
} as const
