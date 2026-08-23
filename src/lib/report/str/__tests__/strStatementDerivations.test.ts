import {
  monthOccupancy,
  perPropertyRollup,
  reservationDetails,
  normalizePropertyName,
} from '../strStatementDerivations'
import type { OwnerStrStatement } from '../ownerStrStatement'

// ---- generic fixtures (no real-owner figures hardcoded) ----
const amt = (value: number | null) => ({ value, provenance: value == null ? 'unknown' : 'hostaway' as const })
function mkRow(opts: {
  id: string; property: string; nights: number; gross: number | null; net: number | null;
  needsReview?: boolean; channel?: string; guest?: string | null; checkIn?: string; checkOut?: string
}) {
  const line = {
    reservationId: opts.id, channel: opts.channel ?? 'bookingcom',
    gross: amt(opts.gross), platformFees: amt(0), cleaning: amt(0), managementFee: amt(0),
    taxes: amt(0), netOwnerPayout: amt(opts.net), platformPayoutEvidence: amt(opts.gross),
    needsReview: opts.needsReview ?? false, reviewReasons: [] as string[],
  }
  return {
    reservationId: opts.id, propertyName: opts.property, guestName: opts.guest ?? 'Guest',
    channel: opts.channel ?? 'bookingcom', checkIn: opts.checkIn ?? '2026-06-01',
    checkOut: opts.checkOut ?? '2026-06-03', nights: opts.nights, line,
  }
}
const mkMonth = (rows: ReturnType<typeof mkRow>[]): OwnerStrStatement =>
  ({ activity: rows } as unknown as OwnerStrStatement)

describe('monthOccupancy', () => {
  it('counts check-ins and sums nights', () => {
    const m = mkMonth([
      mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: 400, net: 300 }),
      mkRow({ id: 'b', property: 'Alpha', nights: 1, gross: 100, net: 80 }),
      mkRow({ id: 'c', property: 'Beta', nights: 7, gross: 700, net: 560 }),
    ])
    expect(monthOccupancy(m)).toEqual({ checkIns: 3, nights: 12 })
  })
  it('empty activity month is zero, never null', () => {
    expect(monthOccupancy(mkMonth([]))).toEqual({ checkIns: 0, nights: 0 })
  })
  it('check-ins equals activity length with unique reservation ids', () => {
    const rows = [
      mkRow({ id: 'r1', property: 'Alpha', nights: 2, gross: 200, net: 160 }),
      mkRow({ id: 'r2', property: 'Alpha', nights: 3, gross: 300, net: 240 }),
    ]
    const ids = new Set(rows.map(r => r.reservationId))
    expect(ids.size).toBe(rows.length)
    expect(monthOccupancy(mkMonth(rows)).checkIns).toBe(ids.size)
  })
})

describe('perPropertyRollup', () => {
  it('groups multiple apartments within one month', () => {
    const r = perPropertyRollup([mkMonth([
      mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: 400, net: 300 }),
      mkRow({ id: 'b', property: 'Beta', nights: 7, gross: 700, net: 560 }),
    ])])
    expect(r.map(x => x.propertyName)).toEqual(['Alpha', 'Beta'])
    expect(r.find(x => x.propertyName === 'Alpha')).toMatchObject({ checkIns: 1, nights: 4, grossEur: 400, netOwnerPayoutEur: 300 })
    expect(r.find(x => x.propertyName === 'Beta')).toMatchObject({ checkIns: 1, nights: 7, grossEur: 700, netOwnerPayoutEur: 560 })
  })
  it('accumulates the same apartment across several months', () => {
    const r = perPropertyRollup([
      mkMonth([mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: 400, net: 300 })]),
      mkMonth([mkRow({ id: 'b', property: 'Alpha', nights: 2, gross: 200, net: 160 })]),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ propertyName: 'Alpha', checkIns: 2, nights: 6, grossEur: 600, netOwnerPayoutEur: 460 })
  })
  it('normalizes property-name whitespace so variants merge', () => {
    const r = perPropertyRollup([mkMonth([
      mkRow({ id: 'a', property: 'Alpha  Villa', nights: 1, gross: 100, net: 80 }),
      mkRow({ id: 'b', property: ' Alpha Villa ', nights: 2, gross: 200, net: 160 }),
    ])])
    expect(r).toHaveLength(1)
    expect(r[0].checkIns).toBe(2)
  })
  it('propagates Unknown: any needs-review row makes net null (never coerced to 0)', () => {
    const r = perPropertyRollup([mkMonth([
      mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: 400, net: 300 }),
      mkRow({ id: 'b', property: 'Alpha', nights: 1, gross: 100, net: null, needsReview: true }),
    ])])
    expect(r[0].netOwnerPayoutEur).toBeNull()
    expect(r[0].grossEur).toBe(500)
  })
  it('any Unknown gross makes property gross null', () => {
    const r = perPropertyRollup([mkMonth([
      mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: null, net: 300 }),
    ])])
    expect(r[0].grossEur).toBeNull()
  })
})

describe('reservationDetails', () => {
  it('flattens every month, one row per reservation, sorted by check-in', () => {
    const d = reservationDetails([
      mkMonth([mkRow({ id: 'jul', property: 'Alpha', nights: 2, gross: 200, net: 160, checkIn: '2026-07-05' })]),
      mkMonth([mkRow({ id: 'jun', property: 'Beta', nights: 3, gross: 300, net: 240, checkIn: '2026-06-02' })]),
    ])
    expect(d.map(x => x.reservationId)).toEqual(['jun', 'jul'])
    expect(d).toHaveLength(2)
  })
  it('empty range yields empty details', () => {
    expect(reservationDetails([mkMonth([])])).toHaveLength(0)
  })
})

describe('financial invariance / consistency', () => {
  it('rollup gross equals the sum of activity gross (no double-count, none dropped)', () => {
    const months = [
      mkMonth([
        mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: 400, net: 300 }),
        mkRow({ id: 'b', property: 'Beta', nights: 7, gross: 700, net: 560 }),
      ]),
      mkMonth([mkRow({ id: 'c', property: 'Alpha', nights: 2, gross: 200, net: 160 })]),
    ]
    const rollupGross = perPropertyRollup(months).reduce((s, p) => s + (p.grossEur ?? 0), 0)
    const activityGross = months.flatMap(m => m.activity).reduce((s, r) => s + (r.line.gross.value ?? 0), 0)
    expect(rollupGross).toBe(activityGross)
    const rollupCheckIns = perPropertyRollup(months).reduce((s, p) => s + p.checkIns, 0)
    expect(rollupCheckIns).toBe(months.flatMap(m => m.activity).length)
  })
  it('derivations do not mutate the input statements', () => {
    const rows = [mkRow({ id: 'a', property: 'Alpha', nights: 4, gross: 400, net: 300 })]
    const months = [mkMonth(rows)]
    const snapshot = JSON.stringify(months)
    monthOccupancy(months[0]); perPropertyRollup(months); reservationDetails(months)
    expect(JSON.stringify(months)).toBe(snapshot)
  })
})

describe('normalizePropertyName', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizePropertyName('  Alpha   Villa ')).toBe('Alpha Villa')
  })
})
