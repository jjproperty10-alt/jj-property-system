/**
 * Certified client settlement DTO — overlay + cash allocation remaining.
 * Source of truth: finance.read_certified_client_settlement(entity_id, as_of).
 * Sign: + closingDueToJj = client owes JJ; − = JJ owes client; 0 = settled.
 * remainingR = −closingDueToJj (R > 0 JJ owes client). remainingS = −remainingR.
 * No production client IDs or certified amounts live here.
 */

export const CERTIFIED_SETTLEMENT_READER = 'read_certified_client_settlement' as const

export type CertifiedClosingDirection = 'client_owes_jj' | 'jj_owes_client' | 'settled'

export type CertifiedUnavailableReason =
  | 'no_applied_certification'
  | 'settlement_layer_unavailable'
  | 'reader_failed'
  | 'missing_entity'
  | 'ambiguous_entity'
  | 'missing_as_of'
  | 'malformed_payload'

export interface CertifiedPropertyObligationLine {
  readonly lineOrder: number
  readonly propertyKey: string
  readonly propertyName: string
  readonly componentCode: string
  readonly amountDueToJj: number
  readonly reason: string
  readonly evidenceRef: string
}

export interface CertifiedFifoCreditLine {
  readonly eventId: string
  readonly eventType: 'noncash_settlement_credit' | 'include_transaction_in_settlement'
  readonly settlementAmount: number
  readonly effectiveDate: string
  readonly sourceTransactionId: string | null
  /** false for noncash_settlement_credit; true for include_transaction_in_settlement */
  readonly cash: boolean
}

export interface CertifiedExclusionLine {
  readonly eventId: string
  readonly eventType: 'exclude_transaction_from_settlement'
  readonly settlementAmount: number
  readonly effectiveDate: string
  readonly sourceTransactionId: string | null
  readonly reason: string
  readonly evidenceRef: string
  /** Exclusions are informational only and never enter certified arithmetic. */
  readonly arithmeticEffect: 0
}

export interface CertifiedObligationSlice {
  readonly certificationLineId: string
  readonly lineOrder: number
  readonly propertyKey: string
  readonly propertyName: string
  readonly propertyId: string | null
  readonly bindingStatus: 'bound' | 'unbound'
  readonly originalSignedAmount: number
  readonly allocatedSignedAmount: number
  readonly remainingSignedAmount: number
}

export interface CertifiedUnboundLine {
  readonly certificationLineId: string
  readonly propertyKey: string
  readonly lineOrder: number
  readonly originalSignedAmount: number
  readonly remainingSignedAmount: number
  readonly blockedCode: 'unbound_certification_line'
}

export interface CertifiedCashExecutionRef {
  readonly executionId: string
  readonly transactionId: string
  readonly direction: 'JJ_TO_CLIENT' | 'CLIENT_TO_JJ'
  readonly amount: number
  readonly effectiveDate: string
  readonly reversalOf: string | null
}

export interface CertifiedClientSettlementAvailable {
  readonly unavailable: false
  readonly certificationId: string
  readonly entityId: string
  readonly asOf: string
  readonly certificationAsOf: string
  readonly openingDueToJj: number
  readonly propertyLines: readonly CertifiedPropertyObligationLine[]
  readonly fifoCredits: readonly CertifiedFifoCreditLine[]
  readonly exclusions: readonly CertifiedExclusionLine[]
  readonly fifoCreditsTotal: number
  /** Overlay-only closing = opening − FIFO credits. Does not include cash allocations. */
  readonly overlayClosingDueToJj: number
  readonly cashAllocationSignedTotal: number
  readonly remainingR: number
  readonly remainingS: number
  readonly obligationSlices: readonly CertifiedObligationSlice[]
  readonly unboundLines: readonly CertifiedUnboundLine[]
  readonly cashExecutions: readonly CertifiedCashExecutionRef[]
  /** Displayed remaining due_to_jj = overlay closing − cash allocation signed total. */
  readonly closingDueToJj: number
  readonly closingDirection: CertifiedClosingDirection
}

export interface CertifiedClientSettlementUnavailable {
  readonly unavailable: true
  readonly reason: CertifiedUnavailableReason
  readonly entityId: string | null
  readonly asOf: string | null
}

export type CertifiedClientSettlementDto =
  | CertifiedClientSettlementAvailable
  | CertifiedClientSettlementUnavailable
