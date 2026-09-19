/**
 * Jest-only TM20 Owner Statement fixture. Not a Production canonical store.
 * No person names. Not the original spreadsheet.
 */

import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from '../vm1Identity'
import { VM1_OS_SOURCE_KIND, type Vm1OwnerStatementDocument } from '../vm1OwnerStatementEvidence'

/** Fixture document hash for tests. Not loaded by Operations Production. */
export const TM20_OS_TEST_DOCUMENT_HASH =
  'b2945e7fb84452ff08f2cee224bd8cd960ca1ba85b2941968d5ce108c5f79951' as const

export const TM20_OS_TEST_IDENTITY = {
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
  hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
} as const

export const TM20_OS_TEST_DOCUMENT: Vm1OwnerStatementDocument = Object.freeze({
  sourceKind: VM1_OS_SOURCE_KIND,
  documentHash: TM20_OS_TEST_DOCUMENT_HASH,
  listingId: VM1_HOSTAWAY_LISTING_ID,
  verificationStatus: 'verified',
  lines: Object.freeze([
    Object.freeze({
      listingId: VM1_HOSTAWAY_LISTING_ID,
      checkIn: '2026-09-03',
      checkOut: '2026-09-06',
      grossEur: 932.93,
      platformFeeEur: 82.94,
      cleaningEur: 150,
      taxEur: 77.03,
      managementFeeEur: 124.59,
      netOwnerPayoutEur: 498.37,
    }),
    Object.freeze({
      listingId: VM1_HOSTAWAY_LISTING_ID,
      checkIn: '2026-09-11',
      checkOut: '2026-09-13',
      grossEur: 1197.04,
      platformFeeEur: 82.22,
      cleaningEur: 120,
      taxEur: 98.84,
      managementFeeEur: 179.2,
      netOwnerPayoutEur: 716.78,
    }),
    Object.freeze({
      listingId: VM1_HOSTAWAY_LISTING_ID,
      checkIn: '2026-09-18',
      checkOut: '2026-09-22',
      grossEur: 2393.64,
      platformFeeEur: 411.27,
      cleaningEur: 150,
      taxEur: 197.64,
      managementFeeEur: 326.95,
      netOwnerPayoutEur: 1307.78,
    }),
    Object.freeze({
      listingId: VM1_HOSTAWAY_LISTING_ID,
      checkIn: '2026-09-22',
      checkOut: '2026-09-26',
      grossEur: 2414.9,
      platformFeeEur: 242.67,
      cleaningEur: 150,
      taxEur: 199.4,
      managementFeeEur: 364.57,
      netOwnerPayoutEur: 1458.26,
    }),
  ]),
})
