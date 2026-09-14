/**
 * LOCAL FIXTURES ONLY — not inserted into any database.
 * C1 = Tamir owner-level €10,000 payment (Yaakov/Jacob → Owner).
 * C3 = 29 Hostaway billing-only rows (€40 client_charge, amount_eur 0).
 */

import {
  C1_AMOUNT_EUR,
  C1_IDEMPOTENCY_KEY,
  C3_UNIT_CLIENT_CHARGE_EUR,
  TAMIR_CANONICAL_NAME,
  TAMIR_OWNER_ENTITY_ID,
  TAMIR_PROPERTIES,
  type OwnerLevelPaymentCandidate,
} from '../ownerLevelPaymentTypes'
import { LIVE_PRODUCTION_PREIMAGE_EUR } from '../tamirCertifiedReconciliation'

export const C1_FIXTURE_TRANSACTION_ID = 'fixture-c1-not-inserted'

export const C1_DESCRIPTION =
  'Yaakov paid Tamir €10,000 on account of Tamir’s overall owner balance'

export const C1_CANDIDATE: OwnerLevelPaymentCandidate = {
  transactionId: C1_FIXTURE_TRANSACTION_ID,
  ownerEntityId: TAMIR_OWNER_ENTITY_ID,
  ownerCanonicalName: TAMIR_CANONICAL_NAME,
  date: '2026-08-24',
  payer: 'Jacob',
  payee: 'Owner',
  amountEur: C1_AMOUNT_EUR,
  description: C1_DESCRIPTION,
  idempotencyKey: C1_IDEMPOTENCY_KEY,
  reviewStatus: 'approved',
  linkRole: 'owner_level_payment',
  isDeletedLink: false,
  isDeletedTransaction: false,
  transactionReviewStatus: 'active',
  propertyId: null,
  propertyName: null,
  category: 'Management',
  subcategory: 'Bank Payment to Owner',
}

export const C1_LINK_NOTES = 'YOSSI_VERIFIED · OWNER_LEVEL_UNALLOCATED'

/** Live Production pre-image (C1/C3 not inserted). NOT certified+C1. */
export const TAMIR_LIVE_PREIMAGE_EUR = LIVE_PRODUCTION_PREIMAGE_EUR

export const TAMIR_PROPERTY_BALANCES_UNCHANGED = TAMIR_PROPERTIES.map(propertyName => ({
  propertyName,
  dueToOwnerEur: 0,
}))

export interface C3HostawayFixtureRow {
  readonly idempotencyKey: string
  readonly clientChargeEur: number
  readonly amountEur: number
  readonly propertyName: string
}

export const C3_HOSTAWAY_MANIFEST: readonly { listingId: string; propertyName: string; months: readonly string[] }[] = [
  {
    listingId: '412145',
    propertyName: 'Tamir Dekelia',
    months: [
      '2024-10', '2024-11', '2024-12',
      '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
      '2026-05', '2026-06', '2026-07', '2026-08',
    ],
  },
  {
    listingId: '412147',
    propertyName: 'Tamir Radisson',
    months: [
      '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
      '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
      '2026-05', '2026-06', '2026-07', '2026-08',
    ],
  },
]

/** 29 unique Hostaway listing-month billing-only rows. Not inserted. */
export function buildC3HostawayFixtures(): readonly C3HostawayFixtureRow[] {
  const rows: C3HostawayFixtureRow[] = []
  for (const listing of C3_HOSTAWAY_MANIFEST) {
    for (const month of listing.months) {
      rows.push({
        idempotencyKey: `tamir_hostaway_${listing.listingId}_${month}`,
        clientChargeEur: C3_UNIT_CLIENT_CHARGE_EUR,
        amountEur: 0,
        propertyName: listing.propertyName,
      })
    }
  }
  return rows
}

export interface PropertyLinkedBpo {
  readonly transactionId: string
  readonly propertyName: string
  readonly amountEur: number
  readonly payer: string
}

/** Historical property-linked BPO — must keep working without an owner link. */
export const HISTORICAL_PROPERTY_BPO: PropertyLinkedBpo = {
  transactionId: 'da46f998-f296-42ab-a3d7-2d6573b51eb1',
  propertyName: 'Tamir Radisson',
  amountEur: 1000,
  payer: 'Jacob',
}
