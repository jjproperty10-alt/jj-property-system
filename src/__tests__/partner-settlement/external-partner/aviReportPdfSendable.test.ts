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
Avi is owed €594.25
`
    const goodHe = `
סודי · וילה מזוטוס · דוח שותף אבי · 14 בספטמבר 2026
עמוד 1 מתוך 9
מגיע לאבי €594.25
`
    expect(assertAviSendablePdfText(goodEn).ok).toBe(true)
    expect(assertAviSendablePdfText(goodHe).ok).toBe(true)
    expect(AVI_CERTIFIED_NET_EUR).toBe(594.25)
  })

  it('rejects localhost / preview URL / Chrome date header / 1/9 chrome', () => {
    const bad = `
14/09/2026, 16:43
JJ — External Partner Report — Avi
localhost:47441/preview/avi-certified-compose
1/9
Avi is owed €594.25
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
    expect(src).toContain('Never log')
    expect(src).toContain('x-vercel-protection-bypass')
    expect(src).toContain('buildAviPdfNavigationHeaders')
    expect(src).toContain('parseAviPdfCookieHeader')
    expect(src).toContain('page.setCookie')
    expect(src).toContain("waitUntil: 'domcontentloaded'")
    expect(src).not.toMatch(/console\.(log|info|debug|warn|error)/)
    expect(chrome).not.toMatch(/console\.(log|info|debug|warn|error)/)
    expect(chrome).not.toMatch(/cookieHeader|Cookie/)
  })
})

describe('buildAviPdfNavigationHeaders + parseAviPdfCookieHeader', () => {
  const {
    buildAviPdfNavigationHeaders,
    parseAviPdfCookieHeader,
  } = require('@/lib/partner-settlement/external-partner/aviReportPdf') as typeof import('@/lib/partner-settlement/external-partner/aviReportPdf')

  it('puts Vercel bypass in headers and parses Cookie pairs for setCookie', () => {
    const both = buildAviPdfNavigationHeaders('sb-access-token=abc; _vercel_jwt=prot', {
      VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret',
    })
    expect(both.Cookie).toBeUndefined()
    expect(both['x-vercel-protection-bypass']).toBe('bypass-secret')
    expect(both['x-vercel-set-bypass-cookie']).toBe('true')

    expect(parseAviPdfCookieHeader('sb-access-token=abc; _vercel_jwt=prot')).toEqual([
      { name: 'sb-access-token', value: 'abc' },
      { name: '_vercel_jwt', value: 'prot' },
    ])

    const cookieOnlyHeaders = buildAviPdfNavigationHeaders('a=1', {})
    expect(cookieOnlyHeaders).toEqual({})
    expect(parseAviPdfCookieHeader('a=1')).toEqual([{ name: 'a', value: '1' }])

    const bypassOnly = buildAviPdfNavigationHeaders(null, {
      VERCEL_AUTOMATION_BYPASS_SECRET: ' only-bypass ',
    })
    expect(bypassOnly).toEqual({
      'x-vercel-protection-bypass': 'only-bypass',
      'x-vercel-set-bypass-cookie': 'true',
    })
    expect(parseAviPdfCookieHeader(null)).toEqual([])
  })
})
