/**
 * Avi react-pdf sendable guards — identity + no Chromium chrome markers in copy.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_PAID_EUR,
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  aviCertifiedIdentityIsSelfConsistent,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import { AVI_REPORT_COPY } from '@/components/finance/aviReportCopy'

describe('Avi react-pdf identity lock', () => {
  it('locks certified reconciliation used by screen and PDF', () => {
    expect(aviCertifiedIdentityIsSelfConsistent()).toBe(true)
    expect(AVI_CERTIFIED_PAID_EUR).toBe(280_600)
    expect(AVI_CERTIFIED_CREDITS_EUR).toBe(19_495.25)
    expect(AVI_CERTIFIED_OBLIGATION_EUR).toBe(299_501)
    expect(AVI_CERTIFIED_NET_EUR).toBe(594.25)
    expect(
      AVI_CERTIFIED_PAID_EUR + AVI_CERTIFIED_CREDITS_EUR - AVI_CERTIFIED_OBLIGATION_EUR,
    ).toBeCloseTo(AVI_CERTIFIED_NET_EUR, 2)
  })

  it('EN/HE closing narrative and footer copy embed locked net without Chrome chrome', () => {
    expect(AVI_REPORT_COPY.en.closingNarrative).toContain('€594.25')
    expect(AVI_REPORT_COPY.he.closingNarrative).toContain('€594.25')
    expect(AVI_REPORT_COPY.en.pageLabel).toBe('Page')
    expect(AVI_REPORT_COPY.en.pageOf).toBe('of')
    expect(AVI_REPORT_COPY.he.pageLabel).toBe('עמוד')
    expect(AVI_REPORT_COPY.he.pageOf).toBe('מתוך')
    expect(AVI_REPORT_COPY.en.footerConfidential).toBe('Confidential')
    expect(AVI_REPORT_COPY.he.footerConfidential).toBe('סודי')
  })

  it('Avi PDF module uses react-pdf and does not depend on puppeteer', () => {
    const pdfSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/AviPartnerReportPdf.tsx'),
      'utf8',
    )
    const routeSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/pdf/route.ts'),
      'utf8',
    )
    expect(pdfSrc).toContain('@react-pdf/renderer')
    expect(pdfSrc).toContain('closingNarrative')
    expect(pdfSrc).toContain('agreedTransactionValueEur')
    expect(pdfSrc).toContain('pageNumber')
    expect(pdfSrc).not.toMatch(/puppeteer|chromium|setContent|goto/)
    expect(routeSrc).toContain('renderAviPartnerReportPdf')
    expect(routeSrc).not.toMatch(/puppeteer|chromium/)
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/aviReportPdf.ts'),
      ),
    ).toBe(false)
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/aviPdfChrome.ts'),
      ),
    ).toBe(false)
  })
})
