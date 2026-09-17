/**
 * VM1 Property Operations — presentation helpers only.
 * No settlement, totals, partner shares, or ledger combination.
 */

import { isExactIsoCalendarDate } from './vm1IdentityAdapter'
import type { Vm1ReservationDisposition, Vm1ReservationRow } from './vm1IdentityAdapter'
import { VM1_NEW_PERIOD_START } from './vm1Identity'

/** Default operational window start (overlap probe / Hostaway read). */
export const VM1_OPERATIONS_DEFAULT_FROM = '2026-08-25' as const

export const VM1_OPERATIONS_PROPERTY_LABEL = 'TM20 — TelMar Royal Villa' as const

export const VM1_OPERATIONS_STAFF_NOTE =
  'Operational evidence only — not certified settlement data.' as const

export const VM1_UNKNOWN_EVIDENCE_LABEL = 'Unknown / לא ידוע' as const

export const VM1_DISPOSITION_LABEL = {
  already_certified: 'Already certified',
  operational_candidate: 'Confirmed candidate',
  excluded_cancelled: 'Excluded — cancelled',
  excluded_inquiry: 'Excluded — inquiry',
  excluded: 'Excluded',
  needs_review: 'Needs Review — modified/unknown',
} as const

export const VM1_EVIDENCE_STATE_LABEL = {
  missing: 'Missing financial evidence',
  present: 'Evidence returned',
} as const

export type Vm1OperationsRange =
  | { readonly ok: true; readonly from: string; readonly to: string }
  | { readonly ok: false; readonly reason: string }

export function utcTodayIso(now: Date = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function asSingleQueryValue(
  value: string | string[] | undefined,
): { readonly ok: true; readonly value: string | undefined } | { readonly ok: false; readonly reason: string } {
  if (value === undefined) return { ok: true, value: undefined }
  if (Array.isArray(value)) {
    return { ok: false, reason: 'Date query parameter must be a single exact YYYY-MM-DD value.' }
  }
  return { ok: true, value }
}

function resolveRangeSide(
  raw: string | undefined,
  fallback: string,
  field: 'from' | 'to',
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string } {
  if (raw === undefined) return { ok: true, value: fallback }
  if (raw.trim() === '' || !isExactIsoCalendarDate(raw)) {
    return { ok: false, reason: `${field} must be an exact YYYY-MM-DD calendar date.` }
  }
  return { ok: true, value: raw }
}

/**
 * Operational range from URL query params.
 * Missing params use 2026-08-25 through the current UTC date.
 * Malformed, empty, or reversed ranges fail closed.
 */
export function parseVm1OperationsRange(
  fromParam: string | string[] | undefined,
  toParam: string | string[] | undefined,
  now: Date = new Date(),
): Vm1OperationsRange {
  const fromRaw = asSingleQueryValue(fromParam)
  if (!fromRaw.ok) return fromRaw
  const toRaw = asSingleQueryValue(toParam)
  if (!toRaw.ok) return toRaw

  const from = resolveRangeSide(fromRaw.value, VM1_OPERATIONS_DEFAULT_FROM, 'from')
  if (!from.ok) return from
  const to = resolveRangeSide(toRaw.value, utcTodayIso(now), 'to')
  if (!to.ok) return to
  if (from.value > to.value) {
    return { ok: false, reason: 'from must be on or before to.' }
  }
  return { ok: true, from: from.value, to: to.value }
}

export function vm1DispositionLabel(row: {
  readonly disposition: Vm1ReservationDisposition
  readonly reason: string
  readonly status: string
}): string {
  if (row.disposition === 'already_certified') return VM1_DISPOSITION_LABEL.already_certified
  if (row.disposition === 'operational_candidate') return VM1_DISPOSITION_LABEL.operational_candidate
  if (row.disposition === 'needs_review') return VM1_DISPOSITION_LABEL.needs_review
  const reason = row.reason.toLowerCase()
  const status = row.status.toLowerCase()
  if (reason.includes('cancelled') || status === 'cancelled') {
    return VM1_DISPOSITION_LABEL.excluded_cancelled
  }
  if (reason.includes('inquiry') || status === 'inquiry') {
    return VM1_DISPOSITION_LABEL.excluded_inquiry
  }
  return VM1_DISPOSITION_LABEL.excluded
}

export function vm1EvidenceState(
  row: Pick<
    Vm1ReservationRow,
    'totalPrice' | 'cleaningFee' | 'hostServiceFee' | 'expectedPayout' | 'taxAmount'
  >,
): 'missing' | 'present' {
  if (
    row.totalPrice == null ||
    row.cleaningFee == null ||
    row.hostServiceFee == null ||
    row.expectedPayout == null ||
    row.taxAmount == null
  ) {
    return 'missing'
  }
  return 'present'
}

export function vm1EvidenceStateLabel(
  row: Pick<
    Vm1ReservationRow,
    'totalPrice' | 'cleaningFee' | 'hostServiceFee' | 'expectedPayout' | 'taxAmount'
  >,
): string {
  return VM1_EVIDENCE_STATE_LABEL[vm1EvidenceState(row)]
}

export function formatVm1EvidenceAmount(value: number | null): string {
  if (value == null) return VM1_UNKNOWN_EVIDENCE_LABEL
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatVm1OptionalText(value: string | number | null): string {
  if (value == null || value === '') return VM1_UNKNOWN_EVIDENCE_LABEL
  return String(value)
}

export const VM1_NEW_PERIOD_NOTE = `New partnership period begins ${VM1_NEW_PERIOD_START} (check-in clock).`
