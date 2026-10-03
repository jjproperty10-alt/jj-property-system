/**
 * Presentation mapping for public.v_contact_settlement_summary.net_jj_settlement.
 *
 * The view is unchanged: positive means the owner owes JJ, negative means JJ
 * owes the owner. The approved display rule is the reverse: positive means JJ
 * owes the owner. This function is the only place that turns the view number
 * into that display amount and the Hebrew direction sentence.
 */

export type OwnerGrammaticalGender = 'masculine' | 'feminine' | 'unspecified'

export interface ContactSettlementDisplay {
  /** The view number, unchanged. */
  readonly viewNet: number
  /** Approved display sign. Positive means JJ owes the owner. */
  readonly displayAmount: number
  readonly directionText: string
}

function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function mapContactSettlementToDisplay(
  viewNet: number,
  ownerName: string,
  ownerGender: OwnerGrammaticalGender = 'unspecified',
): ContactSettlementDisplay {
  const view = roundEur(viewNet)
  const displayAmount = roundEur(-view)
  if (Math.abs(view) < 0.005) {
    return { viewNet: 0, displayAmount: 0, directionText: 'היתרה אפס' }
  }
  if (view < 0) {
    return { viewNet: view, displayAmount, directionText: `JJ חייבת ל-${ownerName}` }
  }
  const verb = ownerGender === 'masculine'
    ? 'חייב'
    : ownerGender === 'feminine'
      ? 'חייבת'
      : 'חייב/חייבת'
  return { viewNet: view, displayAmount, directionText: `${ownerName} ${verb} ל-JJ` }
}
