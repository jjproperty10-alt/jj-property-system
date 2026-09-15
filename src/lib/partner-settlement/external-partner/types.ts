/**
 * @module partner-settlement/external-partner/types
 * @description Explicit external-partner settlement types.
 *
 * Partner B already uses “Layer A” for the Yossi/Jacob current account vs JJ.
 * These types are deliberately not named Layer A, and are structurally
 * incompatible with Partner B `Headline` (`debtor` / `creditor` / `amountEur`).
 *
 * This module is not imported by routes. Do not re-export it from a
 * partner-settlement barrel used by screens.
 */

import type { ExternalPartnerAviPaidAttribution } from './externalPartnerAttribution'

export const EXTERNAL_PARTNER_SETTLEMENT_BRAND: unique symbol = Symbol(
  'ExternalPartnerSettlement',
)

export type ProvenanceStatus = 'APPROVED' | 'VERIFIED' | 'DECISION_BACKED'

export interface ExternalPartnerEvidence {
  readonly classificationArtifact: string
  readonly sha256: string
  readonly rowCount: number
  readonly version: string
}

export interface ExternalPartnerOwner {
  readonly partner: string
  readonly ownershipPct: number
  /** Yossi / Jacob => true. External investors => false. */
  readonly isJjPrincipal: boolean
}

export interface ExternalPartnerChargeLayer {
  readonly key: string
  readonly label: string
  readonly total: number | null
  readonly jjProfit?: number | null
  readonly income?: number | null
}

export interface ExternalPartnerObligation {
  readonly totalEur: number
  readonly chargeShares: Readonly<Record<string, number>>
  readonly premiumEur: number
}

export interface ExternalPartnerCredit {
  readonly totalEur: number
  readonly incomeShareEur: number
  readonly jjProfitShareEur: number
}

export interface ExternalPartnerShare {
  readonly partner: string
  readonly isJjPrincipal: boolean
  readonly ownershipPct: number
  readonly obligation: ExternalPartnerObligation
  readonly credits: ExternalPartnerCredit
  readonly offsetsEur: number
  readonly paidEur: number
  readonly netEur: number
  readonly direction: 'to_refund' | 'to_pay' | 'settled'
}

export type ExternalPartnerSettlement =
  | {
      readonly [EXTERNAL_PARTNER_SETTLEMENT_BRAND]: 'ExternalPartnerSettlement'
      readonly status: 'computed'
      readonly property: string
      readonly cutoffDate: string
      readonly evidence: ExternalPartnerEvidence
      readonly shares: readonly ExternalPartnerShare[]
      readonly premiumTransfers: readonly {
        readonly from: string
        readonly to: string
        readonly amountEur: number
      }[]
    }
  | {
      readonly [EXTERNAL_PARTNER_SETTLEMENT_BRAND]: 'ExternalPartnerSettlement'
      readonly status: 'failed'
      readonly failureReasons: readonly string[]
    }

export interface ExternalPartnerSettlementInput {
  readonly property: string
  readonly cutoffDate: string
  readonly owners: readonly ExternalPartnerOwner[]
  readonly charges: readonly ExternalPartnerChargeLayer[]
  readonly premium?: {
    readonly totalEur: number
    readonly paidBy: string
    readonly receivedBy?: Readonly<Record<string, number>>
  }
  /**
   * Verified funding per partner. A present number (including 0) is verified.
   * `null` / absent = unverified — never treated as €0.
   */
  readonly paid: Readonly<Record<string, number | null | undefined>>
  /**
   * Optional Commit 2B overlay. When present, compose fails closed unless
   * attribution succeeded and `paid.Avi` matches `paidEurAvi`. Omit this
   * field for callers that already hold a verified paid amount (Commit 1).
   */
  readonly fundingAttribution?: ExternalPartnerAviPaidAttribution
  readonly evidence: ExternalPartnerEvidence | null | undefined
  /**
   * Authoritative control amounts that every charge/premium key must match.
   * Empty or missing fails closed.
   */
  readonly requiredControls: Readonly<Record<string, number>>
  /** Partners to settle. Missing paid for any of these fails closed. */
  readonly settlePartners: readonly string[]
}
