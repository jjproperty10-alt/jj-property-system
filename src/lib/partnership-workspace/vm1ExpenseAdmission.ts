/**
 * VM1 approved future-Draft expense admission — classification only.
 *
 * Independent of revenue Draft admission and the forecast calculator.
 * Does not post, allocate, persist, or change Production rows.
 */

import { VM1_CANONICAL_PROPERTY_ID, VM1_LEGACY_LEDGER_PROPERTY_ID } from './vm1Identity'
import { VM1_INITIAL_PERIOD_FROM, VM1_INITIAL_PERIOD_TO } from './vm1PeriodContract'

/** Whitelist of the approved Production transaction. Amounts still come from the live row. */
export const VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID =
  'efe4e1f5-8524-5266-ab10-4eedaa5b3e76' as const

export const VM1_APPROVED_EXPENSE_DATE = '2026-09-06' as const
export const VM1_APPROVED_EXPENSE_CATEGORY = 'Airbnb' as const
export const VM1_APPROVED_EXPENSE_SUBCATEGORY = 'Internet' as const

export const VM1_EXPENSE_ADMISSION_SECTION_TITLE =
  'Approved future-Draft expenses / הוצאות מאושרות לטיוטה עתידית' as const

export const VM1_EXPENSE_ADMISSION_STAFF_NOTE =
  'Internal classification only — not posted, not allocated, not Settlement and not Certified.' as const

export const VM1_EXPENSE_ADMISSION_BLOCKED_TITLE = 'Expense admission blocked' as const

export type Vm1ExpenseAdmissionState = 'approved_future_draft_expense' | 'blocked'

export const VM1_EXPENSE_ADMISSION_STATE_LABEL = {
  approved_future_draft_expense: 'Approved future-Draft expense',
  blocked: 'Blocked',
} as const

export const VM1_EXPENSE_ADMISSION_REASON = {
  rowCount: 'Approved expense row was not returned as exactly one Production transaction.',
  transactionId: 'Transaction is not the approved future-Draft expense whitelist id.',
  propertyId: 'Transaction property_id is not the VM1 legacy ledger identity.',
  canonicalPropertyId: 'Canonical VM1 property UUID is not the ledger filter for this expense.',
  date: 'Expense date must be 2026-09-06.',
  category: 'Expense category must be Airbnb.',
  subcategory: 'Expense subcategory must be Internet.',
  reviewStatus: 'Expense review_status must be active.',
  deleted: 'Deleted transactions are not Draft-admissible.',
  amount: 'amount_eur must be a finite positive EUR amount.',
  clientCharge: 'client_charge must be null or a finite non-negative EUR amount.',
  period: 'Expense date is outside the Initial partnership period (inclusive 2026-08-30..2026-11-30).',
  ledgerUnavailable: 'Expense ledger reader is unavailable.',
  ledgerRead: 'Expense ledger SELECT failed.',
  verifiedIdentity: 'Approved expense requires a verified VM1 identity before the ledger SELECT.',
  computedAmounts: 'Computed expense amounts must be finite EUR values.',
  approved:
    'Approved future-Draft property expense. Internal classification only — not posted, not allocated, not Settlement and not Certified.',
} as const

export interface Vm1ExpenseAdmissionLine {
  readonly transactionId: string | null
  readonly date: string | null
  readonly category: string | null
  readonly subcategory: string | null
  readonly admissionState: Vm1ExpenseAdmissionState
  readonly partnershipChargeEur: number | null
  readonly jjActualCostEur: number | null
  readonly jjOperatingProfitEur: number | null
  readonly reason: string
}

function roundEur(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function calendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = value.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return date
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function blocked(reason: string): Vm1ExpenseAdmissionLine {
  return {
    transactionId: null,
    date: null,
    category: null,
    subcategory: null,
    admissionState: 'blocked',
    partnershipChargeEur: null,
    jjActualCostEur: null,
    jjOperatingProfitEur: null,
    reason,
  }
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

export function admitVm1ApprovedFutureDraftExpense(rows: unknown): Vm1ExpenseAdmissionLine {
  if (!Array.isArray(rows) || rows.length !== 1) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.rowCount)
  }

  const rec = asRecord(rows[0])
  if (rec == null) return blocked(VM1_EXPENSE_ADMISSION_REASON.rowCount)

  const transactionId = typeof rec.id === 'string' ? rec.id.trim() : ''
  if (transactionId !== VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.transactionId)
  }

  const propertyId = typeof rec.property_id === 'string' ? rec.property_id.trim() : ''
  if (propertyId === VM1_CANONICAL_PROPERTY_ID) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.canonicalPropertyId)
  }
  if (propertyId !== VM1_LEGACY_LEDGER_PROPERTY_ID) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.propertyId)
  }

  const date = calendarDate(rec.date)
  if (date !== VM1_APPROVED_EXPENSE_DATE) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.date)
  }
  if (date < VM1_INITIAL_PERIOD_FROM || date > VM1_INITIAL_PERIOD_TO) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.period)
  }

  const category = typeof rec.category === 'string' ? rec.category.trim() : ''
  if (category !== VM1_APPROVED_EXPENSE_CATEGORY) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.category)
  }

  const subcategory = typeof rec.subcategory === 'string' ? rec.subcategory.trim() : ''
  if (subcategory !== VM1_APPROVED_EXPENSE_SUBCATEGORY) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.subcategory)
  }

  const reviewStatus = typeof rec.review_status === 'string' ? rec.review_status.trim() : ''
  if (reviewStatus !== 'active') {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.reviewStatus)
  }

  if (rec.is_deleted !== false) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.deleted)
  }

  const amountEur = asFiniteNumber(rec.amount_eur)
  if (amountEur == null || !isPositiveFinite(amountEur)) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.amount)
  }

  const clientCharge = rec.client_charge == null ? null : asFiniteNumber(rec.client_charge)
  if (rec.client_charge != null && (clientCharge == null || !isNonNegativeFinite(clientCharge))) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.clientCharge)
  }

  const partnershipChargeEur = roundEur(clientCharge !== null ? clientCharge : amountEur)
  const jjActualCostEur = roundEur(amountEur)
  const jjOperatingProfitEur = roundEur(clientCharge !== null ? clientCharge - amountEur : 0)

  if (
    !Number.isFinite(partnershipChargeEur) ||
    !Number.isFinite(jjActualCostEur) ||
    !Number.isFinite(jjOperatingProfitEur)
  ) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.computedAmounts)
  }

  return {
    transactionId,
    date,
    category,
    subcategory,
    admissionState: 'approved_future_draft_expense',
    partnershipChargeEur,
    jjActualCostEur,
    jjOperatingProfitEur,
    reason: VM1_EXPENSE_ADMISSION_REASON.approved,
  }
}
