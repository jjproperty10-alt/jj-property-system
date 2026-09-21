/**
 * Partner current-account signs + personal-funded settlement effects. No I/O.
 * partner_balance > 0: JJ owes the partner.
 * partner_balance < 0: the partner owes JJ.
 * Personal funding does not move JJ cash and is not P&L.
 */
export const PARTNER_CA_POLICY = 'partner-current-account-v1' as const

export type PartnerFundingSource = 'JJ' | 'PARTNER_PERSONAL'
export type PartnerCaEntryType = 'personal_funding' | 'reimbursement' | 'reversal'
export type PartnerFundingEventType =
  | 'partner_funded_client_payment'
  | 'partner_reimbursement'
  | 'reversal'

export interface PartnerCaState {
  readonly partnerBalance: number
  readonly clientR: number
  readonly jjCashDelta: number
  readonly pnlDelta: number
}

export function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function applyPersonalFunding(state: PartnerCaState, amount: number): PartnerCaState {
  if (!(amount > 0)) throw new Error('amount must be positive')
  const applied = roundEur(amount)
  return {
    partnerBalance: roundEur(state.partnerBalance + applied),
    clientR: roundEur(state.clientR - applied),
    jjCashDelta: 0,
    pnlDelta: 0,
  }
}

export function applyReimbursement(state: PartnerCaState, amount: number): PartnerCaState {
  if (!(amount > 0)) throw new Error('amount must be positive')
  const applied = roundEur(amount)
  if (applied > roundEur(state.partnerBalance)) {
    throw new Error('over_reimbursement')
  }
  return {
    partnerBalance: roundEur(state.partnerBalance - applied),
    clientR: state.clientR,
    jjCashDelta: roundEur(-applied),
    pnlDelta: 0,
  }
}

export function reversePersonalFunding(state: PartnerCaState, amount: number): PartnerCaState {
  if (!(amount > 0)) throw new Error('amount must be positive')
  const applied = roundEur(amount)
  return {
    partnerBalance: roundEur(state.partnerBalance - applied),
    clientR: roundEur(state.clientR + applied),
    jjCashDelta: 0,
    pnlDelta: 0,
  }
}

export function reverseReimbursement(state: PartnerCaState, amount: number): PartnerCaState {
  if (!(amount > 0)) throw new Error('amount must be positive')
  const applied = roundEur(amount)
  return {
    partnerBalance: roundEur(state.partnerBalance + applied),
    clientR: state.clientR,
    jjCashDelta: roundEur(applied),
    pnlDelta: 0,
  }
}

export function signedCaAmount(entryType: PartnerCaEntryType, amount: number): number {
  const applied = roundEur(amount)
  if (!(applied > 0)) throw new Error('amount must be positive')
  if (entryType === 'personal_funding') return applied
  return roundEur(-applied)
}

export function partnerFundedCashPosting(partnerCanonicalName: string): {
  readonly category: 'Management'
  readonly subcategory: 'Bank Payment to Owner'
  readonly payer: string
  readonly payee: 'Owner'
} {
  const payer = partnerCanonicalName.trim()
  if (!payer) throw new Error('partner canonical name is required')
  return {
    category: 'Management',
    subcategory: 'Bank Payment to Owner',
    payer,
    payee: 'Owner',
  }
}

export function reimbursementCashPosting(partnerCanonicalName: string): {
  readonly category: 'Transfer'
  readonly subcategory: 'Expense Reimbursement'
  readonly payer: 'JJ'
  readonly payee: string
} {
  const payee = partnerCanonicalName.trim()
  if (!payee) throw new Error('partner canonical name is required')
  return {
    category: 'Transfer',
    subcategory: 'Expense Reimbursement',
    payer: 'JJ',
    payee,
  }
}

export interface PartnerFundedPreviewIdentity {
  readonly policyVersion: typeof PARTNER_CA_POLICY
  readonly clientEntityId: string
  readonly partnerEntityId: string
  readonly fundingSource: 'PARTNER_PERSONAL'
  readonly direction: 'JJ_TO_CLIENT'
  readonly amount: string
  readonly effectiveDate: string
  readonly sources: readonly unknown[]
  readonly allocations: readonly unknown[]
  readonly clientRBefore: string
  readonly clientRAfter: string
  readonly partnerBalanceBefore: string
  readonly partnerBalanceAfter: string
  readonly companyCashEffect: '0.00'
  readonly pnlEffect: '0.00'
  readonly blockedCode: string | null
}

export function partnerFundedPreviewIdentity(
  input: Omit<PartnerFundedPreviewIdentity, 'policyVersion' | 'fundingSource' | 'direction' | 'companyCashEffect' | 'pnlEffect'> & {
    readonly direction?: 'JJ_TO_CLIENT'
  },
): PartnerFundedPreviewIdentity {
  return {
    policyVersion: PARTNER_CA_POLICY,
    fundingSource: 'PARTNER_PERSONAL',
    direction: 'JJ_TO_CLIENT',
    companyCashEffect: '0.00',
    pnlEffect: '0.00',
    ...input,
  }
}

export function closingBalance(opening: number, signedEntries: readonly number[]): number {
  return roundEur(signedEntries.reduce((sum, n) => sum + n, opening))
}
