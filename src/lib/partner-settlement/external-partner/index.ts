/**
 * @module partner-settlement/external-partner
 * @description Dedicated external-partner settlement formulas.
 * Import from this path only — do not re-export via a route-facing barrel.
 */

export { composeExternalPartnerBilledActivity, deriveExternalPartnerBillableCharge } from './billedActivity'
export type {
  ExternalPartnerActivityLine,
  ExternalPartnerBillableChargeResult,
  ExternalPartnerBillableRow,
  ExternalPartnerBilledActivityInput,
  ExternalPartnerBilledActivityResult,
  ExternalPartnerBilledKind,
} from './billedActivity'

export { composeExternalPartnerDealExpense } from './dealExpense'
export type {
  ExternalPartnerDealExpenseInput,
  ExternalPartnerDealExpenseLine,
  ExternalPartnerDealExpenseResult,
} from './dealExpense'

export { composeExternalPartnerPremiumOffset } from './premiumOffset'
export type {
  ExternalPartnerPremiumOffsetInput,
  ExternalPartnerPremiumOffsetResult,
} from './premiumOffset'

export {
  composeExternalPartnerSettlement,
  composeExternalPartnerSettlementFromAttributedFunding,
  composeExternalPartnerLayerComponents,
} from './compose'
export type { ExternalPartnerLayerBalances } from './compose'

export { reconcileExternalPartnerControls } from './controlReconciliation'
export type {
  ExternalPartnerControlInput,
  ExternalPartnerControlResult,
  ExternalPartnerControlTxn,
} from './controlReconciliation'

export { roundEur } from './roundEur'

export { EXTERNAL_PARTNER_SETTLEMENT_BRAND } from './types'
export type {
  ExternalPartnerChargeLayer,
  ExternalPartnerCredit,
  ExternalPartnerEvidence,
  ExternalPartnerObligation,
  ExternalPartnerOwner,
  ExternalPartnerSettlement,
  ExternalPartnerSettlementInput,
  ExternalPartnerShare,
  ProvenanceStatus,
} from './types'

export {
  AVI_CONTROL_CONFIRMED_DUPLICATE_IDS,
  EXTERNAL_PARTNER_PROPERTY_NAME,
  asFiniteEur,
  isAviControlConfirmedDuplicateId,
  isAviPayerField,
  isExactExternalPartnerProperty,
  isInExternalPartnerReadScope,
  readExternalPartnerTransactionViews,
  readExternalPartnerTransactionViewsFromAttribution,
  resolvePayerIdentity,
} from './externalPartnerReader'

export {
  AVI_CLIENT_TO_AVI_ATTRIBUTION,
  YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
  applyAviFundingAttribution,
  attributedAviPaymentIdSet,
  findAviClientToAviRule,
  isAviAttributedFundingId,
} from './externalPartnerAttribution'
export type {
  AviClientToAviAttributionRule,
  AviFundingAttributionSource,
  ExternalPartnerAttributedAmountControl,
  ExternalPartnerAttributedFundingLine,
  ExternalPartnerAviPaidAttribution,
  ExternalPartnerCorrectionLineageEntry,
} from './externalPartnerAttribution'

export { composeExternalPartnerAviReport } from './externalPartnerAviService'
export type { ComposeAviReportInput } from './externalPartnerAviService'
export type {
  AviReportAcquisitionPresentation,
  AviReportControlStatus,
  AviReportLayerBreakdown,
  AviReportPartnerExpense,
  AviReportPartnerPayment,
  AviReportPartnerSummary,
  AviReportSnapshotMeta,
  AviReportStatus,
  AviReportVisibleExpenseTotals,
  AviReportExpenseCompleteness,
  AviReportAirbnbCredits,
  AviReportHostawayStayCredit,
  AviVisibleExpenseLayer,
  ExternalPartnerAviReport,
} from './externalPartnerAviReportTypes'
export {
  classifyAviVisibleExpenseLayer,
  formatAviEur,
  formatAviOwes,
  projectAviExpenseCompleteness,
  projectAviVisibleAcquisition,
  projectAviVisibleExpenseTotals,
  projectAviVisibleExpenses,
} from './externalPartnerAviVisible'

export {
  aviCertifiedIdentityFailures,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_PAID_EUR,
} from './aviCertifiedIdentity'

export { composeAviAirbnbCredits } from './hostawayPrintedNto'
export {
  HOSTAWAY_PRINTED_DIRECT_STAY,
  HOSTAWAY_PRINTED_DIRECT_STAY_ID,
  HOSTAWAY_PRINTED_NTO_TOTAL_EUR,
  HOSTAWAY_PRINTED_AVI_SHARE_EUR,
  PRIVATE_BOOKING_AVI_CREDIT_EUR,
} from './hostawayPrintedNto'

export {
  applyAviApprovedExpenseOverlay,
  AVI_APPROVED_BUSINESS_OVERLAY,
  AVI_GARDENER_ID,
  AVI_POOL_EQUIPMENT_ID,
  AVI_MONTHLY_POOL_AVI_SHARE_EUR,
  AVI_MONTHLY_POOL_CHARGE_EUR,
  AVI_PENDING_POOL_MONTHS,
  isApprovedMonthlyAirbnbPoolInvoice,
  pendingPoolInvoiceId,
} from './aviExpenseOverlay'

export { bindLiveRowsToApprovedSnapshot, VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from './externalPartnerSnapshot'

export {
  AVI_SHARE_PATH_PREFIX,
  AVI_SHARE_TTL_SECONDS,
  signAviShareToken,
  verifyAviShareToken,
} from './aviShareToken'

export type {
  ExternalPartnerApprovedSnapshot,
  ExternalPartnerControlMaterial,
  ExternalPartnerInternalRow,
  ExternalPartnerReadViews,
  ExternalPartnerSnapshotBinding,
  ExternalPartnerTransactionsFetchResult,
  ExternalPartnerVisibleExpense,
  ExternalPartnerVisiblePayment,
  ExternalPartnerVisibleRow,
  RawExternalPartnerTransaction,
} from './externalPartnerReadTypes'
