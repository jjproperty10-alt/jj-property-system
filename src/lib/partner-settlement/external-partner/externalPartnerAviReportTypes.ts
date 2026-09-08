/**
 * @module partner-settlement/external-partner/externalPartnerAviReportTypes
 * @description Avi-visible DTO for the JJ staff External Partner report.
 *
 * This is the object the UI may receive. It must not carry JJ’s historical
 * purchase-contract price, a separate premium, recipient identity, or
 * partner-visible payer/payee/notes. Engine internals stay in Commit 1/2A/2B
 * modules and are not copied here.
 */

import type {
  AviAirbnbSection,
  AviFinalSummary,
  AviHostawayIncomeSection,
  AviMonthlySection,
  AviPurchaseExpensesSection,
  AviRenovationSection,
} from './aviReportSections'

export type AviReportStatus = 'certified' | 'failed'

export type AviVisibleExpenseLayer =
  | 'renovation'
  | 'airbnb'
  | 'management'
  | 'deal_expense'

export interface AviReportPartnerSummary {
  readonly partner: string
  readonly ownershipPct: number
  readonly isJjPrincipal: boolean
  readonly status: 'CERTIFIED' | 'PROVISIONAL'
  readonly paidEur: number | null
  readonly creditsEur: number | null
  readonly obligationEur: number | null
  readonly netEur: number | null
  /** Only populated for certified Avi. For provisional, always null. */
  readonly direction: 'to_refund' | 'to_pay' | 'settled' | null
  /** Semantic presentation for the report. Null when not certified. */
  readonly semanticNet: string | null
}

export interface AviReportAcquisitionPresentation {
  readonly agreedTransactionValueEur: number
  readonly aviOwnershipPct: 50
  readonly aviObligationEur: number
  /** Certified remaining on the acquisition obligation. Not computed in the UI. */
  readonly remainingEur: number
  readonly presentationLine: string
}

export interface AviReportLayerBreakdown {
  readonly key: 'acquisition' | 'renovation' | 'airbnb' | 'management' | 'deal_expense'
  readonly label: string
  readonly totalChargeEur: number | null
  readonly aviShareEur: number | null
  /** Funding or credit applied on this layer. Null when none / not shown. */
  readonly aviFundingEur: number | null
  /**
   * Semantic layer result, e.g. "Avi owes €11,107.07".
   * Null for acquisition (covered by certified paid, not added again).
   */
  readonly semanticNet: string | null
}

export interface AviReportPartnerPayment {
  readonly id: string
  readonly date: string
  readonly amountEur: number | null
  readonly label: 'Partner funding'
  readonly payer: 'Avi'
}

export interface AviReportPartnerExpense {
  readonly id: string
  readonly date: string
  readonly amountEur: number | null
  readonly aviSharePct: 50
  readonly aviShareEur: number | null
  readonly category: string | null
  readonly subcategory: string | null
  readonly layer: AviVisibleExpenseLayer
}

export interface AviReportSnapshotMeta {
  readonly propertyName: 'Villa Mazotos'
  readonly cutoffDate: string
  readonly approvedRowCount: number
  readonly version: string
  readonly sha256: string
}

export interface AviReportControlStatus {
  readonly reconciliationPassed: boolean
  readonly settlementComputed: boolean
  readonly attributionOk: boolean
  readonly failures: readonly string[]
}

/**
 * Partner-visible expense totals already certified on the layer DTO.
 * The print/UI layer must display these values — it must not recompute 50%.
 */
export interface AviReportVisibleExpenseTotals {
  readonly rowCount: number
  readonly totalChargeEur: number
  readonly aviShareEur: number
}

/**
 * A certified layer total with no partner-visible detail rows is incomplete.
 * The UI must not invent rows or render an empty certified department.
 */
export interface AviReportExpenseCompleteness {
  readonly complete: boolean
  readonly departmentsMissingDetailRows: readonly AviVisibleExpenseLayer[]
}

export interface AviReportHostawayStayCredit {
  readonly reservationId: string
  readonly checkIn: string
  readonly channel: string
  readonly guestName: string
  readonly printedNtoEur: number
  readonly aviShareEur: number
  readonly source: string
}

/**
 * Airbnb income credits Avi may see. Private booking and Hostaway rental are
 * separate groups. Printed NTO only — no tax component lines.
 */
export interface AviReportAirbnbCredits {
  readonly privateBookingTotalEur: number
  readonly privateBookingAviEur: number
  readonly hostawayPrintedNtoTotalEur: number
  readonly hostawayAviEur: number
  readonly otherHostawayPrintedNtoEur: number
  readonly otherHostawayAviEur: number
  readonly totalAviEur: number
  /** Completed stays behind the payout. Requests that never became stays are excluded. */
  readonly completedStayCount: number
  readonly completedNights: number
  /** Printed statement covering 2025-08-04–2026-09-08. */
  readonly statementP1NtoEur: number
  /** Stays only in the 2025-07-01–2026-08-05 statement, added without double count. */
  readonly statementP2TopUpNtoEur: number
  readonly certifiedDirectStay: AviReportHostawayStayCredit
}

export type ExternalPartnerAviReport =
  | {
      readonly status: 'certified'
      readonly property: 'Villa Mazotos'
      readonly snapshot: AviReportSnapshotMeta
      readonly controlStatus: AviReportControlStatus
      readonly partners: readonly AviReportPartnerSummary[]
      readonly acquisition: AviReportAcquisitionPresentation
      readonly layers: readonly AviReportLayerBreakdown[]
      readonly visibleExpenseTotals: AviReportVisibleExpenseTotals
      readonly expenseCompleteness: AviReportExpenseCompleteness
      readonly partnerPayments: readonly AviReportPartnerPayment[]
      readonly partnerExpenses: readonly AviReportPartnerExpense[]
      readonly airbnbCredits: AviReportAirbnbCredits
      readonly purchaseExpenses: AviPurchaseExpensesSection
      readonly renovation: AviRenovationSection
      readonly airbnb: AviAirbnbSection
      readonly hostawayIncome: AviHostawayIncomeSection
      readonly monthly: AviMonthlySection
      readonly finalSummary: AviFinalSummary
    }
  | {
      readonly status: 'failed'
      readonly property: 'Villa Mazotos'
      readonly controlStatus: AviReportControlStatus
      readonly failures: readonly string[]
    }
