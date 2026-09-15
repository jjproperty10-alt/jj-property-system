/**
 * Guards for partner-sendable Avi PDF export (no Chrome chrome).
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  assertAviSendablePdfText,
  AVI_PDF_CHROME_FORBIDDEN,
} from '@/lib/partner-settlement/external-partner/aviReportPdf'
import { AVI_CERTIFIED_NET_EUR } from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'

describe('Avi PDF npm module resolution', () => {
  it('resolves puppeteer-core and @sparticuz/chromium from installed dependencies', () => {
    expect(() => require('puppeteer-core')).not.toThrow()
    expect(() => require('@sparticuz/chromium')).not.toThrow()
    const puppeteer = require('puppeteer-core') as { launch?: unknown }
    expect(typeof puppeteer.launch).toBe('function')
  })
})

describe('Avi sendable PDF text guards', () => {
  it('accepts JJ footer page numbers and rejects Chrome slash chrome', () => {
    const goodEn = `
Confidential · Villa Mazotos · Avi partner report · 14 September 2026
Page 1 of 8
Avi is owed €740.94
`
    const goodHe = `
סודי · וילה מזוטוס · דוח שותף אבי · 14 בספטמבר 2026
עמוד 1 מתוך 9
מגיע לאבי €740.94
`
    expect(assertAviSendablePdfText(goodEn).ok).toBe(true)
    expect(assertAviSendablePdfText(goodHe).ok).toBe(true)
    expect(AVI_CERTIFIED_NET_EUR).toBe(740.94)
  })

  it('rejects localhost / preview URL / Chrome date header / 1/9 chrome', () => {
    const bad = `
14/09/2026, 16:43
JJ — External Partner Report — Avi
localhost:47441/preview/avi-certified-compose
1/9
Avi is owed €740.94
`
    const result = assertAviSendablePdfText(bad)
    expect(result.ok).toBe(false)
    expect(result.failures.some((f) => f.includes('localhost'))).toBe(true)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'forbidden_marker:localhost',
        'forbidden_marker:preview/avi-certified-compose',
        'chrome_date_header',
        'chrome_slash_page_chrome',
        'missing_jj_page_numbers',
      ]),
    )
  })

  it('lists all required forbidden markers', () => {
    expect(AVI_PDF_CHROME_FORBIDDEN).toEqual(
      expect.arrayContaining(['localhost', '127.0.0.1', 'preview/avi-certified-compose']),
    )
  })

  it('does not log or stringify Cookie headers in the PDF exporter', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/aviReportPdf.ts'),
      'utf8',
    )
    const chrome = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/aviPdfChrome.ts'),
      'utf8',
    )
    expect(src).toContain('cookieHeader')
    expect(src).toContain('Never log this value')
    expect(src).not.toMatch(/console\.(log|info|debug|warn|error)/)
    expect(chrome).not.toMatch(/console\.(log|info|debug|warn|error)/)
    expect(chrome).not.toMatch(/cookieHeader|Cookie/)
  })
})
