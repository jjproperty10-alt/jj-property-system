/**
 * Client settlement overlay types.
 * Settlement-only. Never cash ledger, never JJ P&L.
 */

export const CLIENT_SETTLEMENT_EVENT_TYPES = [
  'noncash_settlement_credit',
  'exclude_transaction_from_settlement',
  'include_transaction_in_settlement',
] as const

export type ClientSettlementEventType = (typeof CLIENT_SETTLEMENT_EVENT_TYPES)[number]

export const CLIENT_SETTLEMENT_STATUSES = ['open', 'approved', 'applied', 'rejected', 'void'] as const
export type ClientSettlementStatus = (typeof CLIENT_SETTLEMENT_STATUSES)[number]

export const CLIENT_SETTLEMENT_STAFF_ROLES = ['ceo', 'finance_admin'] as const
export type ClientSettlementStaffRole = (typeof CLIENT_SETTLEMENT_STAFF_ROLES)[number]

export interface ClientSettlementEvent {
  readonly id: string
  readonly entityId: string
  readonly counterpartyEntityId: string | null
  readonly effectiveDate: string
  readonly eventType: ClientSettlementEventType
  readonly settlementAmount: number
  readonly sourceTransactionId: string | null
  readonly sourceTransactionDate: string | null
  readonly reason: string
  readonly evidenceRef: string
  readonly createdBy: string
  readonly idempotencyKey: string
  readonly status: ClientSettlementStatus
  readonly createdAt: string
  readonly appliedAt: string | null
  readonly appliedBy: string | null
}

export interface ClientFifoCredit {
  readonly eventId: string
  readonly eventType: Extract<
    ClientSettlementEventType,
    'noncash_settlement_credit' | 'include_transaction_in_settlement'
  >
  readonly settlementAmount: number
  readonly effectiveDate: string
  readonly sourceTransactionId: string | null
  readonly sourceTransactionDate: string | null
  readonly createdAt: string
}

export interface OpenClientSettlementInput {
  readonly entityId: string
  readonly counterpartyEntityId: string | null
  readonly effectiveDate: string
  readonly eventType: ClientSettlementEventType
  readonly settlementAmount: number
  readonly sourceTransactionId: string | null
  readonly reason: string
  readonly evidenceRef: string
  readonly idempotencyKey: string
}

export interface ClientSettlementRpcResult {
  readonly id: string
  readonly status: ClientSettlementStatus
  readonly replay: boolean
  readonly inserted_count: number
  readonly inserted?: boolean
  readonly actor?: string
}

export const CLIENT_SETTLEMENT_RPC = {
  open: 'open_client_settlement_event',
  approve: 'approve_client_settlement_event',
  apply: 'apply_client_settlement_event',
  void: 'void_client_settlement_event',
} as const
