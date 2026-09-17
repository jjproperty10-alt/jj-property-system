import * as fs from 'fs'
import * as path from 'path'
import { AVI_HOSTAWAY_STAYS, AVI_HOSTAWAY_STAY_COUNT } from '@/lib/partner-settlement/external-partner/aviHostawayStays'
import { aviCertifiedReservationIdSet } from '../aviCertifiedReservationIds'

describe('aviCertifiedReservationIdSet', () => {
  it('derives IDs from AVI_HOSTAWAY_STAYS without a second copied list', () => {
    const ids = aviCertifiedReservationIdSet()
    expect(ids.size).toBe(AVI_HOSTAWAY_STAY_COUNT)
    expect(ids.size).toBe(AVI_HOSTAWAY_STAYS.length)
    expect(ids.has('53139113')).toBe(true)
    for (const stay of AVI_HOSTAWAY_STAYS) {
      expect(ids.has(stay.reservationId)).toBe(true)
    }

    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partnership-workspace/aviCertifiedReservationIds.ts'),
      'utf8',
    )
    expect(src).toContain('AVI_HOSTAWAY_STAYS')
    expect(src).toContain('stay.reservationId')
    expect(src).not.toContain('53139113')
    expect(src).not.toContain('45281078')
    expect(src).not.toMatch(/reservationId:\s*'/)
  })

  it('does not include the explicit inquiry exclusion 47817104', () => {
    expect(aviCertifiedReservationIdSet().has('47817104')).toBe(false)
  })
})
