jest.mock('server-only', () => ({}), { virtual: true })
const mockBuild = jest.fn()
jest.mock('../ownerStrStatementService', () => ({ buildOwnerStrStatement: (...a: unknown[]) => mockBuild(...a) }))
jest.mock('@/lib/supabase', () => ({ createServiceClient: () => ({}) }))

import { monthsInRange, buildOwnerStrRangeStatement } from '../ownerStrRangeStatementService'
import type { OwnerStrStatement } from '../ownerStrStatement'

const stub = (label: string, gross: number, net: number | null): OwnerStrStatement => ({
  header: { company: 'JJ PROPERTY 10 LTD', ownerName: 'X', properties: ['P'], periodStart: '', periodEnd: '', periodLabel: label, issuedDate: '2026-08-14' },
  metrics: { grossEur: gross, netOwnerPayoutEur: net, propertyManagementRevenueEur: net },
  activity: [],
  totals: { grossEur: gross, platformFeesEur: 0, cleaningEur: 0, managementFeeEur: net, taxesEur: 0, netOwnerPayoutEur: net, needsReviewCount: net == null ? 1 : 0 },
  expensesExtras: [], expensesExtrasTotalEur: 0, statementTotalEur: net,
  reconciliation: { hostawayPayoutEvidenceEur: null, jjPlatformIncomeEur: null, jjPlatformIncomeIsAggregate: false, status: 'no_evidence', note: '' }, provenanceNote: '',
})

describe('monthsInRange', () => {
  it('inclusive month list across a year boundary', () => {
    expect(monthsInRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
  it('single month when from == to', () => {
    expect(monthsInRange('2026-07', '2026-07')).toEqual(['2026-07'])
  })
  it('caps at maxMonths', () => {
    expect(monthsInRange('2020-01', '2030-01', 5)).toHaveLength(5)
  })
})

describe('buildOwnerStrRangeStatement', () => {
  beforeEach(() => mockBuild.mockReset())
  it('iterates months, calls the single-month builder per month, and aggregates', async () => {
    mockBuild
      .mockResolvedValueOnce(stub('May 2026', 1000, 640))
      .mockResolvedValueOnce(stub('June 2026', 2000, 1280))
      .mockResolvedValueOnce(stub('July 2026', 3000, 1920))
    const r = await buildOwnerStrRangeStatement({ ownerName: 'Tamir', properties: [{ id: 'p', name: 'P' }], fromMonth: '2026-05', toMonth: '2026-07', today: '2026-08-14' })
    expect(mockBuild).toHaveBeenCalledTimes(3)
    expect(r.months).toHaveLength(3)
    expect(r.overall.grossEur).toBe(6000)
    expect(r.overall.netOwnerPayoutEur).toBe(3840)
    expect(r.header.monthCount).toBe(3)
    expect(r.header.rangeLabel).toContain('–')
  })
  it('a Needs-Review month propagates to overall Net (Unknown ≠ 0)', async () => {
    mockBuild
      .mockResolvedValueOnce(stub('May 2026', 1000, 640))
      .mockResolvedValueOnce(stub('June 2026', 900, null))
    const r = await buildOwnerStrRangeStatement({ ownerName: 'T', properties: [{ id: 'p', name: 'P' }], fromMonth: '2026-05', toMonth: '2026-06', today: '2026-08-14' })
    expect(r.overall.grossEur).toBe(1900)
    expect(r.overall.netOwnerPayoutEur).toBeNull()
    expect(r.overall.needsReviewMonths).toBe(1)
  })
})
