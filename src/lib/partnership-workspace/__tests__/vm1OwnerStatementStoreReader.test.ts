jest.mock('server-only', () => ({}))

import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID } from '../vm1Identity'
import { VM1_OS_EVIDENCE_REASON } from '../vm1OwnerStatementEvidence'
import {
  readVm1PartnershipOwnerStatementForListing,
  VM1_OS_READER_RPC,
  type Vm1OwnerStatementJwtClient,
} from '../vm1OwnerStatementStoreReader'

const NEER_LISTING_ID = '426237'

function jwtClient(
  payload: unknown,
  error: { message: string } | null = null,
): { client: Vm1OwnerStatementJwtClient; calls: Array<{ name: string; args?: Record<string, unknown> }> } {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
  return {
    client: {
      rpc: (name, args) => {
        calls.push({ name, args })
        return Promise.resolve({ data: payload, error })
      },
    },
    calls,
  }
}

describe('readVm1PartnershipOwnerStatementForListing', () => {
  it('calls the staff reader RPC with listing 412148 and the Initial partnership period', async () => {
    const { client, calls } = jwtClient({ ok: false, reason: 'missing_evidence' })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: VM1_HOSTAWAY_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read).toEqual({
      ok: false,
      kind: 'missing_evidence',
      reason: VM1_OS_EVIDENCE_REASON.missingEvidence,
    })
    expect(calls).toEqual([
      {
        name: VM1_OS_READER_RPC,
        args: {
          p_listing_id: '412148',
          p_from: '2026-08-30',
          p_to: '2026-11-30',
        },
      },
    ])
  })

  it('does not call the RPC for a non-VM1 listing', async () => {
    const { client, calls } = jwtClient({ ok: true })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: NEER_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.kind).toBe('unavailable')
    expect(calls).toEqual([])
  })

  it('maps auth failure to unavailable, not empty income', async () => {
    const { client } = jwtClient(null, { message: '[jj_auth] Authenticated session required.' })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: VM1_HOSTAWAY_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read).toEqual({
      ok: false,
      kind: 'unavailable',
      reason: VM1_OS_EVIDENCE_REASON.readerUnavailable,
    })
    expect(JSON.stringify(read)).not.toContain('0')
  })

  it('maps reservation conflict without ids or amounts', async () => {
    const { client } = jwtClient({
      ok: false,
      reason: 'reservation_conflict',
      reservation_id: '65733679',
      amount: 498.37,
    })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: VM1_HOSTAWAY_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read).toEqual({
      ok: false,
      kind: 'conflict',
      reason: VM1_OS_EVIDENCE_REASON.conflict,
    })
    expect(JSON.stringify(read)).not.toContain('65733679')
    expect(JSON.stringify(read)).not.toContain('498.37')
  })

  it('fails closed on a hash-bearing payload', async () => {
    const { client } = jwtClient({
      ok: true,
      listing_id: '412148',
      period_from: '2026-08-30',
      period_to: '2026-11-30',
      documents: [],
      lines: [
        {
          reservation_id: '65733679',
          check_in: '2026-09-03',
          check_out: '2026-09-06',
          net_owner_payout: 498.37,
          sha256: 'b2945e7fb84452ff08f2cee224bd8cd960ca1ba85b2941968d5ce108c5f79951',
        },
      ],
    })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: VM1_HOSTAWAY_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.kind).toBe('unavailable')
    expect(read.reason).toBe(VM1_OS_EVIDENCE_REASON.malformed)
    expect(JSON.stringify(read)).not.toContain('b2945e7f')
  })

  it('fails closed on a malformed success payload', async () => {
    const { client } = jwtClient({ ok: true, listing_id: '412148' })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: VM1_HOSTAWAY_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.kind).toBe('unavailable')
    expect(read.reason).toBe(VM1_OS_EVIDENCE_REASON.malformed)
  })

  it('returns sanitized lines for a valid store payload', async () => {
    const { client } = jwtClient({
      ok: true,
      listing_id: '412148',
      period_from: '2026-08-30',
      period_to: '2026-11-30',
      documents: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          listing_id: '412148',
          statement_from: '2026-08-30',
          statement_to: '2026-11-30',
          verified_at: '2026-09-21T00:00:00+00:00',
        },
      ],
      lines: [
        {
          document_id: '22222222-2222-4222-8222-222222222222',
          reservation_id: '65733679',
          check_in: '2026-09-03',
          check_out: '2026-09-06',
          currency: 'EUR',
          net_owner_payout: 498.37,
        },
      ],
    })
    const read = await readVm1PartnershipOwnerStatementForListing({
      client,
      listingId: VM1_HOSTAWAY_LISTING_ID,
      canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
    })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.kind).toBe('effective')
    expect(read.lines).toEqual([
      {
        reservationId: '65733679',
        checkIn: '2026-09-03',
        checkOut: '2026-09-06',
        netOwnerPayoutEur: 498.37,
      },
    ])
    expect(JSON.stringify(read)).not.toContain('sha256')
    expect(JSON.stringify(read)).not.toContain('b2945e7f')
  })

  it('does not import ingest or void wrappers', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/partnership-workspace/vm1OwnerStatementStoreReader.ts'),
      'utf8',
    )
    expect(src).toContain(VM1_OS_READER_RPC)
    expect(src).not.toContain('ingest_partnership_owner_statement_document')
    expect(src).not.toContain('void_partnership_owner_statement_document')
    expect(src).toContain("import 'server-only'")
  })
})
