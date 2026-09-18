import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID, VM1_LEGACY_LEDGER_PROPERTY_ID } from '../vm1Identity'
import { VM1_FORBIDDEN_MAPPING_RPC, type Vm1RpcClient } from '../vm1IdentityAdapter'
import { loadVm1OperationsView, type Vm1OperationsClient } from '../vm1OperationsService'
import {
  VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
} from '../vm1ExpenseAdmission'
import { VM1_EXPENSE_LEDGER_SELECT } from '../vm1ExpenseAdmissionService'

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
  expenseRows?: unknown
}): {
  client: Vm1OperationsClient
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
  expenseSelects: Array<{ relation: string; columns: string; filters: Array<[string, string]> }>
} {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
  const expenseSelects: Array<{ relation: string; columns: string; filters: Array<[string, string]> }> = []
  const rpcClient: Vm1RpcClient = {
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
  const client = {
    ...rpcClient,
    from(relation: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                eq(column2: string, value2: string) {
                  expenseSelects.push({
                    relation,
                    columns,
                    filters: [
                      [column, value],
                      [column2, value2],
                    ],
                  })
                  return Promise.resolve({
                    data: handlers.expenseRows !== undefined ? handlers.expenseRows : [],
                    error: null,
                  })
                },
              }
            },
          }
        },
      }
    },
  }
  return { client, rpcCalls, expenseSelects }
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
    const { client, rpcCalls, expenseSelects } = mockClient({})
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
    expect(expenseSelects).toEqual([])
    expect(result).not.toHaveProperty('expenseAdmission')
  })

  it('fails closed on Neer canonical identity', async () => {
    const { client, rpcCalls, expenseSelects } = mockClient({
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
    expect(expenseSelects).toEqual([])
  })

  it('fails closed if a reservation is on the Neer listing', async () => {
    const { client, expenseSelects } = mockClient({
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
    expect(expenseSelects).toEqual([])
  })

  it('fails closed on VM2 canonical identity', async () => {
    const { client, expenseSelects } = mockClient({
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
    expect(expenseSelects).toEqual([])
    expect(result).not.toHaveProperty('expenseAdmission')
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

  it('loads the approved expense independently of zero revenue admission', async () => {
    const { client, expenseSelects } = mockClient({
      expenseRows: [
        {
          id: VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
          date: '2026-09-06',
          property_id: VM1_LEGACY_LEDGER_PROPERTY_ID,
          category: 'Airbnb',
          subcategory: 'Internet',
          amount_eur: 30,
          client_charge: null,
          review_status: 'active',
          is_deleted: false,
        },
      ],
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
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expenseAdmission.admissionState).toBe('approved_future_draft_expense')
    expect(result.expenseAdmission.partnershipChargeEur).toBe(30)
    expect(result.expenseAdmission.jjActualCostEur).toBe(30)
    expect(result.expenseAdmission.jjOperatingProfitEur).toBe(0)
    expect(result.draftAdmissionLines.every((l) => l.admittedCandidate === false)).toBe(true)
    expect(result.draftAdmissionLines[0].admissionState).toBe('completed_pending_authoritative_evidence')
    expect(expenseSelects).toEqual([
      {
        relation: 'transactions',
        columns: VM1_EXPENSE_LEDGER_SELECT,
        filters: [
          ['id', VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID],
          ['property_id', VM1_LEGACY_LEDGER_PROPERTY_ID],
        ],
      },
    ])
  })

  it('keeps reservations visible when verified identity meets a missing expense row', async () => {
    const { client, expenseSelects } = mockClient({
      expenseRows: [],
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
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expenseAdmission.admissionState).toBe('blocked')
    expect(result.expenseAdmission.partnershipChargeEur).toBeNull()
    expect(result.expenseAdmission.jjActualCostEur).toBeNull()
    expect(result.expenseAdmission.jjOperatingProfitEur).toBeNull()
    expect(result.reservations[0].externalId).toBe('65733679')
    expect(result.identity.hostawayListingId).toBe('412148')
    expect(result.draftAdmissionLines.every((l) => l.admittedCandidate === false)).toBe(true)
    expect(expenseSelects).toHaveLength(1)
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('payer')
  })

  it('does not SELECT expense when the identity resolver returns no rows', async () => {
    const { client, expenseSelects } = mockClient({ resolve: [] })
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(expenseSelects).toEqual([])
    expect(result).not.toHaveProperty('expenseAdmission')
  })

  it('does not SELECT expense on canonical mismatch', async () => {
    const { client, expenseSelects } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          canonical_name: 'Other property',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(result.reason.toLowerCase()).toContain('canonical')
    expect(expenseSelects).toEqual([])
  })

  it('loads identity before the expense SELECT', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/partnership-workspace/vm1OperationsService.ts'),
      'utf8',
    )
    const identityCall = src.indexOf('const loaded = await loadVm1Identity')
    const expenseCall = src.indexOf('await loadVm1ApprovedFutureDraftExpense({')
    const identityFail = src.indexOf('if (!loaded.ok)')
    expect(identityCall).toBeGreaterThan(-1)
    expect(expenseCall).toBeGreaterThan(identityCall)
    expect(identityFail).toBeGreaterThan(identityCall)
    expect(identityFail).toBeLessThan(expenseCall)
    expect(src).toContain('verifiedIdentity: loaded.identity')
  })
})
