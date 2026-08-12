/**
 * fetchReservationActivity — month-activity probe for reservations navigation.
 * Revenue-eligible (confirmed/modified) reservations define "active" months; cancelled excluded.
 */
jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/supabase', () => ({ createServiceClient: () => ({}) }))

const mockAuditProperty = jest.fn()
jest.mock('@/lib/hostaway-audit', () => ({
  PropertyAuditService: jest.fn().mockImplementation(() => ({ auditProperty: (...a: unknown[]) => mockAuditProperty(...a) })),
  isRevenueEligible: (s: string) => s === 'confirmed' || s === 'modified',
}))

import { fetchReservationActivity } from '@/lib/owners/ownerReservationAdapter'

function res(status: string, checkIn: string) {
  return { hostawayReservationId: `r-${checkIn}-${status}`, status, checkIn, checkOut: checkIn, nights: 1,
           channel: 'airbnb', financials: { payout: { amount: 100, source: 'reported', confidence: 'high' } } }
}
function auditOk(reservations: unknown[]) {
  return { success: true, error: null, audit: { reservations } }
}

beforeEach(() => mockAuditProperty.mockReset())

describe('fetchReservationActivity', () => {
  it('returns empty for no properties', async () => {
    const out = await fetchReservationActivity({ properties: [], startDate: '', endDate: '', today: '2026-08-12' })
    expect(out).toEqual({ activeMonths: [], latestActiveMonth: null })
  })

  it('collects revenue-eligible check-in months and latest; excludes cancelled', async () => {
    mockAuditProperty.mockResolvedValue(auditOk([
      res('confirmed', '2026-06-20'),
      res('modified', '2026-07-11'),
      res('cancelled', '2026-08-02'),   // excluded
      res('confirmed', '2026-09-15'),
    ]))
    const out = await fetchReservationActivity({ properties: ['Orit Rob Pingodes'], startDate: '', endDate: '', today: '2026-08-12' })
    expect(out.activeMonths).toEqual(['2026-06', '2026-07', '2026-09'])
    expect(out.latestActiveMonth).toBe('2026-09')
  })

  it('skips failed property audits gracefully', async () => {
    mockAuditProperty.mockResolvedValueOnce({ success: false, error: 'x', audit: null })
    const out = await fetchReservationActivity({ properties: ['Broken'], startDate: '', endDate: '', today: '2026-08-12' })
    expect(out).toEqual({ activeMonths: [], latestActiveMonth: null })
  })
})
