/**
 * Headless A4 PDF export for the certified Avi partner report.
 * Presentation only — no settlement math.
 *
 * Why this exists:
 * Chrome's interactive Print dialog injects date / document title / URL /
 * "1/9" chrome when "Headers and footers" is checked. That exposes
 * localhost/preview and is not partner-sendable. This exporter uses
 * Chromium Page.printToPDF with an empty header and a JJ footer template
 * (Page N of M / עמוד N מתוך M) so sendable PDFs never carry Chrome chrome.
 */
import puppeteer from 'puppeteer-core'
import { AVI_REPORT_COPY, type AviReportLang } from '@/components/finance/aviReportCopy'
import { formatAviFullDate } from '@/components/finance/aviReportCopy'
import { resolveAviPdfLaunchOptions } from './aviPdfChrome'

export const AVI_PDF_CHROME_FORBIDDEN = [
  'localhost',
  '127.0.0.1',
  'preview/avi-certified-compose',
] as const

/** Chrome default header date patterns that must never appear in sendable PDFs. */
export const AVI_PDF_CHROME_DATE_HEADER_RE =
  /\b\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\b/

/** Chrome default page chrome like "1/9" (not "Page 1 of 9" / "עמוד 1 מתוך 9"). */
export const AVI_PDF_CHROME_SLASH_PAGE_RE = /(?:^|\s)\d{1,2}\/\d{1,2}(?:\s|$)/

function footerTemplate(lang: AviReportLang, generatedLabel: string): string {
  const copy = AVI_REPORT_COPY[lang]
  const dir = lang === 'he' ? 'rtl' : 'ltr'
  return `<div style="font-size:8px;width:100%;padding:0 10mm;color:#64748b;display:flex;justify-content:space-between;align-items:center;direction:${dir};font-family:Heebo,Arial,sans-serif;box-sizing:border-box;">
    <span>${copy.footerConfidential} · ${copy.propertyName} · ${copy.footerPartnerReport} · ${generatedLabel}</span>
    <span>${copy.pageLabel} <span class="pageNumber"></span> ${copy.pageOf} <span class="totalPages"></span></span>
  </div>`
}

export type AviReportPdfOptions = {
  readonly lang: AviReportLang
  /** Absolute URL of the live report page (staff print, preview, or share). */
  readonly reportUrl: string
  readonly chromeExecutablePath?: string
  /**
   * Forward the caller's Cookie header so staff-gated print URLs authenticate
   * the headless browser as the same session. Never log this value.
   */
  readonly cookieHeader?: string | null
  /**
   * When true, the target page already rendered the requested language
   * (e.g. /print?lang=he) — skip the in-page language toggle click.
   */
  readonly langAlreadyApplied?: boolean
}

/**
 * Render a partner-sendable A4 PDF: no Chrome headers/footers, JJ page chrome only.
 */
export async function renderAviPartnerReportPdf(
  opts: AviReportPdfOptions,
): Promise<Buffer> {
  const lang = opts.lang
  const generatedLabel = formatAviFullDate(new Date().toISOString().slice(0, 10), lang)
  const launch = await resolveAviPdfLaunchOptions({
    explicitExecutablePath: opts.chromeExecutablePath,
  })
  const browser = await puppeteer.launch({
    executablePath: launch.executablePath,
    headless: launch.headless,
    args: [...launch.args],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 })
    if (opts.cookieHeader) {
      await page.setExtraHTTPHeaders({ Cookie: opts.cookieHeader })
    }
    await page.goto(opts.reportUrl, { waitUntil: 'networkidle0', timeout: 120_000 })
    await page.waitForSelector('[data-testid="avi-report-certified"]', { timeout: 60_000 })

    if (lang === 'he' && !opts.langAlreadyApplied) {
      await page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll('[data-testid="avi-language-toggle"] button'),
        )
        const he = buttons.find((b) => /עברית|Hebrew|HE/i.test(b.textContent || ''))
        if (he instanceof HTMLElement) he.click()
      })
      await page.waitForFunction(
        () => document.querySelector('[data-avi-lang="he"]') != null,
        { timeout: 15_000 },
      )
      await new Promise((r) => setTimeout(r, 400))
    }

    // Neutral title — never leave a preview/localhost hint in the document title
    // even if an operator later re-prints with Chrome headers enabled.
    await page.evaluate((title) => {
      document.title = title
    }, AVI_REPORT_COPY[lang].reportTitle)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      // Empty header = no Chrome date/title/URL band.
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerTemplate(lang, generatedLabel),
      margin: { top: '12mm', bottom: '16mm', left: '10mm', right: '10mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

function normalizePdfText(pdfText: string): string {
  // Strip bidi isolates Chromium may inject around numbers in Hebrew extracts.
  return pdfText.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
}

/** Fail-closed text checks for a sendable Avi PDF (from pdftotext or similar). */
export function assertAviSendablePdfText(pdfText: string): {
  readonly ok: boolean
  readonly failures: readonly string[]
} {
  const text = normalizePdfText(pdfText)
  const failures: string[] = []
  const lower = text.toLowerCase()
  for (const marker of AVI_PDF_CHROME_FORBIDDEN) {
    if (lower.includes(marker.toLowerCase())) {
      failures.push(`forbidden_marker:${marker}`)
    }
  }
  if (AVI_PDF_CHROME_DATE_HEADER_RE.test(text)) {
    failures.push('chrome_date_header')
  }
  // Reject bare Chrome "1/9" pagination; allow "Page 1 of 9" / "עמוד 1 מתוך 9".
  const withoutJjPages = text
    .replace(/Page\s*\d+\s*of\s*\d+/gi, '')
    .replace(/עמוד\s*\d+\s*מתוך\s*\d+/g, '')
  if (AVI_PDF_CHROME_SLASH_PAGE_RE.test(withoutJjPages)) {
    failures.push('chrome_slash_page_chrome')
  }
  const hasJjEn = /Page\s*\d+\s*of\s*\d+/i.test(text)
  const hasJjHe = /עמוד\s*\d+\s*מתוך\s*\d+/.test(text)
  if (!hasJjEn && !hasJjHe) {
    failures.push('missing_jj_page_numbers')
  }
  return { ok: failures.length === 0, failures }
}
