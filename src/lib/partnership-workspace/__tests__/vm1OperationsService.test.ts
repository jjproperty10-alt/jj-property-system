import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID, VM1_LEGACY_LEDGER_PROPERTY_ID } from '../vm1Identity'
import { VM1_FORBIDDEN_MAPPING_RPC, type Vm1RpcClient } from '../vm1IdentityAdapter'
import { loadVm1OperationsView } from '../vm1OperationsService'

const NEER_CANONICAL_ID = 'b587f463-279d-4376-bb14-38789f34cbba'
const NEER_LISTING_ID = '426237'
const VM2_CANONICAL_ID = 'c632463a-67f9-477d-8173-cd5f88ee92ac'
const NOW = new Date(Date.UTC(2026, 8, 17))

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

function mockClient(handlers: {
  resolve?: unknown
  reservations?: unknown
}): {
  client: Vm1RpcClient
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
} {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
  const client: Vm1RpcClient = {
    rpc: (name, args) => {
      rpcCalls.push({ name, args })
      if (name === 'resolve_property_canonical') {
        return Promise.resolve({
          data: handlers.resolve !== undefined ? handlers.resolve : resolvedVm1(),
          error: null,
        })
      }
      if (name === 'pms_reservations_for_property') {
        return Promise.resolve({
          data: handlers.reservations !== undefined ? handlers.reservations : [],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } })
    },
  }
  return { client, rpcCalls }
}

describe('loadVm1OperationsView', () => {
  it('reads listing 412148 and never calls the name mapping RPC', async () => {
    const { client, rpcCalls } = mockClient({ reservations: [] })
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.identity.hostawayListingId).toBe('412148')
    expect(result.identity.canonicalPropertyId).toBe(VM1_CANONICAL_PROPERTY_ID)
    expect(result.identity.legacyLedgerPropertyId).toBe(VM1_LEGACY_LEDGER_PROPERTY_ID)
    expect(rpcCalls.map((c) => c.name)).toEqual([
      'resolve_property_canonical',
      'pms_reservations_for_property',
    ])
    expect(rpcCalls[0].args?.p_input).toBe(VM1_LEGACY_LEDGER_PROPERTY_ID)
    expect(rpcCalls[1].args?.p_external_id).toBe(VM1_HOSTAWAY_LISTING_ID)
    expect(rpcCalls.map((c) => c.name)).not.toContain(VM1_FORBIDDEN_MAPPING_RPC)
    expect(JSON.stringify(rpcCalls)).not.toContain('Villa Mazotos')
    expect(JSON.stringify(rpcCalls)).not.toContain('pms_resolve_mapping')
  })

  it('does not call Hostaway when the date range is invalid', async () => {
    const { client, rpcCalls } = mockClient({})
    const result = await loadVm1OperationsView({
      client,
      fromParam: '2026-09-30',
      toParam: '2026-08-25',
      now: NOW,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('invalid_range')
    expect(rpcCalls).toEqual([])
  })

  it('fails closed on Neer canonical identity', async () => {
    const { client, rpcCalls } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: NEER_CANONICAL_ID,
          canonical_name: 'Apartment Neer Yoav Dekelia',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(rpcCalls.map((c) => c.name)).not.toContain('pms_reservations_for_property')
  })

  it('fails closed if a reservation is on the Neer listing', async () => {
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
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(result.reason).toContain('412148')
  })

  it('fails closed on VM2 canonical identity', async () => {
    const { client } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: VM2_CANONICAL_ID,
          canonical_name: 'Villa Mazotos 2',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
  })

  it('labels 53139113 already certified from the frozen Avi stay collection', async () => {
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
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations[0].disposition).toBe('already_certified')
    expect(result.forecastLines[0].recognitionState).toBe('excluded')
    expect(result.forecastLines[0].calculable).toBe(false)
    expect(result.forecastLines[0].propertyNet).toBeNull()
    expect(result.draftAdmissionLines[0].admissionState).toBe('excluded')
    expect(result.draftAdmissionLines[0].admittedCandidate).toBe(false)
  })

  it('forecasts Airbnb 65733679 and blocks Booking without payout', async () => {
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
        {
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
            channelCommissionAmount: 182.73,
            airbnbExpectedPayoutAmount: null,
            taxAmount: null,
          },
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const airbnb = result.forecastLines.find((l) => l.externalId === '65733679')
    const booking = result.forecastLines.find((l) => l.externalId === '53082517')
    expect(airbnb?.calculable).toBe(true)
    expect(airbnb?.propertyNet).toBe(498.37)
    expect(airbnb?.recognitionState).toBe('completed_pending_reconciliation')
    expect(booking?.calculable).toBe(false)
    expect(booking?.recognitionState).toBe('blocked')
    expect(booking?.propertyNet).toBeNull()
    expect(result.reservations.find((r) => r.externalId === '65733679')?.disposition).toBe(
      'operational_candidate',
    )
    const airbnbAdmission = result.draftAdmissionLines.find((l) => l.externalId === '65733679')
    const bookingAdmission = result.draftAdmissionLines.find((l) => l.externalId === '53082517')
    expect(airbnbAdmission?.admissionState).toBe('completed_pending_authoritative_evidence')
    expect(airbnbAdmission?.admittedCandidate).toBe(false)
    expect(airbnbAdmission?.periodMember).toBe(true)
    expect(airbnbAdmission?.checkoutCompleted).toBe(true)
    expect(airbnbAdmission?.operationalEvidencePresent).toBe(true)
    expect(bookingAdmission?.admissionState).toBe('blocked')
    expect(bookingAdmission?.admittedCandidate).toBe(false)
    expect(result.draftAdmissionLines.every((l) => l.admittedCandidate === false)).toBe(true)
    expect(JSON.stringify(result.draftAdmissionLines)).not.toContain('594.25')
  })
})
