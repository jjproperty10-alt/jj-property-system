/**
 * Fixture Preview composer must certify Avi is owed €594.25 from the canonical CSV.
 */
jest.mock('server-only', () => ({}))

import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import {
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_PAID_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'

describe('aviCanonicalComposeFixture', () => {
  it('composes a certified report at Avi is owed €594.25', () => {
    const report = composeAviCertifiedCanonicalFixtureReport()
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    const avi = report.partners.find((p) => p.partner === 'Avi')!
    expect(avi.paidEur).toBe(AVI_CERTIFIED_PAID_EUR)
    expect(avi.creditsEur).toBe(AVI_CERTIFIED_CREDITS_EUR)
    expect(avi.obligationEur).toBe(AVI_CERTIFIED_OBLIGATION_EUR)
    expect(avi.netEur).toBe(AVI_CERTIFIED_NET_EUR)
    expect(avi.semanticNet).toBe('Avi is owed €594.25')
  })
})
