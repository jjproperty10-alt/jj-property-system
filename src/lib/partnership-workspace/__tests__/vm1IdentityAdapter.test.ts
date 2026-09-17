/**
 * VM1 identity adapter — fail-closed identity and reservation classification.
 * No financial totals. Does not load or mutate AVI_HOSTAWAY_STAYS.
 */

import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_IDENTITY,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from '../vm1Identity'
import {
  acceptVm1LedgerTransactionPropertyId,
  classifyVm1Reservation,
  loadVm1Identity,
  VM1_FORBIDDEN_MAPPING_RPC,
  vm1LedgerPropertyIdFilter,
  type VerifiedVm1Identity,
  type Vm1RpcClient,
} from '../vm1IdentityAdapter'

const VM2_PROPERTIES_ID = '2959c273-fc9f-40af-9659-347f52e7587f'
const VM2_CANONICAL_ID = 'c632463a-67f9-477d-8173-cd5f88ee92ac'
const NEER_CANONICAL_ID = 'b587f463-279d-4376-bb14-38789f34cbba'
const NEER_LISTING_ID = '426237'

const CERTIFIED = new Set<string>(['53139113'])

const VM1_VERIFIED: VerifiedVm1Identity = {
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
  hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
}

const FORGED_VM2_IDENTITY: VerifiedVm1Identity = {
  canonicalPropertyId: VM2_CANONICAL_ID,
  legacyLedgerPropertyId: VM2_PROPERTIES_ID,
  hostawayListingId: NEER_LISTING_ID,
}

function resolvedVm1() {
  return [
    {
      status: 'resolved',
      canonical_property_id: VM1_CANONICAL_PROPERTY_ID,
      canonical_name: 'Villa Mazotos',
      candidates: null,
    },
  ]
}

function bookingConfirmed(overrides: Record<string, unknown> = {}) {
  return {
    external_id: '53082517',
    external_property_id: VM1_HOSTAWAY_LISTING_ID,
    channel: 'booking',
    status: 'confirmed',
    check_in: '2026-09-11',
    check_out: '2026-09-13',
    nights: 2,
    total_price: 1218.2,
    cleaning_fee: 120,
    raw: {
      paymentStatus: 'Paid',
      cancellationDate: null,
      taxAmount: null,
      airbnbListingHostFee: null,
      airbnbExpectedPayoutAmount: null,
    },
    ...overrides,
  }
}

function mockClient(handlers: {
  resolve?: unknown
  resolveError?: { message: string }
  reservations?: unknown
  reservationsError?: { message: string }
}): { client: Vm1RpcClient; rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> } {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
  const client: Vm1RpcClient = {
    rpc: (name, args) => {
      rpcCalls.push({ name, args })
      if (name === 'resolve_property_canonical') {
        return Promise.resolve({
          data: handlers.resolve !== undefined ? handlers.resolve : resolvedVm1(),
          error: handlers.resolveError ?? null,
        })
      }
      if (name === 'pms_reservations_for_property') {
        return Promise.resolve({
          data: handlers.reservations !== undefined ? handlers.reservations : [],
          error: handlers.reservationsError ?? null,
        })
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } })
    },
  }
  return { client, rpcCalls }
}

describe('VM1 identity configuration', () => {
  it('holds the three identity values and is not a property_name filter', () => {
    expect(VM1_IDENTITY.canonicalPropertyId).toBe('4eb09c84-907a-404c-b19a-7856f73fadff')
    expect(VM1_IDENTITY.legacyLedgerPropertyId).toBe('48a08e6e-12a6-43af-a929-b3063ee6b909')
    expect(VM1_IDENTITY.hostawayListingId).toBe('412148')
    expect(VM1_IDENTITY.partnershipKey).toBe('vm1')
    expect(VM1_IDENTITY.partnershipKey).not.toBe('Villa Mazotos')
  })
})

describe('loadVm1Identity', () => {
  it('resolves the legacy UUID exactly to the canonical VM1 UUID', async () => {
    const { client, rpcCalls } = mockClient({ reservations: [] })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity.canonicalPropertyId).toBe(VM1_CANONICAL_PROPERTY_ID)
    expect(result.identity.legacyLedgerPropertyId).toBe(VM1_LEGACY_LEDGER_PROPERTY_ID)
    expect(vm1LedgerPropertyIdFilter(result.identity)).toBe(VM1_LEGACY_LEDGER_PROPERTY_ID)
    expect(rpcCalls[0]).toEqual({
      name: 'resolve_property_canonical',
      args: { p_input: VM1_LEGACY_LEDGER_PROPERTY_ID },
    })
  })

  it('fails closed on canonical mismatch', async () => {
    const { client } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: NEER_CANONICAL_ID,
          canonical_name: 'Apartment Neer Yoav Dekelia',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('Canonical mismatch')
    expect(result.reason).toContain(NEER_CANONICAL_ID)
  })

  it('fails closed on an ambiguous resolver response', async () => {
    const { client } = mockClient({
      resolve: [{ status: 'ambiguous', canonical_property_id: null, candidates: ['A', 'B'] }],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason.toLowerCase()).toContain('ambiguous')
  })

  it('fails closed on a conflict resolver response', async () => {
    const { client } = mockClient({
      resolve: [{ status: 'conflict', canonical_property_id: null, candidates: null }],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('conflict')
  })

  it('fails closed when the resolver returns no rows', async () => {
    const { client } = mockClient({ resolve: [] })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('no rows')
  })

  it('never calls the resolver with Villa Mazotos', async () => {
    const { client, rpcCalls } = mockClient({ reservations: [] })
    await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    const resolverArgs = rpcCalls.filter((c) => c.name === 'resolve_property_canonical')
    expect(resolverArgs).toHaveLength(1)
    expect(resolverArgs[0].args?.p_input).toBe(VM1_LEGACY_LEDGER_PROPERTY_ID)
    expect(resolverArgs[0].args?.p_input).not.toBe('Villa Mazotos')
    expect(JSON.stringify(rpcCalls)).not.toContain('Villa Mazotos')
  })

  it('calls pms_reservations_for_property with listing 412148', async () => {
    const { client, rpcCalls } = mockClient({ reservations: [] })
    await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    const resCall = rpcCalls.find((c) => c.name === 'pms_reservations_for_property')
    expect(resCall?.args?.p_external_id).toBe(VM1_HOSTAWAY_LISTING_ID)
    expect(resCall?.args?.p_external_id).toBe('412148')
  })

  it('never calls the property-name mapping RPC', async () => {
    const { client, rpcCalls } = mockClient({
      reservations: [bookingConfirmed()],
    })
    await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(rpcCalls.map((c) => c.name)).not.toContain(VM1_FORBIDDEN_MAPPING_RPC)
    expect(rpcCalls.map((c) => c.name)).not.toContain('pms_resolve_mapping')
  })

  it('marks 53139113 already certified and never operationally eligible', async () => {
    const { client } = mockClient({
      reservations: [
        {
          external_id: '53139113',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'airbnb',
          status: 'confirmed',
          check_in: '2026-08-15',
          check_out: '2026-08-29',
          nights: 14,
          total_price: 7463.28,
          cleaning_fee: 120,
          raw: {},
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations).toHaveLength(1)
    expect(result.reservations[0].disposition).toBe('already_certified')
    expect(result.reservations[0].disposition).not.toBe('operational_candidate')
  })

  it('marks 65733679 as a confirmed operational candidate', async () => {
    const { client } = mockClient({
      reservations: [
        {
          external_id: '65733679',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'airbnb',
          status: 'confirmed',
          check_in: '2026-09-03',
          check_out: '2026-09-06',
          nights: 3,
          total_price: 1005.9,
          cleaning_fee: 150,
          raw: {
            airbnbExpectedPayoutAmount: 849.99,
            airbnbListingHostFee: 155.91,
            taxAmount: 0,
          },
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations[0].externalId).toBe('65733679')
    expect(result.reservations[0].disposition).toBe('operational_candidate')
  })

  it('excludes cancelled 54720071', async () => {
    const { client } = mockClient({
      reservations: [
        {
          external_id: '54720071',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'booking',
          status: 'cancelled',
          check_in: '2026-09-01',
          check_out: '2026-09-10',
          nights: 9,
          total_price: 0,
          cleaning_fee: 120,
          raw: { cancellationDate: '2026-02-22 20:17:20' },
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations[0].disposition).toBe('excluded')
    expect(result.reservations[0].reason.toLowerCase()).toContain('cancelled')
  })

  it('excludes inquiry 65343332', async () => {
    const { client } = mockClient({
      reservations: [
        {
          external_id: '65343332',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'airbnb',
          status: 'inquiry',
          check_in: '2026-09-03',
          check_out: '2026-09-07',
          nights: 4,
          total_price: 2208,
          cleaning_fee: 150,
          raw: {},
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations[0].disposition).toBe('excluded')
    expect(result.reservations[0].reason.toLowerCase()).toContain('inquiry')
  })

  it('marks modified 54972355 as Needs Review', async () => {
    const { client } = mockClient({
      reservations: [
        {
          external_id: '54972355',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'booking',
          status: 'modified',
          check_in: '2026-09-22',
          check_out: '2026-09-26',
          nights: 4,
          total_price: 2365.5,
          cleaning_fee: 150,
          raw: {
            taxAmount: null,
            airbnbListingHostFee: null,
            airbnbExpectedPayoutAmount: null,
          },
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations[0].externalId).toBe('54972355')
    expect(result.reservations[0].disposition).toBe('needs_review')
    expect(result.reservations[0].disposition).not.toBe('operational_candidate')
  })

  it('keeps missing Booking financial fields as null', async () => {
    const { client } = mockClient({
      reservations: [bookingConfirmed()],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.reservations[0]
    expect(row.hostServiceFee).toBeNull()
    expect(row.expectedPayout).toBeNull()
    expect(row.taxAmount).toBeNull()
    expect(row.totalPrice).toBe(1218.2)
  })

  it('rejects the test-only wrong mapping 412148 → Neer', async () => {
    const { client } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: NEER_CANONICAL_ID,
          canonical_name: 'Apartment Neer Yoav Dekelia',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('Canonical mismatch')
  })

  it('fails closed if a reservation row is mapped to the Neer listing', async () => {
    const { client } = mockClient({
      reservations: [
        {
          external_id: '65733679',
          external_property_id: NEER_LISTING_ID,
          channel: 'airbnb',
          status: 'confirmed',
          check_in: '2026-09-03',
          check_out: '2026-09-06',
          nights: 3,
          total_price: 1005.9,
          cleaning_fee: 150,
          raw: {},
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('412148')
    expect(result.reason).toContain(NEER_LISTING_ID)
  })
})

describe('VM2 and historical ledger rows cannot enter', () => {
  it('rejects VM2 properties.id and VM2 canonical UUID as ledger filters', () => {
    expect(acceptVm1LedgerTransactionPropertyId(VM2_PROPERTIES_ID, VM1_VERIFIED).ok).toBe(false)
    expect(acceptVm1LedgerTransactionPropertyId(VM2_CANONICAL_ID, VM1_VERIFIED).ok).toBe(false)
    expect(acceptVm1LedgerTransactionPropertyId(NEER_CANONICAL_ID, VM1_VERIFIED).ok).toBe(false)
    expect(acceptVm1LedgerTransactionPropertyId(VM1_CANONICAL_PROPERTY_ID, VM1_VERIFIED).ok).toBe(false)
  })

  it('does not accept null-property_id historical ledger rows', () => {
    const accepted = acceptVm1LedgerTransactionPropertyId(null, VM1_VERIFIED)
    expect(accepted.ok).toBe(false)
    if (accepted.ok) return
    expect(accepted.reason.toLowerCase()).toContain('null')
  })

  it('accepts only the verified VM1 legacy ledger UUID', async () => {
    const { client } = mockClient({ reservations: [] })
    const loaded = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(acceptVm1LedgerTransactionPropertyId(VM1_LEGACY_LEDGER_PROPERTY_ID, loaded.identity).ok).toBe(true)
    expect(acceptVm1LedgerTransactionPropertyId(VM1_LEGACY_LEDGER_PROPERTY_ID, VM1_VERIFIED).ok).toBe(true)
  })

  it('rejects a forged VM2 VerifiedVm1Identity even when propertyId matches the forged legacy ID', () => {
    const accepted = acceptVm1LedgerTransactionPropertyId(VM2_PROPERTIES_ID, FORGED_VM2_IDENTITY)
    expect(accepted.ok).toBe(false)
    if (accepted.ok) return
    expect(accepted.reason.toLowerCase()).toContain('identity')
  })
})

describe('classifyVm1Reservation', () => {
  it('never returns 53139113 as an operational candidate', () => {
    const classified = classifyVm1Reservation(
      {
        externalId: '53139113',
        listingId: VM1_HOSTAWAY_LISTING_ID,
        status: 'confirmed',
        checkIn: '2026-08-15',
      },
      CERTIFIED,
    )
    expect(classified.disposition).toBe('already_certified')
  })

  it('treats confirmed check-in 2026-08-30 as an operational candidate', () => {
    const classified = classifyVm1Reservation(
      {
        externalId: 'boundary-0830',
        listingId: VM1_HOSTAWAY_LISTING_ID,
        status: 'confirmed',
        checkIn: '2026-08-30',
      },
      CERTIFIED,
    )
    expect(classified.disposition).toBe('operational_candidate')
  })

  it('excludes confirmed check-in 2026-08-29 from the new period', () => {
    const classified = classifyVm1Reservation(
      {
        externalId: 'before-period',
        listingId: VM1_HOSTAWAY_LISTING_ID,
        status: 'confirmed',
        checkIn: '2026-08-29',
      },
      CERTIFIED,
    )
    expect(classified.disposition).toBe('excluded')
  })

  it('returns needs_review for malformed and impossible check-in dates', () => {
    for (const checkIn of ['2026-13-40', '2026-9-3', 'not-a-date', '', '   ', '2026-02-30']) {
      const classified = classifyVm1Reservation(
        {
          externalId: 'bad-date',
          listingId: VM1_HOSTAWAY_LISTING_ID,
          status: 'confirmed',
          checkIn,
        },
        CERTIFIED,
      )
      expect(classified.disposition).toBe('needs_review')
      expect(classified.disposition).not.toBe('operational_candidate')
    }
  })

  it('never returns operational_candidate for listing 426237', () => {
    const classified = classifyVm1Reservation(
      {
        externalId: '65733679',
        listingId: NEER_LISTING_ID,
        status: 'confirmed',
        checkIn: '2026-09-03',
      },
      CERTIFIED,
    )
    expect(classified.disposition).not.toBe('operational_candidate')
    expect(classified.disposition).toBe('needs_review')
  })
})

describe('resolver and reservation RPC guards', () => {
  it('fails closed when the resolver returns two rows', async () => {
    const { client } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: VM1_CANONICAL_PROPERTY_ID,
          canonical_name: 'Villa Mazotos',
          candidates: null,
        },
        {
          status: 'resolved',
          canonical_property_id: VM1_CANONICAL_PROPERTY_ID,
          canonical_name: 'Villa Mazotos',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('2 rows')
  })

  it('fails closed when a resolved row has non-empty candidates', async () => {
    const { client } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: VM1_CANONICAL_PROPERTY_ID,
          canonical_name: 'Villa Mazotos',
          candidates: ['Villa Mazotos', 'Villa Mazotos 2'],
        },
      ],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason.toLowerCase()).toContain('ambiguous')
  })

  it('passes when a resolved row has candidates=[]', async () => {
    const { client } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: VM1_CANONICAL_PROPERTY_ID,
          canonical_name: 'Villa Mazotos',
          candidates: [],
        },
      ],
      reservations: [],
    })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(true)
  })

  it('fails invalid reservationFrom/reservationTo before the reservations RPC', async () => {
    const { client, rpcCalls } = mockClient({ reservations: [] })
    const result = await loadVm1Identity({
      client,
      certifiedReservationIds: CERTIFIED,
      reservationFrom: '2026-9-3',
      reservationTo: '2026-09-30',
    })
    expect(result.ok).toBe(false)
    expect(rpcCalls.map((c) => c.name)).toContain('resolve_property_canonical')
    expect(rpcCalls.map((c) => c.name)).not.toContain('pms_reservations_for_property')
  })

  it('fails a reversed date range before the reservations RPC', async () => {
    const { client, rpcCalls } = mockClient({ reservations: [] })
    const result = await loadVm1Identity({
      client,
      certifiedReservationIds: CERTIFIED,
      reservationFrom: '2026-09-30',
      reservationTo: '2026-08-25',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.toLowerCase()).toContain('reservationfrom')
    expect(rpcCalls.map((c) => c.name)).not.toContain('pms_reservations_for_property')
  })

  it('fails closed on duplicate reservation external_id without silent dedupe', async () => {
    const row = {
      external_id: '65733679',
      external_property_id: VM1_HOSTAWAY_LISTING_ID,
      channel: 'airbnb',
      status: 'confirmed',
      check_in: '2026-09-03',
      check_out: '2026-09-06',
      nights: 3,
      total_price: 1005.9,
      cleaning_fee: 150,
      raw: {},
    }
    const { client } = mockClient({ reservations: [row, { ...row }] })
    const result = await loadVm1Identity({ client, certifiedReservationIds: CERTIFIED })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('65733679')
    expect(result.reason.toLowerCase()).toContain('duplicate')
  })
})
