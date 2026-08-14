import { getAuthoritativeStatementLine, belongsToStatementMonth, STATEMENT_LINE_EVIDENCE } from '../statementEvidence'
import { buildStrStatementLine, type StrLineEvidence } from '../strStatementLine'
import { composeOwnerStrStatement, type StatementReservationEvidence } from '../ownerStrStatement'
import { isTaxVerifiedZero } from '../taxEvidence'

describe('belongsToStatementMonth — arrival-month periodization', () => {
  it('check-in in month belongs; June check-in with July checkout does NOT', () => {
    expect(belongsToStatementMonth('2026-07-05', '2026-07-01', '2026-07-31')).toBe(true)
    expect(belongsToStatementMonth('2026-07-29', '2026-07-01', '2026-07-31')).toBe(true) // checkout Aug, still July
    expect(belongsToStatementMonth('2026-06-26', '2026-07-01', '2026-07-31')).toBe(false) // June arrival
  })
})

describe('getAuthoritativeStatementLine', () => {
  it('returns the Hostaway line for reservation 63342983 in Ofri July', () => {
    const l = getAuthoritativeStatementLine('63342983', 'Ofri Makarios 5 Floor', '2026-07-23')
    expect(l).not.toBeNull()
    expect(l!.taxesEur).toBe(44.92)
    expect(l!.netOwnerPayoutEur).toBe(311.32)
  })
  it('returns null outside the evidenced reservation/period/property', () => {
    expect(getAuthoritativeStatementLine('63342983', 'Ofri Makarios 5 Floor', '2026-08-01')).toBeNull()
    expect(getAuthoritativeStatementLine('99999999', 'Ofri Makarios 5 Floor', '2026-07-23')).toBeNull()
    expect(getAuthoritativeStatementLine('63342983', 'Tamir Dekelia', '2026-07-23')).toBeNull()
  })
  it('every entry cites a source', () => {
    for (const e of STATEMENT_LINE_EVIDENCE) expect(e.source.length).toBeGreaterThan(10)
  })
})

describe('buildStrStatementLine — authoritative line is verbatim, never Needs Review', () => {
  it('uses the stated Hostaway line and short-circuits the JJ chain', () => {
    const ev: StrLineEvidence = {
      reservationId: '63342983', channel: 'airbnb', grossEur: 590.60, platformFeesEur: 91.54,
      platformFeesSource: 'hostaway:airbnbListingHostFee', cleaningEur: 65, taxesEur: 0,
      platformPayoutEvidenceEur: 499.06,
      authoritativeLine: { grossEur: 635.52, platformFeesEur: 136.46, cleaningEur: 65, managementFeeEur: 77.83, taxesEur: 44.92, netOwnerPayoutEur: 311.32 },
    }
    const l = buildStrStatementLine(ev)
    expect(l.gross.value).toBe(635.52)
    expect(l.platformFees.value).toBe(136.46)
    expect(l.taxes.value).toBe(44.92)
    expect(l.netOwnerPayout.value).toBe(311.32)
    expect(l.netOwnerPayout.source).toContain('hostaway_statement')
    expect(l.needsReview).toBe(false)
  })
})

describe('Ofri/Sky View July 2026 — Hostaway parity, cent-exact', () => {
  const P = 'Ofri Makarios 5 Floor'
  const mk = (id: string, ci: string, ch: string, gross: number, comm: number | null, host: number | null, clean: number, tax: number | null): StatementReservationEvidence => ({
    reservationId: id, channel: ch, propertyName: P, guestName: 'G', checkIn: ci, checkOut: ci, nights: 1,
    grossEur: gross, platformFeesEur: host ?? comm, platformFeesSource: host != null ? 'hostaway:airbnbListingHostFee' : 'hostaway:channelCommissionAmount',
    cleaningEur: clean, taxesEur: tax,
    taxVerifiedZeroEvidence: isTaxVerifiedZero(ch, P, ci),
    authoritativeLine: getAuthoritativeStatementLine(id, P, ci) ?? undefined,
    platformPayoutEvidenceEur: null,
  })
  it('5 arrival-July reservations reconcile to Hostaway exactly', () => {
    const s = composeOwnerStrStatement({
      ownerName: 'Ofri', properties: [P], periodStart: '2026-07-01', periodEnd: '2026-07-31',
      periodLabel: 'July 2026', issuedDate: '2026-08-14',
      reservations: [
        mk('53938840', '2026-07-05', 'booking', 750.19, 112.53, null, 70, null),
        mk('55368211', '2026-07-13', 'booking', 842.00, 126.30, null, 50, null),
        mk('60225289', '2026-07-19', 'booking', 578.68, 86.80, null, 70, null),
        mk('63342983', '2026-07-23', 'airbnb', 590.60, null, 91.54, 65, 0),
        mk('57558855', '2026-07-29', 'booking', 662.90, 99.44, null, 70, null),
      ],
      extras: [], jjPlatformIncomeInPeriodEur: null, jjPlatformIncomeIsAggregate: false,
    })
    expect(s.totals.grossEur).toBe(3469.29)
    expect(s.totals.platformFeesEur).toBe(606.87)
    expect(s.totals.cleaningEur).toBe(325.0)
    expect(s.totals.taxesEur).toBe(44.92)
    expect(s.totals.managementFeeEur).toBe(498.5)
    expect(s.totals.netOwnerPayoutEur).toBe(1994.01)
    expect(s.totals.needsReviewCount).toBe(0)
  })
})
