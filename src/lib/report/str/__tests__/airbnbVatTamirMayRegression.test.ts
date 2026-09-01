/**
 * Regression coverage for the Tamir May–Jul golden-gate CORRECTION introduced by the Airbnb Cyprus
 * VAT fix (PR #194). The €6,203.23 baseline was computed BEFORE the fix and included 3 Tamir Airbnb
 * reservations in May 2026 that carried the identical tax-exclusive bug found on Miranta Radisson.
 * This test proves the change is exactly −€63.66 and comes ONLY from those 3 Airbnb reservations —
 * Booking/direct rows are unaffected.
 *
 * PROVENANCE (do not overwrite history):
 *   Pre-VAT-fix certified baseline:  Net €6,203.23 · Expenses −€792.57 · Statement Total €5,410.66
 *   Post-fix corrected golden gate:  Net €6,139.57 · Expenses −€792.57 · Statement Total €5,347.00
 */
import { applyAirbnbCyprusVat } from '../airbnbTaxPolicy'
import { buildStrStatementLine, type StrLineEvidence } from '../strStatementLine'

// Corrected (post-fix) golden baseline for Tamir May–Jul.
export const TAMIR_MAY_JUL_PRE_VAT_FIX = { netOwnerEur: 6203.23, expensesEur: -792.57, statementTotalEur: 5410.66 } as const
export const TAMIR_MAY_JUL_POST_FIX = { netOwnerEur: 6139.57, expensesEur: -792.57, statementTotalEur: 5347.0 } as const

// Real Tamir May 2026 Airbnb reservations (pms.raw_reservations, tax-exclusive).
const TAMIR_MAY_AIRBNB = [
  { id: '54522758', total: 175.4, hostFee: 27.19, cleaning: 50, payout: 148.21, expDelta: -10.67 },
  { id: '52456156', total: 499.8, hostFee: 77.47, cleaning: 40, payout: 422.33, expDelta: -30.4 },
  { id: '59925709', total: 371.4, hostFee: 57.57, cleaning: 60, payout: 313.83, expDelta: -22.59 },
]

function netFor(channel: string, o: { id: string; total: number; hostFee: number; cleaning: number; payout: number }): number | null {
  const vat = applyAirbnbCyprusVat({ channel, grossEur: o.total, platformFeesEur: o.hostFee, taxesEur: 0, airbnbExpectedPayoutEur: o.payout })
  const ev: StrLineEvidence = {
    reservationId: o.id, channel,
    grossEur: vat.grossEur, platformFeesEur: vat.platformFeesEur, platformFeesSource: 't',
    cleaningEur: o.cleaning, taxesEur: vat.taxesEur, platformPayoutEvidenceEur: o.payout,
  }
  return buildStrStatementLine(ev).netOwnerPayout.value
}
function netOldNoFix(o: { id: string; total: number; hostFee: number; cleaning: number; payout: number }): number | null {
  // Pre-fix behaviour: Airbnb tax stays 0, no gross-up.
  const ev: StrLineEvidence = {
    reservationId: o.id, channel: 'airbnb',
    grossEur: o.total, platformFeesEur: o.hostFee, platformFeesSource: 't',
    cleaningEur: o.cleaning, taxesEur: 0, platformPayoutEvidenceEur: o.payout,
  }
  return buildStrStatementLine(ev).netOwnerPayout.value
}
const r2 = (n: number) => Math.round(n * 100) / 100

describe('Tamir May–Jul VAT correction (−€63.66, Airbnb-only)', () => {
  it.each(TAMIR_MAY_AIRBNB)('res $id: VAT applies and net delta matches Hostaway parity', (o) => {
    const vat = applyAirbnbCyprusVat({ channel: 'airbnb', grossEur: o.total, platformFeesEur: o.hostFee, taxesEur: 0, airbnbExpectedPayoutEur: o.payout })
    expect(vat.applied).toBe(true)
    const delta = r2((netFor('airbnb', o) as number) - (netOldNoFix(o) as number))
    expect(delta).toBe(o.expDelta)
  })

  it('total net change is exactly −€63.66 across the 3 May Airbnb reservations', () => {
    const total = r2(TAMIR_MAY_AIRBNB.reduce((s, o) => s + ((netFor('airbnb', o) as number) - (netOldNoFix(o) as number)), 0))
    expect(total).toBe(-63.66)
    // The corrected baseline is the pre-fix baseline plus exactly this delta.
    expect(r2(TAMIR_MAY_JUL_PRE_VAT_FIX.netOwnerEur + total)).toBe(TAMIR_MAY_JUL_POST_FIX.netOwnerEur)
    expect(r2(TAMIR_MAY_JUL_POST_FIX.netOwnerEur + TAMIR_MAY_JUL_POST_FIX.expensesEur)).toBe(TAMIR_MAY_JUL_POST_FIX.statementTotalEur)
  })

  it('the change comes ONLY from Airbnb — identical Booking rows are untouched by the VAT policy', () => {
    for (const o of TAMIR_MAY_AIRBNB) {
      const v = applyAirbnbCyprusVat({ channel: 'booking', grossEur: o.total, platformFeesEur: o.hostFee, taxesEur: null, airbnbExpectedPayoutEur: o.payout })
      expect(v.applied).toBe(false)
      expect(v.grossEur).toBe(o.total)
      expect(v.taxesEur).toBeNull()
    }
  })

  it('policy safety: explicit nonzero tax is never re-taxed (no double 9%)', () => {
    const v = applyAirbnbCyprusVat({ channel: 'airbnb', grossEur: 500, platformFeesEur: 80, taxesEur: 20, airbnbExpectedPayoutEur: 420 })
    expect(v.applied).toBe(false)
    expect(v.taxesEur).toBe(20)
    expect(v.grossEur).toBe(500)
  })
})
