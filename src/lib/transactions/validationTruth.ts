/**
 * Validation Truth helpers — display/action classification only.
 * Does not mutate transactions or Client Report calculations.
 */

/** Matches the SQL zero_amount exclusion for billing-only rows. */
export function isBillingOnlyZero(
  amountEur: number | null | undefined,
  clientCharge: number | null | undefined,
): boolean {
  return Number(amountEur) === 0 && Number(clientCharge ?? 0) > 0
}

/**
 * Mirrors the corrected view predicate for unit tests:
 * zero_amount iff amount < 0 OR (amount = 0 AND coalesce(client_charge,0) = 0)
 */
export function isZeroAmountIssue(
  amountEur: number | null | undefined,
  clientCharge: number | null | undefined,
): boolean {
  const amount = Number(amountEur)
  if (Number.isNaN(amount)) return false
  if (amount < 0) return true
  if (amount === 0 && Number(clientCharge ?? 0) === 0) return true
  return false
}

export type ValidationActionKind =
  | 'correct'
  | 'unsupported_property'
  | 'unsupported_party'
  | 'review_only'

export function validationActionKind(issueType: string): ValidationActionKind {
  switch (issueType) {
    case 'missing_property':
      return 'unsupported_property'
    case 'missing_payer':
    case 'missing_payee':
      return 'unsupported_party'
    case 'duplicate':
      return 'review_only'
    case 'zero_amount':
    case 'missing_subcategory':
    case 'large_amount':
      return 'correct'
    default:
      return 'review_only'
  }
}

/** True only when the UI may deep-link into the M1 Review/Correct dialog. */
export function validationActionAllowsCorrect(kind: ValidationActionKind): boolean {
  return kind === 'correct'
}

export function computeValidationQuality(
  totalTransactions: number,
  issueTransactionIds: readonly string[],
): {
  issueRowCount: number
  distinctDirtyCount: number
  cleanCount: number
  scorePercent: number
} {
  const issueRowCount = issueTransactionIds.length
  const distinctDirtyCount = new Set(issueTransactionIds.filter(Boolean)).size
  const cleanCount = Math.max(0, totalTransactions - distinctDirtyCount)
  const scorePercent =
    totalTransactions > 0
      ? Math.round((1 - distinctDirtyCount / totalTransactions) * 100)
      : 100
  return { issueRowCount, distinctDirtyCount, cleanCount, scorePercent }
}

export type ValidationTxEnrichment = {
  readonly property_id: string | null
  readonly property_name: string | null
  readonly client_charge: number | null
  readonly review_status: string | null
  readonly is_deleted: boolean | null
  readonly hasActiveExclusion: boolean
}
