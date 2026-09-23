/**
 * Generic full client-account model.
 * Property names, amounts and evidence are inputs. This file holds no client.
 */

export type EvidenceStatus = 'proven' | 'owner-certified'

export type AccountEffect = 'charge' | 'credit' | 'reference'

export type ClosingDirection = 'client_owes_jj' | 'jj_owes_client' | 'settled'

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
  readonly clientDisplayName: string
  readonly reportTitle: string
  readonly openingDueToJj: number
  readonly closingDueToJj: number
  readonly cashAllocationSignedTotal: number
  readonly lines: readonly CertifiedAccountLine[]
  readonly credits: readonly CertifiedCreditInput[]
  readonly rows: readonly LedgerRow[]
  readonly linkedRowsByPropertyKey?: Readonly<Record<string, readonly LedgerRow[]>>
  readonly strMonthsByPropertyKey?: Readonly<Record<string, readonly StrMonthInput[]>>
  readonly undatedChargeLabelByPropertyKey?: Readonly<Record<string, string>>
  readonly creditLabels?: { readonly noncash?: string; readonly cash?: string }
}

export interface DisplayLine {
  readonly propertyName: string
  readonly section: string
  readonly description: string
  readonly monthLabel: string
  readonly amount: number
  readonly effect: AccountEffect
  readonly sourceIds: readonly string[]
  readonly evidence: EvidenceStatus
  readonly countedIn: string
}

export interface BridgeStep {
  readonly label: string
  readonly signedDueToJj: number
}

export interface StatusLine {
  readonly label: string
  readonly state: 'closed' | 'open'
  readonly amount: number
  readonly direction: ClosingDirection
}

export interface AccountUnit {
  readonly title: string
  readonly lines: readonly DisplayLine[]
  readonly balanceDueToJj: number
}

export interface PropertyAccount {
  readonly propertyName: string
  readonly propertyKey: string
  readonly lineOrder: number
  readonly amountDueToJj: number
  readonly direction: ClosingDirection
  readonly lines: readonly DisplayLine[]
  readonly units: readonly AccountUnit[]
  readonly bridge: readonly BridgeStep[]
  readonly statusLines: readonly StatusLine[]
}

export interface CreditPresentation {
  readonly label: string
  readonly monthLabel: string
  readonly amount: number
  readonly sourceId: string | null
  readonly evidence: EvidenceStatus
}

export interface ClientAccountDocument {
  readonly clientDisplayName: string
  readonly reportTitle: string
  readonly asOf: string
  readonly openingDueToJj: number
  readonly closingDueToJj: number
  readonly closingDirection: ClosingDirection
  readonly properties: readonly PropertyAccount[]
  readonly credits: readonly CreditPresentation[]
  readonly omittedNetZeroSourceIds: readonly string[]
}
