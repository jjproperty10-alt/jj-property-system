/**
 * Admits a public monthly STR reader payload into the client report.
 * The table explains an already certified credit. It never changes the closing.
 */

import { monthFromIsoDate } from './presentation'
import type { CertifiedStrMonthlySection, CertifiedStrMonthlyUnavailable } from './types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_START = /^\d{4}-\d{2}-01$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const STR_MONTHLY_ARITHMETIC_EFFECT = 0 as const
export const STR_COUNT_UNAVAILABLE = 'לא זמין'

export interface StrMonthlyAdmitScope {
  readonly entityId: string | null
  readonly propertyId: string | null
  readonly propertyName: string | null
  readonly periodStart: string | null
  readonly periodEnd: string | null
}

function unavailable(reason: string, scope: StrMonthlyAdmitScope): CertifiedStrMonthlyUnavailable {
  return {
    unavailable: true,
    reason,
    entityId: scope.entityId,
    propertyId: scope.propertyId,
    propertyName: scope.propertyName,
    periodStart: scope.periodStart,
    periodEnd: scope.periodEnd,
    arithmeticEffectOnCertifiedClosing: STR_MONTHLY_ARITHMETIC_EFFECT,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return null
}

function day(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.slice(0, 10)
  return ISO_DATE.test(text) ? text : null
}

export function toExactCents(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 1e-6) return null
  return cents
}

function asMoney(value: unknown): number | null {
  if (typeof value === 'number') return toExactCents(value) == null ? null : value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return toExactCents(n) == null ? null : n
  }
  return null
}

function asCount(value: unknown): number | null | undefined {
  if (value == null) return null
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return Number(value)
  return undefined
}

function monthEnd(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${monthStart.slice(0, 8)}${String(last).padStart(2, '0')}`
}

export async function readMonthlyStrOrUnavailable(
  scope: StrMonthlyAdmitScope & { readonly identityCount?: number },
  read: () => Promise<unknown>,
): Promise<CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable> {
  if (scope.identityCount != null && scope.identityCount !== 1) {
    return unavailable('ambiguous_identity', scope)
  }
  if (!scope.periodStart || !scope.periodEnd || !scope.entityId || !scope.propertyId || !scope.propertyName) {
    return unavailable('missing_scope', scope)
  }
  try {
    return admitCertifiedStrMonthly(await read(), scope)
  } catch {
    return unavailable('reader_unavailable', scope)
  }
}

export function countLabel(value: number | null): string {
  if (value == null) return STR_COUNT_UNAVAILABLE
  return String(value)
}

/**
 * Fail closed. A missing or inconsistent payload becomes unavailable.
 * It never becomes a zero credit.
 */
export function admitCertifiedStrMonthly(
  raw: unknown,
  scope: StrMonthlyAdmitScope,
): CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable {
  if (!scope.periodStart || !scope.periodEnd || !scope.entityId || !scope.propertyId || !scope.propertyName) {
    return unavailable('missing_scope', scope)
  }
  if (!UUID.test(scope.entityId) || !UUID.test(scope.propertyId)) {
    return unavailable('invalid_identity', scope)
  }
  const row = asRecord(raw)
  if (!row) return unavailable('reader_unavailable', scope)
  if (row.unavailable === true) return unavailable(typeof row.reason === 'string' ? row.reason : 'no_applied_certification', scope)

  const certificationId = typeof row.certification_id === 'string' ? row.certification_id : null
  const entityId = typeof row.entity_id === 'string' ? row.entity_id : null
  const propertyId = typeof row.property_id === 'string' ? row.property_id : null
  const periodStart = day(row.period_from)
  const periodEnd = day(row.period_to)
  const totalOwnerNet = asMoney(row.total_owner_net)
  const monthsRaw = row.months
  const reconciliation = asRecord(row.reconciliation)
  if (
    !certificationId || !UUID.test(certificationId) ||
    entityId !== scope.entityId ||
    propertyId !== scope.propertyId ||
    periodStart !== scope.periodStart ||
    periodEnd !== scope.periodEnd ||
    totalOwnerNet == null ||
    !Array.isArray(monthsRaw) ||
    !reconciliation
  ) {
    return unavailable('reader_unavailable', scope)
  }

  const seen = new Set<string>()
  const months = []
  let cents = 0
  for (const item of monthsRaw) {
    const line = asRecord(item)
    if (!line) return unavailable('reader_unavailable', scope)
    const monthStart = day(line.month)
    const ownerNet = asMoney(line.owner_net)
    const reservationCount = asCount(line.reservation_count)
    const nights = asCount(line.nights)
    const componentReconciliationStatus = typeof line.component_reconciliation_status === 'string'
      ? line.component_reconciliation_status
      : null
    if (
      !monthStart || !MONTH_START.test(monthStart) ||
      ownerNet == null ||
      reservationCount === undefined ||
      nights === undefined ||
      !componentReconciliationStatus
    ) {
      return unavailable('reader_unavailable', scope)
    }
    if (seen.has(monthStart)) return unavailable('duplicate_month', scope)
    seen.add(monthStart)
    if (monthStart < scope.periodStart || monthEnd(monthStart) > scope.periodEnd) {
      return unavailable('month_outside_period', scope)
    }
    const ownerCents = toExactCents(ownerNet)
    if (ownerCents == null) return unavailable('invalid_cents', scope)
    cents += ownerCents
    months.push({
      monthStart,
      monthLabel: monthFromIsoDate(monthStart),
      reservationCount,
      nights,
      reservationCountLabel: countLabel(reservationCount),
      nightsLabel: countLabel(nights),
      ownerNet,
      componentReconciliationStatus,
    })
  }
  months.sort((a, b) => a.monthStart.localeCompare(b.monthStart))

  const monthlySum = asMoney(reconciliation.monthly_sum)
  const certifiedTotal = asMoney(reconciliation.certified_total)
  const totalCents = toExactCents(totalOwnerNet)
  if (
    monthlySum == null ||
    certifiedTotal == null ||
    totalCents == null ||
    toExactCents(monthlySum) !== cents ||
    toExactCents(certifiedTotal) !== totalCents ||
    cents !== totalCents ||
    reconciliation.status !== 'exact'
  ) {
    return unavailable('line_total_mismatch', scope)
  }

  return {
    unavailable: false,
    certificationId,
    entityId,
    propertyId,
    propertyName: scope.propertyName,
    periodStart,
    periodEnd,
    status: 'applied',
    totalOwnerNet,
    reconciliationStatus: 'exact',
    months,
    arithmeticEffectOnCertifiedClosing: STR_MONTHLY_ARITHMETIC_EFFECT,
  }
}
