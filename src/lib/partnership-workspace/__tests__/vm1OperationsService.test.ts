import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID, VM1_LEGACY_LEDGER_PROPERTY_ID } from '../vm1Identity'
import { VM1_FORBIDDEN_MAPPING_RPC, type Vm1RpcClient } from '../vm1IdentityAdapter'
import { loadVm1OperationsView, type Vm1OperationsClient } from '../vm1OperationsService'
import type { Vm1OwnerStatementJwtClient } from '../vm1OwnerStatementStoreReader'
import {
  VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
} from '../vm1ExpenseAdmission'
import { VM1_EXPENSE_LEDGER_SELECT } from '../vm1ExpenseAdmissionService'
import { VM1_OS_EVIDENCE_REASON } from '../vm1OwnerStatementEvidence'
import { TM20_OS_TEST_DOCUMENT_HASH } from './vm1OwnerStatementEvidence.fixture'

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
  ownerStatementPayload?: unknown
  ownerStatementError?: { message: string } | null
}): {
  client: Vm1OperationsClient
  ownerStatementClient: Vm1OwnerStatementJwtClient
  rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
  osRpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }>
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
  const osRpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
  const ownerStatementClient: Vm1OwnerStatementJwtClient = {
    rpc: (name, args) => {
      osRpcCalls.push({ name, args })
      return Promise.resolve({
        data:
          handlers.ownerStatementPayload !== undefined
            ? handlers.ownerStatementPayload
            : { ok: false, reason: 'missing_evidence' },
        error: handlers.ownerStatementError !== undefined ? handlers.ownerStatementError : null,
      })
    },
  }
  return { client, ownerStatementClient, rpcCalls, osRpcCalls, expenseSelects }
}

describe('loadVm1OperationsView', () => {
  it('reads listing 412148 and never calls the name mapping RPC', async () => {
    const { client, ownerStatementClient, rpcCalls, osRpcCalls } = mockClient({ reservations: [] })
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
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
    expect(osRpcCalls.map((c) => c.name)).toEqual(['read_partnership_owner_statement_for_listing'])
    expect(osRpcCalls[0].args).toEqual({
      p_listing_id: VM1_HOSTAWAY_LISTING_ID,
      p_from: '2026-08-30',
      p_to: '2026-11-30',
    })
    expect(rpcCalls.map((c) => c.name)).not.toContain('read_partnership_owner_statement_for_listing')
    expect(rpcCalls.map((c) => c.name)).not.toContain('ingest_partnership_owner_statement_document')
    expect(osRpcCalls.map((c) => c.name)).not.toContain('ingest_partnership_owner_statement_document')
    expect(osRpcCalls.map((c) => c.name)).not.toContain('void_partnership_owner_statement_document')
  })

  it('does not call Hostaway when the date range is invalid', async () => {
    const { client, ownerStatementClient, rpcCalls, osRpcCalls, expenseSelects } = mockClient({})
    const result = await loadVm1OperationsView({
      client,
      ownerStatementClient,
      fromParam: '2026-09-30',
      toParam: '2026-08-25',
      now: NOW,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('invalid_range')
    expect(rpcCalls).toEqual([])
    expect(osRpcCalls).toEqual([])
    expect(expenseSelects).toEqual([])
    expect(result).not.toHaveProperty('expenseAdmission')
  })

  it('fails closed on Neer canonical identity', async () => {
    const { client, ownerStatementClient, rpcCalls, osRpcCalls, expenseSelects } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: NEER_CANONICAL_ID,
          canonical_name: 'Apartment Neer Yoav Dekelia',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(rpcCalls.map((c) => c.name)).not.toContain('pms_reservations_for_property')
    expect(expenseSelects).toEqual([])
  })

  it('fails closed if a reservation is on the Neer listing', async () => {
    const { client, ownerStatementClient, osRpcCalls, expenseSelects } = mockClient({
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
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(result.reason).toContain('412148')
    expect(expenseSelects).toEqual([])
  })

  it('fails closed on VM2 canonical identity', async () => {
    const { client, ownerStatementClient, osRpcCalls, expenseSelects } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: VM2_CANONICAL_ID,
          canonical_name: 'Villa Mazotos 2',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(expenseSelects).toEqual([])
    expect(osRpcCalls).toEqual([])
    expect(result).not.toHaveProperty('expenseAdmission')
  })

  it('labels 53139113 already certified from the frozen Avi stay collection', async () => {
    const { client, ownerStatementClient, osRpcCalls } = mockClient({
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
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reservations[0].disposition).toBe('already_certified')
    expect(result.forecastLines[0].recognitionState).toBe('excluded')
    expect(result.forecastLines[0].calculable).toBe(false)
    expect(result.forecastLines[0].propertyNet).toBeNull()
    expect(result.draftAdmissionLines[0].admissionState).toBe('excluded')
    expect(result.draftAdmissionLines[0].admittedCandidate).toBe(false)
  })

  it('admits zero Draft revenue without a stored Owner Statement and does not use test fixtures', async () => {
    const { client, ownerStatementClient, osRpcCalls } = mockClient({
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
        {
          external_id: '64232458',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'airbnb',
          status: 'confirmed',
          check_in: '2026-09-18',
          check_out: '2026-09-22',
          nights: 4,
          total_price: 2346,
          cleaning_fee: 150,
          raw: {
            airbnbExpectedPayoutAmount: 1982.37,
            airbnbListingHostFee: 363.63,
            taxAmount: 0,
          },
        },
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
            airbnbExpectedPayoutAmount: null,
            taxAmount: null,
          },
        },
        {
          external_id: '63995050',
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
    const asOf = new Date(Date.UTC(2026, 8, 19))
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: asOf })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ownerStatementEvidence.ok).toBe(false)
    if (result.ownerStatementEvidence.ok) return
    expect(result.ownerStatementEvidence.reason).toBe(VM1_OS_EVIDENCE_REASON.missingEvidence)
    expect(result.ownerStatementLines).toEqual([])
    expect(result.draftAdmissionLines.filter((l) => l.admittedCandidate)).toHaveLength(0)
    const airbnb = result.draftAdmissionLines.find((l) => l.externalId === '65733679')
    const booking = result.draftAdmissionLines.find((l) => l.externalId === '53082517')
    const future = result.draftAdmissionLines.find((l) => l.externalId === '64232458')
    const modified = result.draftAdmissionLines.find((l) => l.externalId === '54972355')
    expect(airbnb?.admissionState).toBe('completed_pending_authoritative_evidence')
    expect(airbnb?.admittedCandidate).toBe(false)
    expect(airbnb?.authoritativeEvidenceLinked).toBe(false)
    expect(booking?.admissionState).toBe('blocked')
    expect(booking?.admittedCandidate).toBe(false)
    expect(booking?.authoritativeEvidenceLinked).toBe(false)
    expect(future?.admissionState).toBe('forecast')
    expect(future?.admittedCandidate).toBe(false)
    expect(future?.authoritativeEvidenceLinked).toBe(false)
    expect(modified?.admissionState).toBe('needs_review')
    expect(modified?.admittedCandidate).toBe(false)
    expect(JSON.stringify(result.ownerStatementLines)).not.toContain('498.37')
    expect(JSON.stringify(result.ownerStatementLines)).not.toContain('716.78')
    expect(JSON.stringify(result.draftAdmissionLines)).not.toContain('594.25')
    expect(JSON.stringify(result)).not.toContain(TM20_OS_TEST_DOCUMENT_HASH)
  })

  it('loads the approved expense independently of zero revenue admission', async () => {
    const { client, ownerStatementClient, osRpcCalls, expenseSelects } = mockClient({
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
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expenseAdmission.admissionState).toBe('approved_future_draft_expense')
    expect(result.expenseAdmission.partnershipChargeEur).toBe(30)
    expect(result.expenseAdmission.jjActualCostEur).toBe(30)
    expect(result.expenseAdmission.jjOperatingProfitEur).toBe(0)
    expect(result.draftAdmissionLines[0].admissionState).toBe('completed_pending_authoritative_evidence')
    expect(result.draftAdmissionLines[0].admittedCandidate).toBe(false)
    expect(result.ownerStatementLines).toEqual([])
    expect(result.ownerStatementEvidence.ok).toBe(false)
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
    const { client, ownerStatementClient, osRpcCalls, expenseSelects } = mockClient({
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
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expenseAdmission.admissionState).toBe('blocked')
    expect(result.expenseAdmission.partnershipChargeEur).toBeNull()
    expect(result.expenseAdmission.jjActualCostEur).toBeNull()
    expect(result.expenseAdmission.jjOperatingProfitEur).toBeNull()
    expect(result.reservations[0].externalId).toBe('65733679')
    expect(result.identity.hostawayListingId).toBe('412148')
    expect(result.draftAdmissionLines[0].admittedCandidate).toBe(false)
    expect(result.draftAdmissionLines[0].admissionState).toBe('completed_pending_authoritative_evidence')
    expect(expenseSelects).toHaveLength(1)
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('payer')
  })

  it('does not SELECT expense when the identity resolver returns no rows', async () => {
    const { client, ownerStatementClient, osRpcCalls, expenseSelects } = mockClient({ resolve: [] })
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.kind).toBe('identity_blocked')
    expect(expenseSelects).toEqual([])
    expect(osRpcCalls).toEqual([])
    expect(result).not.toHaveProperty('expenseAdmission')
  })

  it('does not SELECT expense on canonical mismatch', async () => {
    const { client, ownerStatementClient, osRpcCalls, expenseSelects } = mockClient({
      resolve: [
        {
          status: 'resolved',
          canonical_property_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          canonical_name: 'Other property',
          candidates: null,
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
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
    expect(src).toContain('utcTodayIso(input.now)')
    expect(src).not.toContain('adaptVm1OwnerStatementEvidence')
    expect(src).not.toContain('authoritativeEvidenceByReservationId')
    expect(src).not.toContain(TM20_OS_TEST_DOCUMENT_HASH)
    expect(src).not.toContain('498.37')
    expect(src).not.toContain('716.78')
    expect(src).toContain('readVm1PartnershipOwnerStatementForListing')
    expect(src).not.toContain('VM1_OS_EVIDENCE_REASON.missingStore')
    expect(src).not.toContain('ingest_partnership_owner_statement_document')
    expect(src).not.toContain('void_partnership_owner_statement_document')
  })

  it('does not admit stored Owner Statement lines or split partner shares', async () => {
    const { client, ownerStatementClient, osRpcCalls } = mockClient({
      ownerStatementPayload: {
        ok: true,
        listing_id: VM1_HOSTAWAY_LISTING_ID,
        period_from: '2026-08-30',
        period_to: '2026-11-30',
        documents: [{ id: '11111111-1111-4111-8111-111111111111', listing_id: VM1_HOSTAWAY_LISTING_ID }],
        lines: [
          {
            reservation_id: '65733679',
            check_in: '2026-09-03',
            check_out: '2026-09-06',
            currency: 'EUR',
            net_owner_payout: 498.37,
          },
          {
            reservation_id: '53139113',
            check_in: '2026-08-20',
            check_out: '2026-08-25',
            currency: 'EUR',
            net_owner_payout: 999.99,
          },
        ],
      },
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
          external_id: '53139113',
          external_property_id: VM1_HOSTAWAY_LISTING_ID,
          channel: 'airbnb',
          status: 'confirmed',
          check_in: '2026-08-15',
          check_out: '2026-08-29',
          nights: 14,
          total_price: 100,
          cleaning_fee: 0,
          raw: {},
        },
      ],
    })
    const result = await loadVm1OperationsView({ client, ownerStatementClient, now: NOW })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ownerStatementEvidence.ok).toBe(true)
    expect(result.ownerStatementEvidence.kind).toBe('effective')
    expect(result.ownerStatementLines.map((l) => l.reservationId)).toEqual(['65733679'])
    expect(result.draftAdmissionLines.filter((l) => l.admittedCandidate)).toHaveLength(0)
    expect(result.draftAdmissionLines.find((l) => l.externalId === '65733679')?.authoritativeEvidenceLinked).toBe(false)
    expect(result.draftAdmissionLines.find((l) => l.externalId === '53139113')?.admissionState).toBe('excluded')
    expect(JSON.stringify(result)).not.toContain('50%')
    expect(JSON.stringify(result)).not.toContain('25%')
    expect(JSON.stringify(result)).not.toContain('594.25')
    expect(osRpcCalls.map((c) => c.name)).toEqual(['read_partnership_owner_statement_for_listing'])
  })
})
