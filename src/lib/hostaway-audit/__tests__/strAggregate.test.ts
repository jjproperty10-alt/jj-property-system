/** Aggregate-aware reconciliation: a multi-month JJ aggregate must NOT produce a monthly variance. */
import { reconcileStrPeriod } from '../strReconciliation'
import { buildStrReconciliation, type StrPeriodInput } from '../strAudit'

const PID = '4eb09c84-907a-404c-b19a-7856f73fadff'

describe('STR reconciliation — aggregate awareness', () => {
  it('jjIsAggregate → status aggregate_only, NO variance (April vs Jan–Apr aggregate)', () => {
    const r = reconcileStrPeriod({
      propertyId: PID, serviceEngagementId: 'eng-1', period: 'Apr 2026',
      hostawayAmount: 2838.31, hostawayConfidence: 'medium', jjAmount: 3404.03, jjIsAggregate: true,
    })
    expect(r.status).toBe('aggregate_only')
    expect(r.variance).toBeNull()
    expect(r.needsReviewReason).toMatch(/multi-month aggregate/i)
  })

  it('month-specific JJ still reconciles normally (variance path intact)', () => {
    const r = reconcileStrPeriod({
      propertyId: PID, serviceEngagementId: 'eng-1', period: 'Apr 2026',
      hostawayAmount: 2838.31, hostawayConfidence: 'medium', jjAmount: 3404.03, jjIsAggregate: false,
    })
    expect(r.status).toBe('variance')
    expect(r.variance).toBeCloseTo(-565.72, 2)
  })

  it('missing_in_jj preserved when no JJ evidence at all', () => {
    const r = reconcileStrPeriod({
      propertyId: PID, serviceEngagementId: 'eng-1', period: 'Jul 2026',
      hostawayAmount: 2839.95, hostawayConfidence: 'medium', jjAmount: null,
    })
    expect(r.status).toBe('missing_in_jj')
  })

  it('buildStrReconciliation counts aggregateOnly and yields no variance', () => {
    const periods: StrPeriodInput[] = [
      { period: 'Apr 2026', hostawayAmount: 2838.31, hostawayConfidence: 'medium', jjAmount: 3404.03, jjIsAggregate: true },
    ]
    const dto = buildStrReconciliation(PID, 'eng-1', periods)
    expect(dto.summary.aggregateOnly).toBe(1)
    expect(dto.summary.variance).toBe(0)
    expect(dto.periods[0].status).toBe('aggregate_only')
    expect(dto.summary.totalVarianceEur).toBeNull()
  })
})
