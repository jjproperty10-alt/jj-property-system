/**
 * Read-only certified Avi reservation IDs for VM1 operations.
 *
 * Derived from the existing frozen stay collection. Does not copy the 28 IDs,
 * and does not edit AVI_HOSTAWAY_STAYS, amounts, dates, or the composer.
 */

import 'server-only'

import { AVI_HOSTAWAY_STAYS } from '@/lib/partner-settlement/external-partner/aviHostawayStays'

/** Caller-owned certified set for `loadVm1Identity`. IDs come from AVI_HOSTAWAY_STAYS. */
export function aviCertifiedReservationIdSet(): ReadonlySet<string> {
  return new Set(AVI_HOSTAWAY_STAYS.map((stay) => stay.reservationId))
}
