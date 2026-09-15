/**
 * Compile-time isolation: external-partner settlement is not a Partner B Headline.
 * If ExternalPartnerSettlement grows debtor/creditor/amountEur, this file fails tsc.
 */
import type { Headline } from '@/lib/partner-settlement/partnerReportBFormulas'
import type { ExternalPartnerSettlement } from '@/lib/partner-settlement/external-partner'

type AssignableTo<A, B> = A extends B ? true : false
type ComputedSettlement = Extract<ExternalPartnerSettlement, { status: 'computed' }>

export type ExternalPartnerSettlementIsNotHeadline =
  AssignableTo<ComputedSettlement, Headline> extends true ? never : true

export const externalPartnerSettlementIsNotHeadline: ExternalPartnerSettlementIsNotHeadline = true
