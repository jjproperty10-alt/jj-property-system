import { applyAirbnbCyprusVat, AIRBNB_CYPRUS_VAT_RATE } from '../airbnbTaxPolicy'
import { buildStrStatementLine, type StrLineEvidence } from '../strStatementLine'

// ---- Real Miranta Radisson (Hostaway 510557) Airbnb reservations, Jun–Aug 2026 (raw, tax-exclusive).
// Source: pms.raw_reservations. Parity target: authoritative Hostaway Owner Statement.
const MIRANTA = [
  { id: '60656196', mon: '2026-06', total: 514.0, hostFee: 79.67, cleaning: 60, payout: 434.33,
    exp: { gross: 553.09, platform: 118.76, cleaning: 60, mgmt: 67.05, taxes: 39.09, net: 268.19 } },
  { id: 'jul-08', mon: '2026-07', total: 697.12, hostFee: 108.05, cleaning: 60, payout: 589.07,
    exp: { gross: 750.14, platform: 161.07, cleaning: 60, mgmt: 95.21, taxes: 53.02, net: 380.84 } },
  { id: 'jul-18', mon: '2026-07', total: 1197.6, hostFee: 185.63, cleaning: 60, payout: 1011.97,
    exp: { gross: 1288.68, platform: 276.71, cleaning: 60, mgmt: 172.18, taxes: 91.08, net: 688.71 } },
  { id: 'aug-16', mon: '2026-08', total: 593.4, hostFee: 91.98, cleaning: 60, payout: 501.42,
    exp: { gross: 638.53, platform: 137.11, cleaning: 60, mgmt: 79.26, taxes: 45.13, net: 317.03 } },
  { id: 'aug-22', mon: '2026-08', total: 1219.84, hostFee: 189.08, cleaning: 60, payout: 1030.76,
    exp: { gross: 1312.61, platform: 281.85, cleaning: 60, mgmt: 175.6, taxes: 92.77, net: 702.39 } },
]

// Mirror the owner-statement evidence path: raw -> Cyprus VAT gross-up -> StrLineEvidence.
function evidence(o: { id: string; channel: string; total: number | null; hostFee: number | null; cleaning: number | null; payout: number | null; rawTax?: number | null }): StrLineEvidence {
  const platformFeesEur = o.hostFee
  const vat = applyAirbnbCyprusVat({ channel: o.channel, grossEur: o.total, platformFeesEur, taxesEur: o.rawTax ?? (o.channel === 'airbnb' ? 0 : null), airbnbExpectedPayoutEur: o.payout })
  return {
    reservationId: o.id, channel: o.channel,
    grossEur: vat.grossEur, platformFeesEur: vat.platformFeesEur, platformFeesSource: 'test',
    cleaningEur: o.cleaning, taxesEur: vat.taxesEur, platformPayoutEvidenceEur: o.payout,
  }
}
const lineFor = (o: any) => buildStrStatementLine(evidence({ channel: 'airbnb', ...o }))
const sum = (xs: (number | null)[]) => Math.round(xs.reduce<number>((a, v) => a + (v ?? 0), 0) * 100) / 100

describe('applyAirbnbCyprusVat — provider-keyed, evidence-driven', () => {
  it('occupancy tax = 9% of the Airbnb host payout, folded into Gross + Platform, surfaced as Taxes', () => {
    const r = applyAirbnbCyprusVat({ channel: 'airbnb', grossEur: 514.0, platformFeesEur: 79.67, taxesEur: 0, airbnbExpectedPayoutEur: 434.33 })
    expect(AIRBNB_CYPRUS_VAT_RATE).toBe(0.09)
    expect(r.applied).toBe(true)
    expect(r.occupancyTaxEur).toBe(39.09)
    expect(r.grossEur).toBe(553.09)      // 514.00 + 39.09
    expect(r.platformFeesEur).toBe(118.76) // 79.67 + 39.09
    expect(r.taxesEur).toBe(39.09)
  })
  it('does NOT touch Booking / direct channels', () => {
    expect(applyAirbnbCyprusVat({ channel: 'booking', grossEur: 500, platformFeesEur: 75, taxesEur: null, airbnbExpectedPayoutEur: 425 }).applied).toBe(false)
    expect(applyAirbnbCyprusVat({ channel: 'direct', grossEur: 200, platformFeesEur: 0, taxesEur: null, airbnbExpectedPayoutEur: 200 }).applied).toBe(false)
  })
  it('respects an explicit NONZERO tax — never double-applies', () => {
    const r = applyAirbnbCyprusVat({ channel: 'airbnb', grossEur: 500, platformFeesEur: 80, taxesEur: 12.34, airbnbExpectedPayoutEur: 420 })
    expect(r.applied).toBe(false)
    expect(r.taxesEur).toBe(12.34)
    expect(r.grossEur).toBe(500)
  })
  it('never fabricates when payout evidence is missing (Unknown != 0)', () => {
    expect(applyAirbnbCyprusVat({ channel: 'airbnb', grossEur: 500, platformFeesEur: 80, taxesEur: 0, airbnbExpectedPayoutEur: null }).applied).toBe(false)
  })
})

describe('Miranta Radisson — Hostaway Owner Statement parity (5 reservations)', () => {
  it.each(MIRANTA)('reservation $id matches Hostaway line', (r) => {
    const l = lineFor(r)
    expect(l.gross.value).toBe(r.exp.gross)          // 3. Gross matches Hostaway
    expect(l.platformFees.value).toBe(r.exp.platform) // 4. Platform Fees match Hostaway
    expect(l.taxes.value).toBe(r.exp.taxes)          // 1+5. explicit tax preserved / matches
    expect(l.managementFee.value).toBe(r.exp.mgmt)   // 6. Management Fee matches
    expect(l.netOwnerPayout.value).toBe(r.exp.net)   // 7. Net Owner Payout matches
    expect(l.cleaning.value).toBe(r.exp.cleaning)
  })

  it('per-reservation assertion: 2026-06-15 Net Owner = €268.19', () => {
    expect(lineFor(MIRANTA[0]).netOwnerPayout.value).toBe(268.19)
  })

  it('tax is not subtracted twice: Total Payout (Gross − Platform) stays the Airbnb payout', () => {
    // Gross+VAT − (Platform+VAT) = Gross − Platform = payout; VAT only lowers the mgmt base.
    for (const r of MIRANTA) {
      const l = lineFor(r)
      expect(Math.round((l.gross.value! - l.platformFees.value!) * 100) / 100).toBe(r.payout)
    }
  })

  const monthly = (mon: string) => {
    const rows = MIRANTA.filter(r => r.mon === mon).map(lineFor)
    return {
      gross: sum(rows.map(l => l.gross.value)), platform: sum(rows.map(l => l.platformFees.value)),
      cleaning: sum(rows.map(l => l.cleaning.value)), mgmt: sum(rows.map(l => l.managementFee.value)),
      taxes: sum(rows.map(l => l.taxes.value)), net: sum(rows.map(l => l.netOwnerPayout.value)),
    }
  }

  it('June 2026 monthly total', () => {
    expect(monthly('2026-06')).toEqual({ gross: 553.09, platform: 118.76, cleaning: 60, mgmt: 67.05, taxes: 39.09, net: 268.19 })
  })
  it('July 2026 monthly total', () => {
    expect(monthly('2026-07')).toEqual({ gross: 2038.82, platform: 437.78, cleaning: 120, mgmt: 267.39, taxes: 144.1, net: 1069.55 })
  })
  it('August 2026 monthly total', () => {
    expect(monthly('2026-08')).toEqual({ gross: 1951.14, platform: 418.96, cleaning: 120, mgmt: 254.86, taxes: 137.9, net: 1019.42 })
  })
  it('Overall June–August 2026 (Golden Gate)', () => {
    const all = MIRANTA.map(lineFor)
    expect(sum(all.map(l => l.gross.value))).toBe(4543.05)
    expect(sum(all.map(l => l.platformFees.value))).toBe(975.5)
    expect(sum(all.map(l => l.cleaning.value))).toBe(300)
    expect(sum(all.map(l => l.managementFee.value))).toBe(589.3)
    expect(sum(all.map(l => l.taxes.value))).toBe(321.09)
    expect(sum(all.map(l => l.netOwnerPayout.value))).toBe(2357.16)
  })
})

describe('regression: Ofri override reservation reproduced by the general rule', () => {
  it('Ofri 63342983 (payout 499.06) yields occupancy tax €44.92', () => {
    expect(applyAirbnbCyprusVat({ channel: 'airbnb', grossEur: 590.6, platformFeesEur: 91.54, taxesEur: 0, airbnbExpectedPayoutEur: 499.06 }).occupancyTaxEur).toBe(44.92)
  })
})
