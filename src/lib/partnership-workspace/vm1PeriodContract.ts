/**
 * VM1 Initial partnership period — membership contract only.
 *
 * Check-in clock. Hostaway RPC overlap is not period membership.
 * Not a Draft, settlement, Certified snapshot, or P&L.
 */

import { VM1_NEW_PERIOD_START } from './vm1Identity'

export const VM1_INITIAL_PERIOD_NAME = 'Initial partnership period' as const

/** Inclusive check-in start. Same calendar day as VM1_NEW_PERIOD_START. */
export const VM1_INITIAL_PERIOD_FROM = VM1_NEW_PERIOD_START

/** Inclusive check-in end. */
export const VM1_INITIAL_PERIOD_TO = '2026-11-30' as const

/**
 * Hostaway overlap-probe start for pms_reservations_for_property only.
 * A row may overlap this window and still fail period membership.
 */
export const VM1_HOSTAWAY_OVERLAP_PROBE_FROM = '2026-08-25' as const

export const VM1_HOSTAWAY_OVERLAP_PROBE_TO = VM1_INITIAL_PERIOD_TO

/**
 * Hostaway inventory is evidence at the time of the RPC read.
 * It is not a Certified snapshot and not a saved Draft.
 */
export const VM1_HOSTAWAY_INVENTORY_EVIDENCE_NOTE =
  'Hostaway inventory is evidence at the time of the RPC read. It is not a Certified snapshot.' as const

export const VM1_DRAFT_ADMISSION_SECTION_TITLE = 'Draft admission review / בדיקת קבלה לטיוטה' as const

export const VM1_DRAFT_ADMISSION_STAFF_NOTE =
  'Admission gates only — not a saved Draft, not settlement, not Certified, and no partner split.' as const

export const VM1_DRAFT_ADMISSION_STATE_LABEL = {
  admitted: 'Admitted candidate',
  blocked: 'Blocked',
  completed_pending_authoritative_evidence:
    'Blocked — authoritative statement evidence required / חסום — נדרשת ראיית דוח בעלים',
  forecast: 'Forecast — not admitted',
  excluded: 'Excluded',
  needs_review: 'Needs Review',
} as const

export function isVm1InitialPeriodCheckIn(checkIn: string | null | undefined): boolean {
  if (checkIn == null || checkIn === '') return false
  return checkIn >= VM1_INITIAL_PERIOD_FROM && checkIn <= VM1_INITIAL_PERIOD_TO
}
