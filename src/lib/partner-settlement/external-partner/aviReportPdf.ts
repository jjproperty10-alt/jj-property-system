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
 *
 * On Vercel Preview, Deployment Protection blocks the headless fetch of the
 * print HTML unless the caller's `_vercel_jwt` is applied via page.setCookie
 * and/or `VERCEL_AUTOMATION_BYPASS_SECRET` is forwarded as
 * `x-vercel-protection-bypass`. Staff session cookies are applied the same way
 * (Chromium strips Cookie from setExtraHTTPHeaders). Never log cookies, bypass
 * secrets, or report HTML.
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
  /**
   * Absolute URL of the live report page (staff print, preview, or share).
   * Used for goto navigation when `htmlContent` is not provided. Also used as
   * `<base href>` when rendering from in-process HTML so font/asset URLs resolve.
   */
  readonly reportUrl: string
  /**
   * Full HTML document for in-process PDF rendering (preferred on Vercel so
   * headless Chromium does not need a second protected HTTP round-trip).
   */
  readonly htmlContent?: string
  readonly chromeExecutablePath?: string
  /**
   * Forward the caller's Cookie header so staff-gated print URLs authenticate
   * the headless browser as the same session (via page.setCookie). Never log.
   */
  readonly cookieHeader?: string | null
  /**
   * When true, the target page already rendered the requested language
   * (e.g. /print?lang=he) — skip the in-page language toggle click.
   */
  readonly langAlreadyApplied?: boolean
  /** Test-only env override for protection-bypass header resolution. */
  readonly env?: Readonly<Record<string, string | undefined>>
}

export type AviPdfCookiePair = {
  readonly name: string
  readonly value: string
}

/**
 * Parse a raw Cookie request header into name/value pairs.
 * Chromium ignores Cookie in setExtraHTTPHeaders — callers must use setCookie.
 * Never log the returned values.
 */
export function parseAviPdfCookieHeader(
  cookieHeader: string | null | undefined,
): readonly AviPdfCookiePair[] {
  const raw = cookieHeader?.trim()
  if (!raw) return []
  const out: AviPdfCookiePair[] = []
  for (const part of raw.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!name) continue
    out.push({ name, value })
  }
  return out
}

/**
 * Extra HTTP headers for headless navigation (not Cookie).
 * Cookie must be applied via page.setCookie — Chromium strips Cookie from
 * setExtraHTTPHeaders. Values must never be logged.
 */
export function buildAviPdfNavigationHeaders(
  cookieHeader: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  void cookieHeader
  const headers: Record<string, string> = {}
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass
    headers['x-vercel-set-bypass-cookie'] = 'true'
  }
  return headers
}

/**
 * Render a partner-sendable A4 PDF: no Chrome headers/footers, JJ page chrome only.
 */
export async function renderAviPartnerReportPdf(
  opts: AviReportPdfOptions,
): Promise<Buffer> {
  const lang = opts.lang
  const generatedLabel = formatAviFullDate(new Date().toISOString().slice(0, 10), lang)
  let launch
  try {
    launch = await resolveAviPdfLaunchOptions({
      explicitExecutablePath: opts.chromeExecutablePath,
      env: opts.env,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    const staged = /^avi_pdf_stage:(.+)$/.exec(message)
    throw new Error(staged ? message : 'avi_pdf_stage:chromium_resolve')
  }

  let browser
  try {
    // Official Sparticuz + puppeteer-core launch shape for serverless.
    const args =
      typeof (puppeteer as { defaultArgs?: Function }).defaultArgs === 'function'
        ? (
            puppeteer as {
              defaultArgs: (opts: {
                args?: string[]
                headless?: boolean | 'shell'
              }) => string[]
            }
          ).defaultArgs({
            args: [...launch.args],
            headless: launch.headless,
          })
        : [...launch.args]
    browser = await puppeteer.launch({
      executablePath: launch.executablePath,
      headless: launch.headless,
      args,
      acceptInsecureCerts: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/shared librar|\.so\.|error while loading/i.test(message)) {
      throw new Error('avi_pdf_stage:chromium_launch_libs')
    }
    if (/ENOENT|no such file|does not exist/i.test(message)) {
      throw new Error('avi_pdf_stage:chromium_launch_missing')
    }
    if (/Timed out|timeout/i.test(message)) {
      throw new Error('avi_pdf_stage:chromium_launch_timeout')
    }
    throw new Error('avi_pdf_stage:chromium_launch')
  }

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 })
    const env = opts.env ?? process.env
    const navHeaders = buildAviPdfNavigationHeaders(opts.cookieHeader, env)
    if (Object.keys(navHeaders).length > 0) {
      await page.setExtraHTTPHeaders(navHeaders)
    }
    // Cookie cannot be set via setExtraHTTPHeaders (Chromium strips it).
    // Prefer url+secure so host-only HTTPS cookies (_vercel_jwt, session) stick.
    const cookiePairs = parseAviPdfCookieHeader(opts.cookieHeader)
    if (cookiePairs.length > 0) {
      const secure = opts.reportUrl.startsWith('https:')
      await page.setCookie(
        ...cookiePairs.map((c) => ({
          name: c.name,
          value: c.value,
          url: opts.reportUrl,
          secure,
          path: '/',
        })),
      )
    }
    try {
      if (opts.htmlContent) {
        await page.setContent(opts.htmlContent, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        })
      } else {
        await page.goto(opts.reportUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      }
      await page.waitForSelector('[data-testid="avi-report-certified"]', { timeout: 60_000 })
    } catch {
      throw new Error('avi_pdf_stage:chromium_content')
    }

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

    await page.evaluate((title) => {
      document.title = title
    }, AVI_REPORT_COPY[lang].reportTitle)

    try {
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: footerTemplate(lang, generatedLabel),
        margin: { top: '12mm', bottom: '16mm', left: '10mm', right: '10mm' },
      })
      return Buffer.from(pdf)
    } catch {
      throw new Error('avi_pdf_stage:chromium_pdf')
    }
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
