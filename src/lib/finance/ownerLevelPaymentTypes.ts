/**
 * Owner-level (unallocated) payments — types + access matrix.
 *
 * Counted in owner settlement only. Never property P&L, STR, or LTR.
 * Local implementation; C1/C3 are fixtures, not Production writes.
 */

export const TAMIR_OWNER_ENTITY_ID = '0f352012-1403-4e3b-982a-7c019ee89f1b'
export const TAMIR_CANONICAL_NAME = 'Tamir'
export const C1_IDEMPOTENCY_KEY = 'tamir_owner_pmt_yaakov_2026-08-24_10000'
export const C1_AMOUNT_EUR = 10_000
export const CERTIFIED_DUE_TO_TAMIR_EUR = 3248.75
export const C3_ROW_COUNT = 29
export const C3_TOTAL_EUR = 1160
export const C3_UNIT_CLIENT_CHARGE_EUR = 40

export const TAMIR_PROPERTIES = [
  'Tamir Dekelia',
  'Tamir Radisson',
  'Tamir Kiti',
  'Tamir Kiti 1',
  'Tamir Kiti 2',
] as const

export type TamirPropertyName = (typeof TAMIR_PROPERTIES)[number]

export const OWNER_LEVEL_LINK_ROLE = 'owner_level_payment' as const
export type OwnerLevelLinkRole = typeof OWNER_LEVEL_LINK_ROLE

export type OwnerLinkReviewStatus = 'approved' | 'needs_review' | 'ignored'

export interface OwnerLevelPaymentCandidate {
  readonly transactionId: string
  readonly ownerEntityId: string
  readonly ownerCanonicalName: string
  readonly date: string
  readonly payer: string
  readonly payee: string
  readonly amountEur: number
  readonly description: string | null
  readonly idempotencyKey: string
  readonly reviewStatus: OwnerLinkReviewStatus
  readonly linkRole: string
  readonly isDeletedLink: boolean
  readonly isDeletedTransaction: boolean
  readonly transactionReviewStatus: string | null
  readonly propertyId: string | null
  readonly propertyName: string | null
  readonly category: string
  readonly subcategory: string
  /** OWNER_ID on the transaction (k_note), when known */
  readonly transactionLinkedOwnerEntityId?: string | null
}

export interface OwnerLevelPaymentRow {
  readonly transactionId: string
  readonly ownerEntityId: string
  readonly ownerCanonicalName: string
  readonly date: string
  readonly payer: string
  readonly payee: string
  readonly amountEur: number
  readonly description: string | null
  readonly idempotencyKey: string
  readonly reviewStatus: OwnerLinkReviewStatus
}

export interface PropertyDueSlice {
  readonly propertyName: string
  readonly dueToOwnerEur: number
}

export interface OwnerLevelCompositionInput {
  readonly ownerEntityId: string
  readonly propertyLevelDueToOwnerEur: number
  readonly propertyBalances: readonly PropertyDueSlice[]
  readonly candidates: readonly OwnerLevelPaymentCandidate[]
  readonly jacobClearingEur: number
  readonly periodStart?: string | null
  readonly periodEnd?: string | null
}

export interface OwnerLevelNeedsReviewFlag {
  readonly transactionId: string
  readonly reason: 'property_and_owner_link' | 'owner_mismatch' | 'non_positive_amount'
}

export interface OwnerLevelCompositionResult {
  readonly ownerEntityId: string
  readonly ownerCanonicalName: string | null
  readonly countable: readonly OwnerLevelPaymentRow[]
  readonly countableTotalEur: number
  readonly countedTransactionIds: readonly string[]
  readonly dueToOwnerEur: number
  readonly dueToOwnerDeltaEur: number
  readonly jacobClearingEur: number
  readonly jacobClearingDeltaEur: number
  readonly jjPnLDeltaEur: number
  readonly propertyDeltas: readonly PropertyDueSlice[]
  readonly needsReview: readonly OwnerLevelNeedsReviewFlag[]
  readonly excludedFromStr: true
  readonly excludedFromLtr: true
  readonly excludedFromPropertyPl: true
}

export interface RoleAccess {
  readonly select: boolean
  readonly insert: boolean
  readonly update: boolean
  readonly delete: boolean
  readonly execute_write_rpc: boolean
  readonly execute_read_rpc: boolean
}

/**
 * Access matrix after RPC reachability fix.
 *
 * Table INSERT/UPDATE: nobody except table owner (postgres). All writes via RPC.
 * Views: SELECT granted to service_role only (security_invoker + RLS deny-all).
 * RPCs: EXECUTE granted to authenticated + service_role; anon revoked.
 * Body: auth.role()='service_role' OR require_jj_staff(['ceo','finance_admin']).
 */
export const OWNER_TRANSACTION_LINKS_ACCESS = {
  anon: {
    select: false,
    insert: false,
    update: false,
    delete: false,
    execute_write_rpc: false,
    execute_read_rpc: false,
  },
  authenticated: {
    select: false,
    insert: false,
    update: false,
    delete: false,
    execute_write_rpc: true, // GRANT EXECUTE; require_jj_staff still applies
    execute_read_rpc: true,
  },
  service_role: {
    select: true,
    insert: false,
    update: false,
    delete: false,
    execute_write_rpc: true,
    execute_read_rpc: true,
  },
  authorizedReportPath: {
    role: 'service_role',
    readVia: [
      'finance.v_owner_level_payments',
      'finance.get_owner_level_payments',
    ],
  },
} as const satisfies {
  anon: RoleAccess
  authenticated: RoleAccess
  service_role: RoleAccess
  authorizedReportPath: { role: 'service_role'; readVia: readonly string[] }
}

export class DuplicateIdempotencyError extends Error {
  constructor(key: string) {
    super(`Duplicate idempotency_key rejected: ${key}`)
    this.name = 'DuplicateIdempotencyError'
  }
}

export class DuplicateActiveOwnerLinkError extends Error {
  constructor(transactionId: string) {
    super(`Duplicate active owner link rejected for transaction ${transactionId}`)
    this.name = 'DuplicateActiveOwnerLinkError'
  }
}

export class UnauthorizedClientWriteError extends Error {
  constructor(role: string) {
    super(`Unauthorized client write rejected for role ${role}`)
    this.name = 'UnauthorizedClientWriteError'
  }
}
