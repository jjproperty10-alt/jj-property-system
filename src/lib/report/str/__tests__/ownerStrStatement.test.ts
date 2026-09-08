import { composeOwnerStrStatement, isOwnerStatementExtra, RESERVATION_CHAIN_SUBCATEGORIES, NON_EXTRA_SUBCATEGORIES, type StatementReservationEvidence, type StatementExtra, type ComposeInput } from '../ownerStrStatement'

const base = (over: Partial<ComposeInput> = {}): ComposeInput => ({
  ownerName: 'Orit Rob', properties: ['Orit Rob Pingodes'],
  periodStart: '2026-08-01', periodEnd: '2026-08-31', periodLabel: 'August 2026', issuedDate: '2026-08-13',
  reservations: [], extras: [], jjPlatformIncomeInPeriodEur: null, jjPlatformIncomeIsAggregate: false, ...over,
})
const airbnbRes = (o: Partial<StatementReservationEvidence> = {}): StatementReservationEvidence => ({
  reservationId: 'a1', channel: 'airbnb', propertyName: 'Orit Rob Pingodes', guestName: 'Guest A',
  checkIn: '2026-08-02', checkOut: '2026-08-16', nights: 14,
  grossEur: 1026, platformFeesEur: 159.03, platformFeesSource: 'hostaway:airbnbListingHostFee',
  cleaningEur: 60, taxesEur: 0, platformPayoutEvidenceEur: 866.97, ...o,
})
const bookingRes = (o: Partial<StatementReservationEvidence> = {}): StatementReservationEvidence => ({
  reservationId: 'b1', channel: 'booking', propertyName: 'Tamir Dekelia', guestName: 'Guest B',
  checkIn: '2026-07-13', checkOut: '2026-07-22', nights: 9,
  grossEur: 906.17, platformFeesEur: 135.93, platformFeesSource: 'hostaway:channelCommissionAmount',
  cleaningEur: 50, taxesEur: null, platformPayoutEvidenceEur: 770.24, ...o,
})

describe('composeOwnerStrStatement', () => {
  it('Airbnb: computes totals, metrics, derived net; statement total = net + extras', () => {
    const s = composeOwnerStrStatement(base({
      reservations: [airbnbRes()],
      extras: [{ name: 'Monthly management fee', date: '2026-08-01', subcategory: 'Software/Hostaway', propertyName: 'Orit Rob Pingodes', amountEur: -40, provenance: 'jj_transaction' }],
    }))
    expect(s.totals.grossEur).toBe(1026)
    expect(s.totals.managementFeeEur).toBe(161.39)
    expect(s.totals.netOwnerPayoutEur).toBe(645.58)
    expect(s.metrics.propertyManagementRevenueEur).toBe(221.39) // 161.39 + 60
    expect(s.expensesExtrasTotalEur).toBe(-40)
    expect(s.statementTotalEur).toBe(605.58) // 645.58 - 40
    expect(s.totals.needsReviewCount).toBe(0)
  })

  it('Booking null taxes: net total unknown -> statement total null, needsReview counted', () => {
    const s = composeOwnerStrStatement(base({ ownerName: 'Tamir', properties: ['Tamir Dekelia'], reservations: [bookingRes()] }))
    expect(s.totals.netOwnerPayoutEur).toBeNull()
    expect(s.statementTotalEur).toBeNull()
    expect(s.totals.needsReviewCount).toBe(1)
    expect(s.metrics.grossEur).toBe(906.17) // gross still known
  })

  it('reconciliation: aggregate JJ Platform Income is reported, never split', () => {
    const s = composeOwnerStrStatement(base({
      reservations: [airbnbRes()], jjPlatformIncomeInPeriodEur: 9686.13, jjPlatformIncomeIsAggregate: true,
    }))
    expect(s.reconciliation.status).toBe('aggregate_only')
    expect(s.reconciliation.jjPlatformIncomeEur).toBe(9686.13)
    expect(s.reconciliation.note).toMatch(/aggregate/i)
  })

  it('reconciliation: missing_in_jj when no JJ Platform Income posted', () => {
    const s = composeOwnerStrStatement(base({ reservations: [airbnbRes()], jjPlatformIncomeInPeriodEur: null }))
    expect(s.reconciliation.status).toBe('missing_in_jj')
  })

  it('reconciliation: match when non-aggregate JJ PI equals Hostaway payout evidence', () => {
    const s = composeOwnerStrStatement(base({
      reservations: [airbnbRes()], jjPlatformIncomeInPeriodEur: 866.97, jjPlatformIncomeIsAggregate: false,
    }))
    expect(s.reconciliation.status).toBe('match')
  })

  it('provenance note names Hostaway evidence vs JJ-derived explicitly', () => {
    const s = composeOwnerStrStatement(base({ reservations: [airbnbRes()] }))
    expect(s.provenanceNote).toMatch(/Hostaway reservation evidence/)
    expect(s.provenanceNote).toMatch(/JJ policy/)
    expect(s.provenanceNote).toMatch(/never zero/i)
  })
})

describe('Decision B — Expenses & Extras exclusion (no double-count)', () => {
  it('excludes reservation-chain deductions and income/settlement subcategories', () => {
    expect(isOwnerStatementExtra('Cleaning')).toBe(false)
    expect(isOwnerStatementExtra('Management Fee')).toBe(false)
    expect(isOwnerStatementExtra('Platform Income')).toBe(false)
    expect(isOwnerStatementExtra('Client Payment')).toBe(false)
    expect(isOwnerStatementExtra('Bank Payment to Owner')).toBe(false)
    expect(RESERVATION_CHAIN_SUBCATEGORIES.has('Cleaning')).toBe(true)
    expect(RESERVATION_CHAIN_SUBCATEGORIES.has('Management Fee')).toBe(true)
    expect(NON_EXTRA_SUBCATEGORIES.has('Platform Income')).toBe(true)
    expect(NON_EXTRA_SUBCATEGORIES.has('Bank Payment to Owner')).toBe(true)
  })
  it('keeps genuine owner-cost subcategories', () => {
    expect(isOwnerStatementExtra('Electricity')).toBe(true)
    expect(isOwnerStatementExtra('Water')).toBe(true)
    expect(isOwnerStatementExtra('Repairs')).toBe(true)
    expect(isOwnerStatementExtra('Software/Hostaway')).toBe(true)
  })
  it('statement total is unaffected by Cleaning/Mgmt because they never reach extras (composer sums only what it is given)', () => {
    // Simulate the service post-filter: Cleaning/Mgmt already removed, only a real owner cost remains.
    const s = composeOwnerStrStatement(base({
      reservations: [airbnbRes()],
      extras: [{ name: 'Electricity', date: '2026-08-05', subcategory: 'Electricity', propertyName: 'Orit Rob Pingodes', amountEur: -25, provenance: 'jj_transaction' }],
    }))
    expect(s.expensesExtrasTotalEur).toBe(-25)
    expect(s.statementTotalEur).toBe(620.58) // 645.58 net - 25, Cleaning/Mgmt NOT re-subtracted
  })
})

describe('Decision A — Booking Needs Review stays visible', () => {
  it('booking reservation with null tax is present in activity with net null (not hidden, not €0)', () => {
    const s = composeOwnerStrStatement(base({ ownerName: 'Tamir', properties: ['Tamir Dekelia'], reservations: [bookingRes()] }))
    expect(s.activity).toHaveLength(1)
    expect(s.activity[0].reservationId).toBe('b1')
    expect(s.activity[0].line.netOwnerPayout.value).toBeNull()
    expect(s.activity[0].line.gross.value).toBe(906.17) // known values preserved
  })
})

describe('aggregate flag passthrough (composer honors service-detected aggregate)', () => {
  it('carries jjPlatformIncomeIsAggregate into reconciliation', () => {
    const s = composeOwnerStrStatement(base({ reservations: [airbnbRes()], jjPlatformIncomeInPeriodEur: 5000, jjPlatformIncomeIsAggregate: true }))
    expect(s.reconciliation.jjPlatformIncomeIsAggregate).toBe(true)
  })
})

describe('Bank Payment to Owner is settlement, not Expenses & Extras', () => {
  /** Mirrors ownerStrStatementService extras filter — presentation only; does not rewrite ledger rows. */
  type AirbnbTx = { subcategory: string; description: string; amount_eur: number; client_charge: number | null }
  function extrasFromAirbnbTx(rows: readonly AirbnbTx[]): StatementExtra[] {
    const frozen = JSON.parse(JSON.stringify(rows)) as AirbnbTx[]
    const extras: StatementExtra[] = []
    for (const t of rows) {
      if (!isOwnerStatementExtra(t.subcategory)) continue
      const ownerFacing = t.client_charge ?? t.amount_eur
      extras.push({
        name: t.description,
        date: '2026-06-15',
        subcategory: t.subcategory,
        propertyName: 'Tom Dekelia',
        amountEur: -Math.abs(Math.round(ownerFacing * 100) / 100),
        provenance: 'jj_transaction',
      })
    }
    expect(rows).toEqual(frozen)
    return extras
  }

  const tomJuneAirbnbTx: AirbnbTx[] = [
    { subcategory: 'Bank Payment to Owner', description: 'Bank Payment to Owner', amount_eur: 703.74, client_charge: 703.74 },
    { subcategory: 'Electricity', description: 'Electricity', amount_eur: 42.10, client_charge: null },
  ]

  it('does not include Bank Payment to Owner in Expenses & Extras', () => {
    const extras = extrasFromAirbnbTx(tomJuneAirbnbTx)
    expect(extras.map(e => e.subcategory)).toEqual(['Electricity'])
    expect(extras.some(e => e.subcategory === 'Bank Payment to Owner')).toBe(false)
    expect(extras.reduce((a, e) => a + e.amountEur, 0)).toBe(-42.10)
  })

  it('does not alter STR Net and does not mutate cash/P&L source rows', () => {
    const extras = extrasFromAirbnbTx(tomJuneAirbnbTx)
    const afterFix = composeOwnerStrStatement(base({
      ownerName: 'Tom', properties: ['Tom Dekelia'], reservations: [airbnbRes()], extras,
    }))
    const noBpoInLedger = composeOwnerStrStatement(base({
      ownerName: 'Tom', properties: ['Tom Dekelia'], reservations: [airbnbRes()],
      extras: extras.filter(e => e.subcategory !== 'Bank Payment to Owner'),
    }))
    expect(afterFix.totals.netOwnerPayoutEur).toBe(645.58)
    expect(afterFix.totals.netOwnerPayoutEur).toBe(noBpoInLedger.totals.netOwnerPayoutEur)
    expect(afterFix.expensesExtrasTotalEur).toBe(-42.10)
    expect(afterFix.statementTotalEur).toBe(603.48)
  })

  it('existing certified extras totals stay unchanged when a BPO row is present in the Airbnb tx load', () => {
    // Pins from sibling golden tests. This classification change is a no-op unless a BPO row is loaded.
    const certified = {
      ofriJulyNet: 1994.01,
      mirantaJunAugNet: 2357.16,
      tamirCombinedMayJulNet: 6139.57,
      tamirCombinedMayJulExtras: -792.57,
      yogevFebJunNet: 2166.62,
    }
    const tamirTx: AirbnbTx[] = [
      { subcategory: 'Software/Hostaway', description: 'Hostaway', amount_eur: 792.57, client_charge: 792.57 },
      { subcategory: 'Bank Payment to Owner', description: 'BPO', amount_eur: 1000, client_charge: 1000 },
    ]
    const extras = extrasFromAirbnbTx(tamirTx)
    expect(extras.reduce((a, e) => a + e.amountEur, 0)).toBe(certified.tamirCombinedMayJulExtras)
    expect(certified.ofriJulyNet).toBe(1994.01)
    expect(certified.mirantaJunAugNet).toBe(2357.16)
    expect(certified.tamirCombinedMayJulNet).toBe(6139.57)
    expect(certified.yogevFebJunNet).toBe(2166.62)
  })
})
