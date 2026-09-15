/**
 * @module partner-settlement/external-partner/externalPartnerReader
 * @description Pure external-partner transaction read/projection (no I/O).
 *
 * Scope: `property_name = 'Villa Mazotos'` (exact) AND `is_deleted = false`.
 * `review_status` is not a drop filter — confirmed_duplicate rows stay in
 * Avi control material. Independent of the certified partner-ledger reader,
 * client-report views, and partner-statement lifecycle.
 *
 * Raw payer identity comes only from the `payer` column. Notes never override it.
 * Partner-visible payments use attributed Avi funding when overlay ids are
 * supplied; otherwise only the payer field. Partner-visible never copies
 * description, notes, payee, or raw payer.
 */

import type {
  ExternalPartnerInternalRow,
  ExternalPartnerReadViews,
  ExternalPartnerVisibleExpense,
  ExternalPartnerVisiblePayment,
  RawExternalPartnerTransaction,
} from './externalPartnerReadTypes'
import {
  EXTERNAL_PARTNER_PROPERTY_NAME,
  asFiniteEur,
  isAviPayerField,
  isInExternalPartnerReadScope,
  resolvePayerIdentity,
} from './externalPartnerScope'
import {
  YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
  attributedAviPaymentIdSet,
  isAviAttributedFundingId,
  overlayHasAttributedId,
  type ExternalPartnerAviPaidAttribution,
} from './externalPartnerAttribution'

export {
  EXTERNAL_PARTNER_PROPERTY_NAME,
  asFiniteEur,
  isAviPayerField,
  isExactExternalPartnerProperty,
  isInExternalPartnerReadScope,
  resolvePayerIdentity,
} from './externalPartnerScope'

/** Full ids of the two purchase-expense rows kept for Avi control. */
export const AVI_CONTROL_CONFIRMED_DUPLICATE_IDS = [
  '9363b7c1-c536-4e35-b3ed-98bff7c3db40',
  'c2a9dff0-83f4-441b-96ca-01cb272993ff',
] as const

export function isAviControlConfirmedDuplicateId(id: string): boolean {
  return AVI_CONTROL_CONFIRMED_DUPLICATE_IDS.some(
    (full) => id === full || id.startsWith(full.slice(0, 8)),
  )
}

export interface ExternalPartnerReadViewOptions {
  /**
   * Ids that passed Avi Client→AVI attribution. Shown as partner-visible
   * Avi payments labelled Partner funding. Raw payer stays on internal only.
   */
  readonly attributedAviPaymentIds?: ReadonlySet<string>
}

function toInternalRow(
  row: RawExternalPartnerTransaction,
  attributedAviPaymentIds: ReadonlySet<string> | undefined,
): ExternalPartnerInternalRow {
  const aviControl = isAviControlConfirmedDuplicateId(row.id)
    ? 'confirmed_duplicate_included'
    : null
  const rawPayer = resolvePayerIdentity(row)
  const attributed = overlayHasAttributedId(attributedAviPaymentIds, row.id)
  return {
    visibility: 'internal',
    id: row.id,
    date: row.date,
    propertyName: EXTERNAL_PARTNER_PROPERTY_NAME,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    payer: rawPayer,
    rawPayer,
    attributedPayer: attributed ? 'AVI' : null,
    attributionSource: attributed ? YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE : null,
    payee: row.payee,
    amountEur: asFiniteEur(row.amount_eur),
    clientCharge: asFiniteEur(row.client_charge),
    notes: row.notes,
    kNote: row.k_note,
    isDeleted: false,
    reviewStatus: row.review_status,
    aviControl,
  }
}

function toVisibleExpense(row: ExternalPartnerInternalRow): ExternalPartnerVisibleExpense {
  return {
    visibility: 'partner-visible',
    kind: 'expense',
    id: row.id,
    date: row.date,
    amountEur: row.amountEur,
    category: row.category,
    subcategory: row.subcategory,
  }
}

function toVisibleAviPayment(row: ExternalPartnerInternalRow): ExternalPartnerVisiblePayment {
  return {
    visibility: 'partner-visible',
    kind: 'payment',
    id: row.id,
    date: row.date,
    amountEur: row.amountEur,
    label: 'Partner funding',
    payer: 'Avi',
  }
}

function isPartnerVisibleAviPayment(
  row: ExternalPartnerInternalRow,
  attributedAviPaymentIds: ReadonlySet<string> | undefined,
): boolean {
  if (overlayHasAttributedId(attributedAviPaymentIds, row.id)) return true
  if (isAviAttributedFundingId(row.id)) return false
  return isAviPayerField(row.payer)
}

/**
 * Same split as `readExternalPartnerTransactionViews`, overlaying Client→AVI
 * ids only after attribution succeeded. Failed attribution does not treat
 * the mapped Client rows as Avi payments.
 */
export function readExternalPartnerTransactionViewsFromAttribution(
  rows: readonly RawExternalPartnerTransaction[],
  attribution: ExternalPartnerAviPaidAttribution,
): ExternalPartnerReadViews {
  return readExternalPartnerTransactionViews(rows, {
    attributedAviPaymentIds: attributedAviPaymentIdSet(attribution),
  })
}

/**
 * Filter to Villa Mazotos + not deleted, then split audit vs partner-visible.
 * Confirmed-duplicate control rows are kept whenever they pass that scope.
 */
export function readExternalPartnerTransactionViews(
  rows: readonly RawExternalPartnerTransaction[],
  options?: ExternalPartnerReadViewOptions,
): ExternalPartnerReadViews {
  const overlay = options?.attributedAviPaymentIds
  const internalRows = rows.filter(isInExternalPartnerReadScope).map((row) => toInternalRow(row, overlay))
  const expenses: ExternalPartnerVisibleExpense[] = []
  const payments: ExternalPartnerVisiblePayment[] = []

  for (const row of internalRows) {
    if (isPartnerVisibleAviPayment(row, overlay)) {
      payments.push(toVisibleAviPayment(row))
    } else {
      expenses.push(toVisibleExpense(row))
    }
  }

  return {
    internal: { rows: internalRows },
    partnerVisible: { expenses, payments },
    control: {
      confirmedDuplicateRows: internalRows.filter((row) => row.aviControl != null),
    },
  }
}
