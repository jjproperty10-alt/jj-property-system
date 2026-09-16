/**
 * /finance/external-partner — staff index page.
 *
 * Proves the index inherits the Avi report's fail-closed guard (no session →
 * login, anything else → 404, report never built), links to exactly the three
 * approved destinations, reads its figures from the certified DTO rather than
 * literals, and leaks none of the forbidden internal amounts.
 */
jest.mock('server-only', () => ({}))

const redirectMock = jest.fn((url: string) => {
  throw new Error('REDIRECT:' + url)
})
const notFoundMock = jest.fn(() => {
  throw new Error('NOT_FOUND')
})
jest.mock('next/navigation', () => ({
  redirect: (u: string) => redirectMock(u),
  notFound: () => notFoundMock(),
}))

const authMock = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => authMock(),
}))

const buildMock = jest.fn()
jest.mock(
  '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport',
  () => ({
    buildAviExternalPartnerReport: () => buildMock(),
  }),
)

import * as fs from 'fs'
import * as path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from '@/app/(app)/finance/external-partner/page'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import { AVI_PARTNER_FORBIDDEN_MARKERS } from '@/components/finance/aviReportPresentation'

const PAGE_SRC_PATH = 'src/app/(app)/finance/external-partner/page.tsx'
const certifiedReport = composeAviCertifiedCanonicalFixtureReport()

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  buildMock.mockClear()
  buildMock.mockResolvedValue(certifiedReport)
})

async function renderPage(): Promise<string> {
  authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
  return renderToStaticMarkup(await Page())
}

describe('Partner Reports index — staff authorization (fail closed)', () => {
  it('no session → redirect(/login), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(Page()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('authenticated non-staff → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('inactive staff → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('auth error → notFound(), report NOT built', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'AUTH_ERROR' })
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(buildMock).not.toHaveBeenCalled()
  })

  it('authorized staff → report built once, guard runs first', async () => {
    await renderPage()
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).not.toHaveBeenCalled()
    expect(notFoundMock).not.toHaveBeenCalled()
  })

  it('uses the same guard module as the Avi report page', () => {
    const indexSrc = fs.readFileSync(path.join(process.cwd(), PAGE_SRC_PATH), 'utf8')
    const aviSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/page.tsx'),
      'utf8',
    )
    for (const src of [indexSrc, aviSrc]) {
      expect(src).toContain(
        "import { authenticateStatementUser } from '@/lib/statements/statementAuthService'",
      )
      expect(src).toContain("redirect('/login')")
      expect(src).toContain('notFound()')
    }
  })
})

describe('Partner Reports index — content', () => {
  it('renders one card for the Avi external partner report, bilingual', async () => {
    const html = await renderPage()
    expect(html).toContain('External Partner Report — Avi')
    expect(html).toContain('דוח שותף חיצוני — אבי')
    expect((html.match(/data-testid="external-partner-avi-card"/g) ?? []).length).toBe(1)
  })

  it('shows Certified status', async () => {
    const html = await renderPage()
    expect(html).toContain('Certified')
  })

  it('shows the cutoff date from the DTO snapshot, not a literal', async () => {
    const html = await renderPage()
    if (certifiedReport.status !== 'certified') throw new Error('fixture not certified')
    expect(certifiedReport.snapshot.cutoffDate).toBe('2026-08-29')
    expect(html).toContain('29 August 2026')
    expect(html).toContain('באוגוסט')

    const src = fs.readFileSync(path.join(process.cwd(), PAGE_SRC_PATH), 'utf8')
    expect(src).toContain('snapshot.cutoffDate')
    expect(src).not.toContain('2026-08-29')
    expect(src).not.toContain('29 August 2026')
  })

  it('shows the Hebrew owed line from the DTO semantic net', async () => {
    const html = await renderPage()
    if (certifiedReport.status !== 'certified') throw new Error('fixture not certified')
    const avi = certifiedReport.partners.find((p) => p.partner === 'Avi')
    expect(avi?.semanticNet).toBe('Avi is owed €594.25')
    expect(html).toContain('מגיע לאבי €594.25')
    expect(html).toContain('Avi is owed €594.25')
  })

  it('does not hard-code any settlement figure in the page source', () => {
    const src = fs.readFileSync(path.join(process.cwd(), PAGE_SRC_PATH), 'utf8')
    expect(src).not.toMatch(/\b594\.25\b/)
    expect(src).not.toMatch(/\b280[,_ ]?600\b/)
    expect(src).not.toMatch(/\b19[,_ ]?495\.25\b/)
    expect(src).not.toMatch(/\b299[,_ ]?501\b/)
    expect(src).not.toMatch(/\b500[,_ ]?000\b/)
    expect(src).not.toMatch(/\b400[,_ ]?000\b/)
  })

  it('sends the back arrow to the app root, never to /finance', async () => {
    const html = await renderPage()
    expect(html).toContain('href="/"')
    expect(html).not.toContain('href="/finance"')
    const src = fs.readFileSync(path.join(process.cwd(), PAGE_SRC_PATH), 'utf8')
    expect(src).toContain('backRoute="/"')
    expect(src).not.toContain('backRoute="/finance"')
  })

  it('links to the report and to both PDF languages', async () => {
    const html = await renderPage()
    expect(html).toContain('href="/finance/external-partner/avi"')
    expect(html).toContain('href="/finance/external-partner/avi/pdf?lang=he"')
    expect(html).toContain('href="/finance/external-partner/avi/pdf?lang=en"')
    expect(html).toContain('פתיחת הדוח')
    expect(html).toContain('הורדת PDF בעברית')
    expect(html).toContain('Download English PDF')
  })

  it('omits forbidden internal markers and amounts', async () => {
    const html = await renderPage()
    for (const marker of AVI_PARTNER_FORBIDDEN_MARKERS) {
      if (marker === 'Preview' || marker === 'fixture') continue
      expect(html).not.toContain(marker)
    }
    expect(html).not.toMatch(/400[, ]?000/)
    expect(html).not.toContain('740.94')
  })

  it('shows no amounts and no PDF actions when the report is not certified', async () => {
    buildMock.mockResolvedValue({
      status: 'failed',
      property: 'Villa Mazotos',
      controlStatus: {
        reconciliationPassed: false,
        settlementComputed: false,
        attributionOk: false,
        failures: ['identity mismatch'],
      },
      failures: ['identity mismatch'],
    })
    const html = await renderPage()
    expect(html).not.toContain('594.25')
    expect(html).not.toContain('lang=he')
    expect(html).not.toContain('lang=en')
    expect(html).toContain('href="/finance/external-partner/avi"')
  })
})
