/**
 * Pure reporting contract for a certified monthly STR table.
 * A table exists only for an applied certification.
 * Null reservation counts and nights display as unavailable, never zero.
 * Incomplete component reconciliation does not authorize a component formula.
 * The monthly total explains an STR credit and is not added to certified closing.
 */

import {
  STR_COMPONENT_RECONCILIATION_STATUSES,
  STR_COUNT_UNAVAILABLE_LABEL,
  STR_MONTHLY_ADDS_TO_CERTIFIED_CLOSING,
  STR_MONTHLY_SETTLEMENT_ROLE,
  STR_MONTHLY_SOURCE_AUTHORITIES,
  type StrComponentReconciliationStatus,
  type StrMonthlyComponentAmounts,
  type StrMonthlySourceAuthority,
} from './strMonthlySettlementCertificationTypes'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_START = /^\d{4}-\d{2}-01$/

export interface CertifiedStrMonthlyDisplayLine {
  readonly month: string
  readonly reservationCount: number | null
  readonly nights: number | null
  readonly reservationCountLabel: string
  readonly nightsLabel: string
  readonly ownerNet: number
  readonly sourceAuthority: StrMonthlySourceAuthority
  readonly evidenceNote: string
  readonly componentReconciliationStatus: StrComponentReconciliationStatus
  readonly components?: StrMonthlyComponentAmounts
  readonly showComponentFormula: boolean
}

export interface CertifiedStrMonthlyReconciliation {
  readonly monthlySum: number
  readonly certifiedTotal: number
  readonly difference: number
  readonly status: 'exact' | 'mismatch'
}

export interface CertifiedStrMonthlyAvailable {
  readonly unavailable: false
  readonly certificationId: string
  readonly entityId: string
  readonly propertyId: string
  readonly periodFrom: string
  readonly periodTo: string
  readonly version: number
  readonly totalOwnerNet: number
  readonly months: readonly CertifiedStrMonthlyDisplayLine[]
  readonly reconciliation: CertifiedStrMonthlyReconciliation
  readonly settlementRole: typeof STR_MONTHLY_SETTLEMENT_ROLE
  readonly addsToCertifiedClosing: typeof STR_MONTHLY_ADDS_TO_CERTIFIED_CLOSING
}

export interface CertifiedStrMonthlyUnavailable {
  readonly unavailable: true
  readonly reason: string
  readonly entityId: string | null
  readonly propertyId: string | null
  readonly periodFrom: string | null
  readonly periodTo: string | null
}

export type CertifiedStrMonthlySettlement =
  | CertifiedStrMonthlyAvailable
  | CertifiedStrMonthlyUnavailable

const COMPONENT_KEYS = [
  'gross_accommodation',
  'platform_fee',
  'cleaning_amount',
  'tax_amount',
  'management_fee',
  'other_adjustments',
] as const

export function toExactCents(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 1e-6) return null
  return cents
}

export function formatStrMonthlyCount(value: number | null): string {
  if (value == null) return STR_COUNT_UNAVAILABLE_LABEL
  if (!Number.isInteger(value) || value < 0) return STR_COUNT_UNAVAILABLE_LABEL
  return String(value)
}

/**
 * A component formula may be shown only when reconciliation is complete and an
 * approved formula has been supplied explicitly. partial and certified_total_only
 * never qualify. This layer does not invent that formula.
 */
export function strMonthlyReportMayShowComponentFormula(
  status: StrComponentReconciliationStatus,
  formulaExplicitlyApproved: boolean,
): boolean {
  return status === 'complete' && formulaExplicitlyApproved === true
}

function unavailable(
  reason: string,
  entityId: string | null,
  propertyId: string | null,
  periodFrom: string | null,
  periodTo: string | null,
): CertifiedStrMonthlyUnavailable {
  return { unavailable: true, reason, entityId, propertyId, periodFrom, periodTo }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return null
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const day = value.slice(0, 10)
  return ISO_DATE.test(day) ? day : null
}

function asCentsNumber(value: unknown): number | null {
  if (typeof value === 'number' && toExactCents(value) != null) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (toExactCents(n) != null) return n
  }
  return null
}

function asOptionalCount(value: unknown): number | null | undefined {
  if (value == null) return null
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return Number(value)
  return undefined
}

function asSource(value: unknown): StrMonthlySourceAuthority | null {
  return typeof value === 'string' &&
    (STR_MONTHLY_SOURCE_AUTHORITIES as readonly string[]).includes(value)
    ? (value as StrMonthlySourceAuthority)
    : null
}

function asComponentStatus(value: unknown): StrComponentReconciliationStatus | null {
  return typeof value === 'string' &&
    (STR_COMPONENT_RECONCILIATION_STATUSES as readonly string[]).includes(value)
    ? (value as StrComponentReconciliationStatus)
    : null
}

function parseComponents(raw: unknown): StrMonthlyComponentAmounts | null | undefined {
  if (raw == null) return undefined
  const row = asRecord(raw)
  if (!row) return null
  const out: Record<string, number> = {}
  for (const key of COMPONENT_KEYS) {
    if (!(key in row) || row[key] == null) continue
    const amount = asCentsNumber(row[key])
    if (amount == null) return null
    out[key] = amount
  }
  return out as StrMonthlyComponentAmounts
}

export function parseCertifiedStrMonthlySettlement(
  raw: unknown,
  scope: {
    entityId: string | null
    propertyId: string | null
    periodFrom: string | null
    periodTo: string | null
  },
): CertifiedStrMonthlySettlement {
  const row = asRecord(raw)
  if (!row) return unavailable('reader_unavailable', scope.entityId, scope.propertyId, scope.periodFrom, scope.periodTo)
  if (row.unavailable === true) {
    return unavailable(
      asText(row.reason) ?? 'no_applied_certification',
      scope.entityId,
      scope.propertyId,
      scope.periodFrom,
      scope.periodTo,
    )
  }

  const certificationId = asText(row.certification_id)
  const entityId = asText(row.entity_id)
  const propertyId = asText(row.property_id)
  const periodFrom = asIsoDate(row.period_from)
  const periodTo = asIsoDate(row.period_to)
  const version = asOptionalCount(row.version)
  const totalOwnerNet = asCentsNumber(row.total_owner_net)
  const monthsRaw = row.months
  const reconciliation = asRecord(row.reconciliation)
  if (
    !certificationId ||
    !entityId ||
    !propertyId ||
    !periodFrom ||
    !periodTo ||
    version == null ||
    version < 1 ||
    totalOwnerNet == null ||
    !Array.isArray(monthsRaw) ||
    !reconciliation
  ) {
    return unavailable('reader_unavailable', scope.entityId, scope.propertyId, scope.periodFrom, scope.periodTo)
  }

  const months: CertifiedStrMonthlyDisplayLine[] = []
  let monthCents = 0
  for (const item of monthsRaw) {
    const line = asRecord(item)
    if (!line) return unavailable('reader_unavailable', entityId, propertyId, periodFrom, periodTo)
    const month = asIsoDate(line.month)
    const ownerNet = asCentsNumber(line.owner_net)
    const sourceAuthority = asSource(line.source_authority)
    const evidenceNote = asText(line.evidence_note)
    const componentStatus = asComponentStatus(line.component_reconciliation_status)
    const reservationCount = asOptionalCount(line.reservation_count)
    const nights = asOptionalCount(line.nights)
    if (
      !month ||
      !MONTH_START.test(month) ||
      ownerNet == null ||
      !sourceAuthority ||
      !evidenceNote ||
      !componentStatus ||
      reservationCount === undefined ||
      nights === undefined
    ) {
      return unavailable('reader_unavailable', entityId, propertyId, periodFrom, periodTo)
    }
    const components = parseComponents(line.components)
    if (components === null) {
      return unavailable('reader_unavailable', entityId, propertyId, periodFrom, periodTo)
    }
    const ownerCents = toExactCents(ownerNet)
    if (ownerCents == null) return unavailable('reader_unavailable', entityId, propertyId, periodFrom, periodTo)
    monthCents += ownerCents
    months.push({
      month,
      reservationCount,
      nights,
      reservationCountLabel: formatStrMonthlyCount(reservationCount),
      nightsLabel: formatStrMonthlyCount(nights),
      ownerNet,
      sourceAuthority,
      evidenceNote,
      componentReconciliationStatus: componentStatus,
      ...(components && Object.keys(components).length > 0 ? { components } : {}),
      showComponentFormula: strMonthlyReportMayShowComponentFormula(componentStatus, false),
    })
  }

  const monthlySum = asCentsNumber(reconciliation.monthly_sum)
  const certifiedTotal = asCentsNumber(reconciliation.certified_total)
  const difference = asCentsNumber(reconciliation.difference)
  const status = reconciliation.status === 'exact' || reconciliation.status === 'mismatch'
    ? reconciliation.status
    : null
  const totalCents = toExactCents(totalOwnerNet)
  if (
    monthlySum == null ||
    certifiedTotal == null ||
    difference == null ||
    status == null ||
    totalCents == null ||
    toExactCents(monthlySum) !== monthCents ||
    toExactCents(certifiedTotal) !== totalCents ||
    toExactCents(difference) !== totalCents - monthCents ||
    status !== 'exact' ||
    monthCents !== totalCents
  ) {
    return unavailable('reconciliation_mismatch', entityId, propertyId, periodFrom, periodTo)
  }

  return {
    unavailable: false,
    certificationId,
    entityId,
    propertyId,
    periodFrom,
    periodTo,
    version,
    totalOwnerNet,
    months,
    reconciliation: {
      monthlySum,
      certifiedTotal,
      difference,
      status,
    },
    settlementRole: STR_MONTHLY_SETTLEMENT_ROLE,
    addsToCertifiedClosing: STR_MONTHLY_ADDS_TO_CERTIFIED_CLOSING,
  }
}
