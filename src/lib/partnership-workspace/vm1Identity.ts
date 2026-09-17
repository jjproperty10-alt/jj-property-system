/**
 * VM1 Partnership Workspace — identity configuration only.
 *
 * These values identify Villa Mazotos (partnership) across UUID spaces.
 * They are not financial amounts, allocations, or a certified period.
 *
 * Canonical / lifecycle / STR: public.property_definitions.property_id
 * Legacy ledger FK:            public.properties.id  (transactions.property_id)
 * Hostaway listing:            pms.property_mappings.external_id
 */

/** Canonical partnership property (property_definitions + lifecycle + STR). */
export const VM1_CANONICAL_PROPERTY_ID =
  '4eb09c84-907a-404c-b19a-7856f73fadff' as const

/** Legacy ledger identity (public.properties.id → transactions.property_id). */
export const VM1_LEGACY_LEDGER_PROPERTY_ID =
  '48a08e6e-12a6-43af-a929-b3063ee6b909' as const

/** Hostaway listing for TelMar Royal Villa. Not Apartment Neer Yoav Dekelia. */
export const VM1_HOSTAWAY_LISTING_ID = '412148' as const

/** Internal workspace key. Not a property_name filter. */
export const VM1_PARTNERSHIP_KEY = 'vm1' as const

/**
 * Next partnership accounting period begins on this check-in date.
 * Clock is check-in, not calendar month start, not checkout membership.
 */
export const VM1_NEW_PERIOD_START = '2026-08-30' as const

export type Vm1CanonicalPropertyId = typeof VM1_CANONICAL_PROPERTY_ID
export type Vm1LegacyLedgerPropertyId = typeof VM1_LEGACY_LEDGER_PROPERTY_ID
export type Vm1HostawayListingId = typeof VM1_HOSTAWAY_LISTING_ID

export interface Vm1IdentityConfig {
  readonly canonicalPropertyId: Vm1CanonicalPropertyId
  readonly legacyLedgerPropertyId: Vm1LegacyLedgerPropertyId
  readonly hostawayListingId: Vm1HostawayListingId
  readonly partnershipKey: typeof VM1_PARTNERSHIP_KEY
  readonly newPeriodStart: typeof VM1_NEW_PERIOD_START
}

export const VM1_IDENTITY: Vm1IdentityConfig = Object.freeze({
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
  hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
  partnershipKey: VM1_PARTNERSHIP_KEY,
  newPeriodStart: VM1_NEW_PERIOD_START,
})
