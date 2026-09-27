/**
 * Generic full client-account model.
 * Property names, amounts and evidence are inputs. This file holds no client.
 */

export type EvidenceStatus = 'proven' | 'owner-certified'

export type AccountEffect = 'charge' | 'credit' | 'reference'
export type RentLineStatus = 'paid' | 'paid_late' | 'partial' | 'open'

export type ClosingDirection = 'client_owes_jj' | 'jj_owes_client' | 'settled'

/**
 * Report scope. A full account covers everything through the cutoff; a period account
 * shows only activity admitted inside [period.start, period.end] and the cutoff is period.end.
 */
export type ReportType = 'full_account' | 'period_account'

export interface ReportPeriod {
  readonly start: string
  readonly end: string
}

export type ReportCurrency = 'EUR'

/** How the report figures were established. Certified is the only admitted status today. */
export type ReportEvidenceStatus = 'certified'

export interface LedgerRow {
  readonly id: string
  readonly date: string
  readonly propertyName: string | null
  readonly category: string | null
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amountEur: number
  readonly clientCharge: number | null
  readonly reviewStatus: string | null
  readonly isDeleted: boolean
}

export interface CertifiedAccountLine {
  readonly lineOrder: number
  readonly propertyKey: string
  readonly propertyName: string
  readonly amountDueToJj: number
  readonly evidenceRef: string
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface CertifiedCreditInput {
  readonly id: string
  readonly sourceTransactionId?: string | null
  readonly eventType: 'noncash_settlement_credit' | 'include_transaction_in_settlement'
  readonly amount: number
  readonly effectiveDate: string
}

export interface StrMonthInput {
  readonly year: number
  readonly month: number
  readonly amount: number
}

export interface CompositionInput {
  readonly asOf: string
  /** Stable client identifier (entity id). Display only through clientDisplayName. */
  readonly clientId?: string | null
  readonly clientDisplayName: string
  readonly reportTitle: string
  readonly reportLanguage?: 'he' | 'en'
  /** Defaults to full_account. A period_account requires `period` and asOf === period.end. */
  readonly reportType?: ReportType
  readonly period?: ReportPeriod
  readonly currency?: ReportCurrency
  readonly openingDueToJj: number
  readonly closingDueToJj: number
  readonly cashAllocationSignedTotal: number
  readonly lines: readonly CertifiedAccountLine[]
  readonly credits: readonly CertifiedCreditInput[]
  readonly rows: readonly LedgerRow[]
  readonly linkedRowsByPropertyKey?: Readonly<Record<string, readonly LedgerRow[]>>
  readonly strMonthsByPropertyKey?: Readonly<Record<string, readonly StrMonthInput[]>>
  readonly certifiedStrMonthlyByPropertyKey?: Readonly<Record<string, CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable>>
  readonly undatedChargeLabelByPropertyKey?: Readonly<Record<string, string>>
  readonly creditLabels?: { readonly noncash?: string; readonly cash?: string }
  readonly ownerRentMonthsByRowId?: Readonly<Record<string, readonly { year: number; month: number }[]>>
  readonly descriptionByRowId?: Readonly<Record<string, string>>
  readonly historicalSourceNamesByPropertyKey?: Readonly<Record<string, readonly string[]>>
  readonly purchaseSupplementsByPropertyKey?: Readonly<Record<string, readonly PurchaseSupplement[]>>
  readonly strLumpDescription?: string
  readonly renovationNoteByPropertyKey?: Readonly<Record<string, string>>
}

export interface PurchaseSupplement {
  readonly amount: number
  readonly monthLabel: string
  readonly description: string
}

export interface DisplayLine {
  readonly propertyName: string
  readonly section: string
  /** Client-safe text produced by the presentation layer (never the raw transaction description). */
  readonly clientText: string
  readonly monthLabel: string
  readonly paymentMonthLabel: string | null
  readonly statusLabel: string | null
  readonly directionText: string
  readonly amount: number
  readonly effect: AccountEffect
  readonly sourceIds: readonly string[]
  readonly traceSourceId: string | null
  readonly evidence: EvidenceStatus
  readonly countedIn: string
  readonly allocationRule?: string | null
}

export interface ComponentSummary {
  readonly kind: 'purchase' | 'renovation'
  readonly agreed: number
  readonly payments: number
  readonly ancillary: number
  readonly balance: number
  readonly receipts: number | null
  readonly state: 'closed' | 'open'
  readonly explanation: string | null
}

export interface BridgeStep {
  readonly label: string
  readonly signedDueToJj: number
  readonly directionText: string
}

export interface StatusLine {
  readonly label: string
  readonly state: 'closed' | 'open'
  readonly amount: number
  readonly direction: ClosingDirection
}

export type AccountUnitKind = 'str' | 'ltr'

export interface AccountUnit {
  readonly kind: AccountUnitKind
  readonly title: string
  readonly lines: readonly DisplayLine[]
  readonly balanceDueToJj: number
  readonly note?: string | null
}

export interface CertifiedStrMonthLine {
  readonly monthStart: string
  readonly monthLabel: string
  readonly reservationCount: number | null
  readonly nights: number | null
  readonly reservationCountLabel: string
  readonly nightsLabel: string
  readonly ownerNet: number
  readonly componentReconciliationStatus: string
}

export interface CertifiedStrMonthlySection {
  readonly unavailable: false
  readonly certificationId: string
  readonly entityId: string
  readonly propertyId: string
  readonly propertyName: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly status: 'applied'
  readonly totalOwnerNet: number
  readonly reconciliationStatus: 'exact'
  readonly months: readonly CertifiedStrMonthLine[]
  readonly arithmeticEffectOnCertifiedClosing: 0
}

export interface CertifiedStrMonthlyUnavailable {
  readonly unavailable: true
  readonly reason: string
  readonly entityId: string | null
  readonly propertyId: string | null
  readonly propertyName: string | null
  readonly periodStart: string | null
  readonly periodEnd: string | null
  readonly arithmeticEffectOnCertifiedClosing: 0
}

export interface PropertyAccount {
  readonly propertyName: string
  readonly propertyKey: string
  readonly lineOrder: number
  readonly amountDueToJj: number
  readonly direction: ClosingDirection
  readonly lines: readonly DisplayLine[]
  readonly units: readonly AccountUnit[]
  readonly summaries: readonly ComponentSummary[]
  readonly bridge: readonly BridgeStep[]
  readonly statusLines: readonly StatusLine[]
  readonly sourceNotes: readonly SourceNote[]
  readonly certifiedMonthlyStr: CertifiedStrMonthlySection | null
}

export interface CreditPresentation {
  readonly label: string
  readonly monthLabel: string
  readonly dateCaption: string | null
  readonly note: string | null
  readonly amount: number
  readonly eventId: string
  readonly sourceTransactionId: string | null
  readonly eventType: 'noncash_settlement_credit' | 'include_transaction_in_settlement'
  readonly dateRole: 'credit-event' | 'cash-receipt'
  readonly evidence: EvidenceStatus
}

export interface SourceNote {
  readonly propertyName: string
  readonly topic: string
  readonly text: string
}

export interface ClientAccountDocument {
  readonly clientId: string | null
  readonly clientDisplayName: string
  readonly reportTitle: string
  readonly reportLanguage: 'he' | 'en'
  readonly reportType: ReportType
  readonly period: ReportPeriod | null
  readonly currency: ReportCurrency
  readonly evidenceStatus: ReportEvidenceStatus
  readonly asOf: string
  readonly openingDueToJj: number
  readonly closingDueToJj: number
  readonly closingDirection: ClosingDirection
  readonly properties: readonly PropertyAccount[]
  readonly credits: readonly CreditPresentation[]
  readonly sourceNotes: readonly SourceNote[]
  readonly omittedNetZeroSourceIds: readonly string[]
}
