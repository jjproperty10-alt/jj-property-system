/**
 * September 2026 pool overlay is presentation-only and must stay out of the
 * Avi external report after the 2026-08-29 cutoff. Certified totals unchanged.
 */
import {
  AVI_PENDING_POOL_MONTHS,
  applyAviApprovedExpenseOverlay,
  pendingPoolInvoiceId,
} from '@/lib/partner-settlement/external-partner/aviExpenseOverlay'
import {
  AVI_AIRBNB_END_MONTH,
  AVI_AIRBNB_OPERATIONS_TOTAL_EUR,
  AVI_AIRBNB_OPERATIONS_AVI_EUR,
  AVI_AIRBNB_CHARGE_TOTAL_EUR,
  AVI_AIRBNB_CHARGE_AVI_EUR,
  aviMonthlyChargeMonths,
} from '@/lib/partner-settlement/external-partner/aviAirbnbDepartments'
import {
  AVI_CERTIFIED_PAID_EUR,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_NET_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from '@/lib/partner-settlement/external-partner/externalPartnerSnapshot'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'

describe('Avi September presentation overlay removal', () => {
  it('drops 2026-09-01 from pending pool months and creates no Sept row', () => {
    expect(AVI_PENDING_POOL_MONTHS).not.toContain('2026-09-01')
    expect(AVI_PENDING_POOL_MONTHS[AVI_PENDING_POOL_MONTHS.length - 1]).toBe('2026-08-01')
    expect(AVI_PENDING_POOL_MONTHS).toHaveLength(8)

    const overlay = applyAviApprovedExpenseOverlay([])
    const ids = overlay.map((r) => r.id)
    expect(ids).not.toContain('pending-ledger:pool-2026-09')
    expect(ids).toContain('pending-ledger:pool-2026-08')
    expect(ids.filter((id) => id.startsWith('pending-ledger:pool-'))).toHaveLength(8)
    expect(pendingPoolInvoiceId('2026-09-01')).toBe('pending-ledger:pool-2026-09')
  })

  it('keeps department pool months through August only and certified identity', () => {
    const poolMonths = aviMonthlyChargeMonths('Pool service')
    expect(AVI_AIRBNB_END_MONTH).toBe('2026-08')
    expect(VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.cutoffDate).toBe('2026-08-29')
    expect(poolMonths.includes('2026-09')).toBe(false)
    expect(poolMonths[poolMonths.length - 1]).toBe('2026-08')

    expect(AVI_AIRBNB_OPERATIONS_TOTAL_EUR).toBe(9181.8)
    expect(AVI_AIRBNB_OPERATIONS_AVI_EUR).toBe(4590.9)
    expect(AVI_AIRBNB_CHARGE_TOTAL_EUR).toBe(14887.86)
    expect(AVI_AIRBNB_CHARGE_AVI_EUR).toBe(7443.93)
    expect(AVI_CERTIFIED_PAID_EUR).toBe(280_600)
    expect(AVI_CERTIFIED_CREDITS_EUR).toBe(19_495.25)
    expect(AVI_CERTIFIED_OBLIGATION_EUR).toBe(299_501)
    expect(AVI_CERTIFIED_NET_EUR).toBe(594.25)
    expect(AVI_CERTIFIED_PAID_EUR + AVI_CERTIFIED_CREDITS_EUR - AVI_CERTIFIED_OBLIGATION_EUR).toBe(
      594.25,
    )
  })

  it('certified fixture DTO has no Sept pool and unchanged net', () => {
    const report = composeAviCertifiedCanonicalFixtureReport()
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return
    expect(report.partners.find((p) => p.partner === 'Avi')!.netEur).toBe(594.25)
    expect(report.partners.find((p) => p.partner === 'Avi')!.obligationEur).toBe(299_501)
    expect(report.partners.find((p) => p.partner === 'Avi')!.semanticNet).toBe(
      'Avi is owed €594.25',
    )
    expect(report.airbnb.operations.totalEur).toBe(9181.8)
    expect(report.partnerExpenses.some((e) => e.id === 'pending-ledger:pool-2026-09')).toBe(false)
    expect(report.partnerExpenses.some((e) => e.date?.startsWith('2026-09'))).toBe(false)
    expect(JSON.stringify(report)).not.toMatch(/654\.25|740\.94/)
  })
})
