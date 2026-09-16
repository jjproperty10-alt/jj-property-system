/**
 * @module partner-settlement/external-partner/externalPartnerReadTypes
 * @description Read-layer types for the external-partner (Avi) report.
 *
 * Two visibilities are kept apart on purpose:
 * - `internal` / audit: JJ staff may keep Payer, Notes, and review evidence.
 * - `partner-visible`: Avi sees relevant expenses and only his attributed
 *   payments labelled “Partner funding”. Raw payer, payee, Notes, and
 *   description never appear.
 *
 * This module does not compose a settlement and is not imported by routes.
 */

/** Raw `public.transactions` columns used by the external-partner reader. */
export interface RawExternalPartnerTransaction {
  readonly id: string
  readonly date: string
  readonly property_name: string | null
  readonly category: string | null
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number | string | null
  readonly client_charge: number | string | null
  readonly notes: string | null
  readonly k_note: string | null
  readonly is_deleted: boolean | null
  readonly review_status: string | null
}

/**
 * Staff / audit projection. Payer is the ledger field (never derived from Notes).
 * Evidence fields stay here for the JJ Finance screen and future control warnings.
 */
export interface ExternalPartnerInternalRow {
  readonly visibility: 'internal'
  readonly id: string
  readonly date: string
  readonly propertyName: string
  readonly category: string | null
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  /** Same as `payer`. Overlay code must not confuse this with attributedPayer. */
  readonly rawPayer: string | null
  /** Overlay payer used for Avi paid. Null unless a documented rule applied. */
  readonly attributedPayer: 'AVI' | null
  readonly attributionSource: string | null
  readonly payee: string | null
  readonly amountEur: number | null
  readonly clientCharge: number | null
  readonly notes: string | null
  readonly kNote: string | null
  readonly isDeleted: false
  readonly reviewStatus: string | null
  /** Set when this id is in the locked Avi confirmed-duplicate control set. */
  readonly aviControl: 'confirmed_duplicate_included' | null
  /**
   * Presentation-only marker. Never a live ledger `review_status`.
   * Used for approved Pool Service months not yet inserted in Production.
   */
  readonly overlayKind?: 'approved_business_overlay'
}

/**
 * Expense Avi may see: amount and classification only.
 * Raw payer, payee, Notes, and description are intentionally absent.
 */
export interface ExternalPartnerVisibleExpense {
  readonly visibility: 'partner-visible'
  readonly kind: 'expense'
  readonly id: string
  readonly date: string
  readonly amountEur: number | null
  readonly category: string | null
  readonly subcategory: string | null
}

/**
 * Payment Avi may see: Partner funding + Avi’s payment only.
 * Notes, description, payee, and raw payer are never copied here.
 */
export interface ExternalPartnerVisiblePayment {
  readonly visibility: 'partner-visible'
  readonly kind: 'payment'
  readonly id: string
  readonly date: string
  readonly amountEur: number | null
  readonly label: 'Partner funding'
  readonly payer: 'Avi'
}

export type ExternalPartnerVisibleRow =
  | ExternalPartnerVisibleExpense
  | ExternalPartnerVisiblePayment

export interface ExternalPartnerControlMaterial {
  /**
   * The two purchase-expense rows that remain in Avi control even when live
   * `review_status` is `confirmed_duplicate`. Staff evidence; not a Production status change.
   */
  readonly confirmedDuplicateRows: readonly ExternalPartnerInternalRow[]
}

export interface ExternalPartnerReadViews {
  readonly internal: {
    readonly rows: readonly ExternalPartnerInternalRow[]
  }
  readonly partnerVisible: {
    readonly expenses: readonly ExternalPartnerVisibleExpense[]
    readonly payments: readonly ExternalPartnerVisiblePayment[]
  }
  readonly control: ExternalPartnerControlMaterial
}

/** Frozen approved cutoff snapshot. 202 is version control, not a live-row rule. */
export interface ExternalPartnerApprovedSnapshot {
  readonly kind: 'approved_cutoff_snapshot'
  readonly propertyName: 'Villa Mazotos'
  readonly cutoffDate: string
  readonly approvedRowCount: 202
  readonly version: string
  readonly sha256: string
  readonly classificationArtifact: string
}

export interface ExternalPartnerSnapshotBinding {
  readonly snapshot: ExternalPartnerApprovedSnapshot
  readonly liveRowsInScope: readonly RawExternalPartnerTransaction[]
  readonly liveRowsAfterCutoff: readonly RawExternalPartnerTransaction[]
}

export type ExternalPartnerTransactionsFetchResult =
  | { readonly status: 'ok'; readonly rows: readonly RawExternalPartnerTransaction[] }
  | { readonly status: 'failed'; readonly reason: string }
