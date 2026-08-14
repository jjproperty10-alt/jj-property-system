import { composeOwnerStrRangeStatement } from '../ownerStrRangeStatement'
import type { OwnerStrStatement } from '../ownerStrStatement'

// Minimal month stub with only the fields the range composer reads.
const month = (o: { gross: number; platform: number | null; cleaning: number | null; mgmt: number | null; tax: number | null; net: number | null; extras: number }): OwnerStrStatement => ({
  header: { company: 'JJ PROPERTY 10 LTD', ownerName: 'X', properties: ['P'], periodStart: '2026-05-01', periodEnd: '2026-05-31', periodLabel: 'May 2026', issuedDate: '2026-08-14' },
  metrics: { grossEur: o.gross, netOwnerPayoutEur: o.net, propertyManagementRevenueEur: o.mgmt },
  activity: [],
  totals: { grossEur: o.gross, platformFeesEur: o.platform, cleaningEur: o.cleaning, managementFeeEur: o.mgmt, taxesEur: o.tax, netOwnerPayoutEur: o.net, needsReviewCount: o.net == null ? 1 : 0 },
  expensesExtras: [],
  expensesExtrasTotalEur: o.extras,
  statementTotalEur: o.net == null ? null : o.net + o.extras,
  reconciliation: { hostawayPayoutEvidenceEur: null, jjPlatformIncomeEur: null, jjPlatformIncomeIsAggregate: false, status: 'no_evidence', note: '' },
  provenanceNote: '',
})

const base = (months: OwnerStrStatement[]) => composeOwnerStrRangeStatement({
  ownerName: 'Tamir', properties: ['P'], rangeStart: '2026-05-01', rangeEnd: '2026-07-31',
  rangeLabel: 'May 2026 – July 2026', issuedDate: '2026-08-14', months,
})

describe('composeOwnerStrRangeStatement', () => {
  it('sums all-known months to overall totals + statement total', () => {
    const r = base([
      month({ gross: 1000, platform: 150, cleaning: 50, mgmt: 160, tax: 0, net: 640, extras: -40 }),
      month({ gross: 2000, platform: 300, cleaning: 100, mgmt: 320, tax: 0, net: 1280, extras: 0 }),
      month({ gross: 3000, platform: 450, cleaning: 150, mgmt: 480, tax: 0, net: 1920, extras: -10 }),
    ])
    expect(r.overall.grossEur).toBe(6000)
    expect(r.overall.platformFeesEur).toBe(900)
    expect(r.overall.cleaningEur).toBe(300)
    expect(r.overall.managementFeeEur).toBe(960)
    expect(r.overall.taxesEur).toBe(0)
    expect(r.overall.netOwnerPayoutEur).toBe(3840)
    expect(r.overall.expensesExtrasTotalEur).toBe(-50)
    expect(r.overall.statementTotalEur).toBe(3790) // 3840 - 50
    expect(r.overall.needsReviewMonths).toBe(0)
    expect(r.header.monthCount).toBe(3)
    expect(r.months).toHaveLength(3)
  })

  it('Unknown ≠ 0: any Needs-Review month makes the matching overall total null', () => {
    const r = base([
      month({ gross: 1000, platform: 150, cleaning: 50, mgmt: 160, tax: 0, net: 640, extras: 0 }),
      month({ gross: 900, platform: 135, cleaning: 50, mgmt: null, tax: null, net: null, extras: 0 }), // Booking Needs Review
    ])
    expect(r.overall.grossEur).toBe(1900)            // gross always summable
    expect(r.overall.platformFeesEur).toBe(285)       // both known
    expect(r.overall.managementFeeEur).toBeNull()     // one month unknown
    expect(r.overall.taxesEur).toBeNull()
    expect(r.overall.netOwnerPayoutEur).toBeNull()
    expect(r.overall.statementTotalEur).toBeNull()
    expect(r.overall.needsReviewMonths).toBe(1)
  })

  it('preserves per-month statements in order', () => {
    const r = base([
      month({ gross: 100, platform: 15, cleaning: 5, mgmt: 16, tax: 0, net: 64, extras: 0 }),
      month({ gross: 200, platform: 30, cleaning: 10, mgmt: 32, tax: 0, net: 128, extras: 0 }),
    ])
    expect(r.months[0].totals.grossEur).toBe(100)
    expect(r.months[1].totals.grossEur).toBe(200)
  })
})
