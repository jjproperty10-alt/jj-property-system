/**
 * AviPartnerReportPdf — identity lock: certified fixture DTO ↔ PDF module contract.
 */
import * as fs from 'fs'
import * as path from 'path'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import {
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_PAID_EUR,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import { AVI_REPORT_COPY } from '@/components/finance/aviReportCopy'

describe('AviPartnerReportPdf certified fixture contract', () => {
  it('fixture DTO matches locked identity the PDF must display', () => {
    const report = composeAviCertifiedCanonicalFixtureReport()
    expect(report.status).toBe('certified')
    if (report.status !== 'certified') return

    const avi = report.partners.find((p) => p.partner === 'Avi')
    expect(avi?.netEur).toBe(AVI_CERTIFIED_NET_EUR)
    expect(avi?.paidEur).toBe(AVI_CERTIFIED_PAID_EUR)
    expect(avi?.creditsEur).toBe(AVI_CERTIFIED_CREDITS_EUR)
    expect(avi?.obligationEur).toBe(AVI_CERTIFIED_OBLIGATION_EUR)
    expect(report.finalSummary.netEur).toBe(AVI_CERTIFIED_NET_EUR)
    expect(report.acquisition.agreedTransactionValueEur).toBe(500_000)
    expect(report.snapshot.cutoffDate).toBe('2026-08-29')
  })

  it('PDF document source binds DTO fields and locked copy (no Chromium)', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/AviPartnerReportPdf.tsx'),
      'utf8',
    )
    expect(src).toContain('@react-pdf/renderer')
    expect(src).toContain('report.finalSummary.netEur')
    expect(src).toContain('report.acquisition.agreedTransactionValueEur')
    expect(src).toContain('report.partnerPayments')
    expect(src).toContain('closingNarrative')
    expect(src).toContain('pageNumber')
    expect(src).toContain('totalPages')
    expect(src).toContain(AVI_REPORT_COPY.en.pageOf === 'of' ? 'pageOf' : 'pageOf')
    expect(src).not.toMatch(/puppeteer|chromium|setContent|page\.goto/)
  })
})
