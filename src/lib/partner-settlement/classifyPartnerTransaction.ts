/**
 * @module partner-settlement/classifyPartnerTransaction
 * @description Pure classifier for partner-related transactions (11e / 12).
 *
 * STAGE 2 — WIRED. This classifier is invoked at runtime by partnerLedgerEngine
 * (via transactionsReader) to classify each certified partner-related transaction.
 * It reads the canonical ledger read-only and NEVER edits the Transaction Register.
 *
 * Approved rules:
 *  - Routine operating expense personally paid by a partner -> REIMBURSABLE_LOAN
 *    (default) unless an approved capital fact says otherwise.
 *  - Transfer / Partner Loan -> REIMBURSABLE_LOAN.
 *  - Acquisition / renovation / long-term investment funding -> CAPITAL only when
 *    an approved capital/ownership fact is supplied; otherwise UNRESOLVED.
 *  - Loan vs capital unprovable -> UNRESOLVED. Never infer capital from category,
 *    property name, or payer identity alone.
 *  - Direct partner<->partner transfer is cash movement; its settlement purpose must
 *    be known before applying it. Unknown purpose -> UNRESOLVED.
 *
 * Stage 1: the canonical register has NO settlement-purpose tag and NO loan/capital
 * flag (see 12h dependency request). So capital and transfer-purpose facts are absent
 * and such rows resolve to UNRESOLVED by design.
 */

export type PartyRole = 'PARTNER' | 'JJ' | 'EXTERNAL'

export interface ClassifierTxn {
  readonly category: string
  readonly subcategory: string | null
  /** canonical payer role + name (resolved upstream by identityResolver) */
  readonly payerRole: PartyRole
  readonly payerName: string | null
  readonly payeeRole: PartyRole
  readonly payeeName: string | null
  /** true when an approved capital/ownership fact backs a capital classification */
  readonly hasApprovedCapitalFact?: boolean
  /** known settlement purpose for a direct partner<->partner transfer, if any */
  readonly settlementPurpose?: TransferPurpose
}

export type TransferPurpose =
  | 'property_expense'
  | 'reimbursable_loan'
  | 'capital_contribution'
  | 'profit_distribution'
  | 'general_equalization'
  | 'owner_payment'
  | 'UNKNOWN'

export type PartnerFundingClass = 'REIMBURSABLE_LOAN' | 'CAPITAL' | 'UNRESOLVED'

export type TransactionRole =
  | 'PARTNER_FUNDED_EXPENSE'
  | 'DIRECT_PARTNER_TRANSFER'
  | 'JJ_TO_PARTNER' // reimbursement / withdrawal / distribution
  | 'PARTNER_TO_JJ' // cash contribution
  | 'INCOME_COLLECTED_BY_PARTNER'
  | 'EXTERNAL_OR_OTHER'

const LONG_TERM_INVESTMENT_CATEGORIES = new Set(['Purchase', 'Renovation'])
const INCOME_SUBCATS = new Set([
  'Platform Income', 'Tenant Payment', 'Client Payment', 'JJ Income', 'Deposit',
])

/** Determine the structural role of a transaction for the partner report. */
export function classifyTransactionRole(tx: ClassifierTxn): TransactionRole {
  const payerPartner = tx.payerRole === 'PARTNER'
  const payeePartner = tx.payeeRole === 'PARTNER'

  if (payerPartner && payeePartner) return 'DIRECT_PARTNER_TRANSFER'

  if (payerPartner && tx.payeeRole === 'JJ') return 'PARTNER_TO_JJ'
  if (tx.payerRole === 'JJ' && payeePartner) return 'JJ_TO_PARTNER'

  // partner receives money from a non-partner, non-JJ source -> personal collection
  if (payeePartner && (tx.payerRole === 'EXTERNAL') && isIncomeSubcat(tx.subcategory)) {
    return 'INCOME_COLLECTED_BY_PARTNER'
  }

  // partner pays a vendor/company for a valid expense
  if (payerPartner && (tx.payeeRole === 'EXTERNAL' || tx.payeeRole === 'JJ')) {
    return 'PARTNER_FUNDED_EXPENSE'
  }

  return 'EXTERNAL_OR_OTHER'
}

function isIncomeSubcat(sub: string | null): boolean {
  return sub !== null && INCOME_SUBCATS.has(sub)
}

/**
 * Classify a partner-funded expense as reimbursable loan vs capital vs unresolved.
 * Capital is asserted ONLY with an explicit approved capital fact (never inferred).
 */
export function classifyPartnerFunding(tx: ClassifierTxn): PartnerFundingClass {
  if (tx.category === 'Transfer' && tx.subcategory === 'Partner Loan') {
    return 'REIMBURSABLE_LOAN'
  }
  if (LONG_TERM_INVESTMENT_CATEGORIES.has(tx.category)) {
    // long-term investment: capital only with an approved capital fact, else unresolved
    return tx.hasApprovedCapitalFact ? 'CAPITAL' : 'UNRESOLVED'
  }
  // routine operating expense personally paid -> reimbursable loan by default
  return 'REIMBURSABLE_LOAN'
}

/** Resolve a direct partner<->partner transfer's purpose; unknown -> UNRESOLVED. */
export function classifyTransferPurpose(tx: ClassifierTxn): TransferPurpose {
  return tx.settlementPurpose && tx.settlementPurpose !== 'UNKNOWN'
    ? tx.settlementPurpose
    : 'UNKNOWN'
}
