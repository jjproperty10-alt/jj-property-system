/**
 * Frozen VM1 Hostaway Owner Statement upload contract.
 * Evidence ingest only. Not admission, settlement, Certified, or Avi.
 * server-only.
 */

import 'server-only'

import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID } from './vm1Identity'
import { VM1_INITIAL_PERIOD_FROM, VM1_INITIAL_PERIOD_TO } from './vm1PeriodContract'

export const VM1_OS_PARSER_VERSION = 'hostaway_owner_minimal_xlsx_v1' as const
export const VM1_OS_UPLOAD_SOURCE_KIND = 'hostaway_owner_statement' as const
export const VM1_OS_SOURCE_ASSERTION = 'staff_confirmed_hostaway_download' as const
export const VM1_OS_INGEST_RPC = 'ingest_partnership_owner_statement_document' as const
export const VM1_OS_UPLOAD_STAFF_ROLES = ['ceo', 'finance_admin'] as const
export const VM1_OS_EXCLUDED_RESERVATION_ID = '53139113' as const
export const VM1_OS_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const VM1_OS_CURRENCY = 'EUR' as const

export const VM1_OS_REQUIRED_COLUMNS = [
  'reservation_id',
  'check_in',
  'check_out',
  'reservation_status',
  'gross_rental_revenue',
  'platform_fee',
  'guest_cleaning',
  'total_taxes',
  'management_charge',
  'net_owner_payout',
  'currency',
] as const

export const VM1_OS_OPTIONAL_IDENTITY_COLUMNS = ['listing_id'] as const

export const VM1_OS_LINE_AMOUNT_FIELDS = [
  'gross_rental_revenue',
  'platform_fee',
  'guest_cleaning',
  'total_taxes',
  'management_charge',
  'net_owner_payout',
] as const

export const VM1_OS_UPLOAD_PII_HEADERS = [
  'guest',
  'guest_name',
  'guestname',
  'guest_email',
  'email',
  'phone',
  'mobile',
  'property_name',
  'listing_name',
  'guest_phone',
] as const

export const VM1_OS_UPLOAD_IDENTITY = {
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  listingId: VM1_HOSTAWAY_LISTING_ID,
  statementFrom: VM1_INITIAL_PERIOD_FROM,
  statementTo: VM1_INITIAL_PERIOD_TO,
} as const

export const VM1_OS_UPLOAD_REASON = {
  unauthenticated: 'You must be signed in.',
  notStaff: 'Owner Statement upload requires ceo or finance_admin.',
  missingFile: 'An .xlsx Owner Statement file is required.',
  tooLarge: 'Owner Statement file is too large.',
  malformedXlsx: 'Owner Statement XLSX could not be read.',
  unknownColumn: 'Owner Statement contains an unknown column.',
  missingColumn: 'Owner Statement is missing a required column.',
  piiRejected: 'Owner Statement contains a forbidden personal field.',
  identityRejected: 'Owner Statement listing or property does not match TM20 listing 412148.',
  periodRejected: 'Owner Statement dates are outside the Initial partnership period.',
  duplicateReservation: 'Owner Statement has a duplicate reservation_id.',
  duplicateDatePair: 'Owner Statement has a duplicate check-in/check-out pair.',
  excludedReservation: 'Reservation 53139113 is excluded from the Initial partnership period.',
  currencyRejected: 'Owner Statement currency must be EUR.',
  centRejected: 'Owner Statement amounts must be non-negative exact cents.',
  equationRejected: 'Owner Statement net owner payout does not match the line equation.',
  reservationIdRejected: 'Owner Statement reservation_id is invalid.',
  reservationStatusRejected: 'Owner Statement reservation_status is invalid.',
  confirmationRequired: 'Staff confirmation is required before ingest.',
  ingestUnavailable: 'Owner Statement ingest could not be completed. This is not zero income.',
} as const

export const VM1_OS_INGEST_CONFLICT_LABEL: Record<string, string> = {
  hash_payload_conflict: 'Stored Owner Statement evidence conflicts with this file.',
  voided_document_same_hash: 'This Owner Statement hash belongs to a voided document.',
  reservation_conflict: 'Stored Owner Statement evidence has a reservation conflict.',
  date_pair_conflict: 'Stored Owner Statement evidence has a date-pair conflict.',
  cent_conflict: 'Stored Owner Statement evidence has an amount conflict.',
}

export const VM1_OS_RESERVATION_STATUSES = [
  'confirmed',
  'modified',
  'cancelled',
  'inquiry',
  'new',
  'unconfirmed',
  'pending',
  'ownerstay',
] as const

export const VM1_OS_RECONCILIATION_STATUSES = [
  'admitted_candidate',
  'forecast',
  'modified',
  'future',
  'cancelled',
  'inquiry',
  'permanently_excluded',
  'not_required',
  'matched',
  'conflict',
] as const

export type Vm1OsUploadStaffRole = (typeof VM1_OS_UPLOAD_STAFF_ROLES)[number]

export type Vm1OwnerStatementUploadLine = {
  readonly reservation_id: string
  readonly check_in: string
  readonly check_out: string
  readonly reservation_status: (typeof VM1_OS_RESERVATION_STATUSES)[number]
  readonly gross_rental_revenue: string
  readonly platform_fee: string
  readonly guest_cleaning: string
  readonly total_taxes: string
  readonly management_charge: string
  readonly net_owner_payout: string
  readonly currency: typeof VM1_OS_CURRENCY
  readonly source_row_reference: string
  readonly reconciliation_status: (typeof VM1_OS_RECONCILIATION_STATUSES)[number]
}

export type Vm1OwnerStatementUploadPreview = {
  readonly listingId: typeof VM1_HOSTAWAY_LISTING_ID
  readonly statementFrom: typeof VM1_INITIAL_PERIOD_FROM
  readonly statementTo: typeof VM1_INITIAL_PERIOD_TO
  readonly lineCount: number
  readonly netOwnerPayoutTotalEur: string
  readonly lines: readonly Vm1OwnerStatementUploadLine[]
}

export function isVm1OsUploadStaffRole(role: string | null | undefined): role is Vm1OsUploadStaffRole {
  return (VM1_OS_UPLOAD_STAFF_ROLES as readonly string[]).includes(role ?? '')
}

export function normalizeOsHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}
