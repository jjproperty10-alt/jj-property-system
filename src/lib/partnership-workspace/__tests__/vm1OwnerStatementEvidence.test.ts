import * as fs from 'fs'
import * as path from 'path'
import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from '../vm1Identity'
import {
  adaptVm1OwnerStatementEvidence,
  ownerStatementInventoryFromReservations,
  VM1_OS_EVIDENCE_REASON,
  VM1_OS_SOURCE_KIND,
  type Vm1OwnerStatementDocument,
  type Vm1OwnerStatementInventoryReservation,
  type Vm1OsVerifiedIdentity,
} from '../vm1OwnerStatementEvidence'
import {
  TM20_OS_TEST_DOCUMENT,
  TM20_OS_TEST_DOCUMENT_HASH,
  TM20_OS_TEST_IDENTITY,
} from './vm1OwnerStatementEvidence.fixture'

const NEER_CANONICAL_ID = 'b587f463-279d-4376-bb14-38789f34cbba'
const NEER_LISTING_ID = '426237'
const VM2_CANONICAL_ID = 'c632463a-67f9-477d-8173-cd5f88ee92ac'
const VM2_LISTING_ID = '999001'
const OTHER_VALID_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function inventory(
  rows: readonly Vm1OwnerStatementInventoryReservation[],
) {
  return ownerStatementInventoryFromReservations(rows)
}

function stay(
  overrides: Partial<Vm1OwnerStatementInventoryReservation> &
    Pick<Vm1OwnerStatementInventoryReservation, 'externalId' | 'checkIn' | 'checkOut'>,
): Vm1OwnerStatementInventoryReservation {
  return {
    listingId: VM1_HOSTAWAY_LISTING_ID,
    ...overrides,
  }
}

const LIVE_INVENTORY = inventory([
  stay({ externalId: '63995050', checkIn: '2026-09-03', checkOut: '2026-09-07' }),
  stay({ externalId: '65343332', checkIn: '2026-09-03', checkOut: '2026-09-07' }),
  stay({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
  stay({ externalId: '53082517', checkIn: '2026-09-11', checkOut: '2026-09-13' }),
  stay({ externalId: '52454782', checkIn: '2026-09-18', checkOut: '2026-09-19' }),
  stay({ externalId: '64232458', checkIn: '2026-09-18', checkOut: '2026-09-22' }),
  stay({ externalId: '54972355', checkIn: '2026-09-22', checkOut: '2026-09-26' }),
])

function mutateLine(
  checkIn: string,
  patch: Partial<Vm1OwnerStatementDocument['lines'][number]>,
): Vm1OwnerStatementDocument {
  return {
    ...TM20_OS_TEST_DOCUMENT,
    lines: TM20_OS_TEST_DOCUMENT.lines.map((line) =>
      line.checkIn === checkIn ? { ...line, ...patch } : line,
    ),
  }
}

function adapt(input?: {
  readonly identity?: Vm1OsVerifiedIdentity
  readonly document?: Vm1OwnerStatementDocument
  readonly inventory?: ReturnType<typeof ownerStatementInventoryFromReservations>
}) {
  return adaptVm1OwnerStatementEvidence({
    identity: input?.identity ?? TM20_OS_TEST_IDENTITY,
    document: input?.document ?? TM20_OS_TEST_DOCUMENT,
    inventory: input?.inventory ?? LIVE_INVENTORY,
  })
}

describe('adaptVm1OwnerStatementEvidence', () => {
  it('keeps the Production adapter free of stay-level fixtures and contact fields', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partnership-workspace/vm1OwnerStatementEvidence.ts'),
      'utf8',
    )
    expect(src.startsWith("import 'server-only'") || src.includes("\nimport 'server-only'")).toBe(true)
    expect(src).toContain("import 'server-only'")
    expect(src.indexOf("import 'server-only'")).toBeLessThan(src.indexOf('adaptVm1OwnerStatementEvidence'))
    expect(src).not.toContain('guest')
    expect(src).not.toContain('Guest')
    expect(src).not.toContain('.xlsx')
    expect(src).not.toContain('OWNER_MINIMAL')
    expect(src).not.toContain('property_name')
    expect(src).not.toContain('594.25')
    expect(src).not.toContain('50%')
    expect(src).not.toContain('25%')
    expect(src).not.toMatch(/guestName|guest_name/)
    expect(src).not.toContain(TM20_OS_TEST_DOCUMENT_HASH)
    expect(src).not.toContain('498.37')
    expect(src).not.toContain('716.78')
    expect(src).not.toContain('1307.78')
    expect(src).not.toContain('1458.26')
    expect(src).toContain('unique check-in + check-out')
    expect(src).toContain(VM1_OS_EVIDENCE_REASON.identityKeys)
  })

  it('binds unique 412148 date pairs from a caller-supplied document and reuses one hash', () => {
    const result = adapt()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.documentHash).toBe(TM20_OS_TEST_DOCUMENT_HASH)
    expect(result.verificationStatus).toBe('verified')
    expect(result.lines.map((l) => l.reservationId)).toEqual([
      '65733679',
      '53082517',
      '64232458',
      '54972355',
    ])
    expect(result.lines.every((l) => l.documentHash === TM20_OS_TEST_DOCUMENT_HASH)).toBe(true)
    expect(result.lines.every((l) => l.sourceKind === VM1_OS_SOURCE_KIND)).toBe(true)
    expect(result.lines.find((l) => l.reservationId === '65733679')?.netOwnerPayoutEur).toBe(498.37)
    expect(result.lines.find((l) => l.reservationId === '53082517')?.netOwnerPayoutEur).toBe(716.78)
    expect(result.lines.find((l) => l.reservationId === '64232458')?.netOwnerPayoutEur).toBe(1307.78)
    expect(result.lines.find((l) => l.reservationId === '54972355')?.netOwnerPayoutEur).toBe(1458.26)
    expect(result.evidenceByReservationId.get('53082517')?.payoutEur).toBe(716.78)
    expect(result.evidenceByReservationId.get('53082517')?.sourceId).toBe(TM20_OS_TEST_DOCUMENT_HASH)
    expect(JSON.stringify(result.lines)).not.toContain('849.99')
    expect(JSON.stringify(result.lines)).not.toContain('guest')
  })

  it('requires the exact VM1 identity triple', () => {
    const ok = adapt({ identity: { ...TM20_OS_TEST_IDENTITY } })
    expect(ok.ok).toBe(true)

    const wrongCanonical = adapt({
      identity: { ...TM20_OS_TEST_IDENTITY, canonicalPropertyId: NEER_CANONICAL_ID },
    })
    expect(wrongCanonical.ok).toBe(false)
    if (!wrongCanonical.ok) {
      expect(wrongCanonical.reason).toBe(VM1_OS_EVIDENCE_REASON.identity)
    }

    const swapped = adapt({
      identity: {
        canonicalPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
        legacyLedgerPropertyId: VM1_CANONICAL_PROPERTY_ID,
        hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
      },
    })
    expect(swapped.ok).toBe(false)
    if (!swapped.ok) {
      expect(swapped.reason).toBe(VM1_OS_EVIDENCE_REASON.identity)
    }
  })

  it('fails closed on VM2 or Neer identity', () => {
    const neer = adapt({
      identity: {
        canonicalPropertyId: NEER_CANONICAL_ID,
        legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
        hostawayListingId: NEER_LISTING_ID,
      },
    })
    expect(neer.ok).toBe(false)
    if (!neer.ok) expect(neer.reason).toBe(VM1_OS_EVIDENCE_REASON.identity)

    const vm2 = adapt({
      identity: {
        canonicalPropertyId: VM2_CANONICAL_ID,
        legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
        hostawayListingId: VM2_LISTING_ID,
      },
    })
    expect(vm2.ok).toBe(false)
    if (!vm2.ok) expect(vm2.reason).toBe(VM1_OS_EVIDENCE_REASON.identity)
  })

  it('accepts uppercase SHA-256 of the same caller-supplied digest', () => {
    const result = adapt({
      document: {
        ...TM20_OS_TEST_DOCUMENT,
        documentHash: TM20_OS_TEST_DOCUMENT_HASH.toUpperCase(),
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.documentHash).toBe(TM20_OS_TEST_DOCUMENT_HASH)
  })

  it('accepts any well-formed 64-character hex digest and does not pin a Production constant', () => {
    const result = adapt({
      document: { ...TM20_OS_TEST_DOCUMENT, documentHash: OTHER_VALID_HASH },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.documentHash).toBe(OTHER_VALID_HASH)
    expect(result.lines).toHaveLength(4)
  })

  it('fails closed on a malformed document hash', () => {
    for (const documentHash of [
      '',
      'not-a-hash',
      'abc',
      'a'.repeat(63),
      'a'.repeat(65),
      `${'g'.repeat(64)}`,
    ]) {
      const result = adapt({
        document: { ...TM20_OS_TEST_DOCUMENT, documentHash },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.documentHash)
      }
    }
  })

  it('fails closed on a wrong listing', () => {
    const documentListing = adapt({
      document: { ...TM20_OS_TEST_DOCUMENT, listingId: NEER_LISTING_ID },
    })
    expect(documentListing.ok).toBe(false)
    if (!documentListing.ok) {
      expect(documentListing.reason).toBe(VM1_OS_EVIDENCE_REASON.listing)
    }

    const lineListing = adapt({
      document: mutateLine('2026-09-03', { listingId: NEER_LISTING_ID }),
    })
    expect(lineListing.ok).toBe(false)
    if (!lineListing.ok) {
      expect(lineListing.reason).toBe(VM1_OS_EVIDENCE_REASON.listing)
    }

    const inventoryListing = adapt({
      inventory: { listingId: NEER_LISTING_ID, reservations: LIVE_INVENTORY.reservations },
    })
    expect(inventoryListing.ok).toBe(false)
    if (!inventoryListing.ok) {
      expect(inventoryListing.reason).toBe(VM1_OS_EVIDENCE_REASON.inventoryListing)
    }
  })

  it('fails closed when a date pair has zero inventory matches', () => {
    const result = adapt({
      inventory: inventory([
        stay({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
      ]),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.zeroMatch)
  })

  it('fails closed when check-in and check-out match more than one 412148 row', () => {
    const result = adapt({
      inventory: inventory([
        stay({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
        stay({ externalId: '65733680', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
      ]),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.manyMatch)
  })

  it('binds only the unique date pair and ignores same-check-in rows with a different checkout', () => {
    const result = adapt()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.evidenceByReservationId.has('65733679')).toBe(true)
    expect(result.evidenceByReservationId.has('63995050')).toBe(false)
    expect(result.evidenceByReservationId.has('65343332')).toBe(false)
  })

  it('treats identical duplicate document lines as idempotent and never creates a second income row', () => {
    const first = TM20_OS_TEST_DOCUMENT.lines[0]
    const result = adapt({
      document: {
        ...TM20_OS_TEST_DOCUMENT,
        lines: [first, first, ...TM20_OS_TEST_DOCUMENT.lines.slice(1)],
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines.filter((l) => l.reservationId === '65733679')).toHaveLength(1)
    expect(result.lines.find((l) => l.reservationId === '65733679')?.netOwnerPayoutEur).toBe(498.37)
  })

  it('fails closed on a duplicate reservation external_id in inventory', () => {
    const result = adapt({
      inventory: inventory([
        stay({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
        stay({ externalId: '65733679', checkIn: '2026-09-11', checkOut: '2026-09-13' }),
      ]),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.duplicateInventoryId)
  })

  it('fails closed when the same evidence key is repeated with altered amounts', () => {
    const first = TM20_OS_TEST_DOCUMENT.lines[0]
    const result = adapt({
      document: {
        ...TM20_OS_TEST_DOCUMENT,
        lines: [first, { ...first, netOwnerPayoutEur: 498.38 }, ...TM20_OS_TEST_DOCUMENT.lines.slice(1)],
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.amountConflict)
  })

  it('fails closed when a verified amount is altered by one cent', () => {
    const result = adapt({
      document: mutateLine('2026-09-03', { netOwnerPayoutEur: 498.38 }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines.find((l) => l.reservationId === '65733679')?.netOwnerPayoutEur).toBe(498.38)

    const conflict = adapt({
      document: {
        ...TM20_OS_TEST_DOCUMENT,
        lines: [
          TM20_OS_TEST_DOCUMENT.lines[0],
          { ...TM20_OS_TEST_DOCUMENT.lines[0], netOwnerPayoutEur: 498.38 },
        ],
      },
      inventory: inventory([
        stay({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
      ]),
    })
    expect(conflict.ok).toBe(false)
    if (conflict.ok) return
    expect(conflict.reason).toBe(VM1_OS_EVIDENCE_REASON.amountConflict)
  })

  it('fails closed on negative, NaN, or non-finite amounts', () => {
    for (const netOwnerPayoutEur of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = adapt({
        document: mutateLine('2026-09-03', { netOwnerPayoutEur }),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.amounts)
      }
    }
  })

  it('binds Booking rows from Owner Statement amounts without RPC expected payout', () => {
    const result = adapt()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const booking = result.evidenceByReservationId.get('53082517')
    expect(booking?.payoutEur).toBe(716.78)
    expect(booking?.cleaningEur).toBe(120)
    expect(booking?.payoutEur).not.toBe(1218.2)
    expect(booking?.payoutEur).not.toBe(849.99)
  })

  it('does not add platform fee on top of Net Owner Payout', () => {
    const result = adapt()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const airbnb = result.evidenceByReservationId.get('65733679')
    expect(airbnb?.payoutEur).toBe(498.37)
    expect(airbnb?.payoutEur).not.toBe(498.37 + 82.94)
    expect(airbnb?.payoutEur).not.toBe(932.93)
  })

  it('does not use amount as an identity key when dates collide', () => {
    const result = adapt({
      inventory: inventory([
        stay({ externalId: 'wrong-amount-twin', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
        stay({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
      ]),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(VM1_OS_EVIDENCE_REASON.manyMatch)
  })

  it('fails closed on empty lines, wrong sourceKind, or unverified status', () => {
    const empty = adapt({ document: { ...TM20_OS_TEST_DOCUMENT, lines: [] } })
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.reason).toBe(VM1_OS_EVIDENCE_REASON.missingLines)

    const kind = adapt({
      document: { ...TM20_OS_TEST_DOCUMENT, sourceKind: 'bank_receipt' as typeof VM1_OS_SOURCE_KIND },
    })
    expect(kind.ok).toBe(false)
    if (!kind.ok) expect(kind.reason).toBe(VM1_OS_EVIDENCE_REASON.sourceKind)

    const unverified = adapt({
      document: { ...TM20_OS_TEST_DOCUMENT, verificationStatus: 'draft' as 'verified' },
    })
    expect(unverified.ok).toBe(false)
    if (!unverified.ok) expect(unverified.reason).toBe(VM1_OS_EVIDENCE_REASON.unverified)
  })
})
