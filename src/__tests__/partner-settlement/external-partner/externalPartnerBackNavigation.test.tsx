/**
 * Back-navigation contract for the external-partner surfaces.
 *
 * /finance has no page component, so any back arrow pointing there dead-ends
 * on a 404. These tests lock the two approved destinations and prove both
 * resolve to a real route file:
 *
 *   /finance/external-partner       -> back to  /
 *   /finance/external-partner/avi   -> back to  /finance/external-partner
 *
 * The missing /finance page is tracked separately and must not be worked
 * around by re-pointing partner reports at it.
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

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
})

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

// Heavy report body is irrelevant here; the design-system header stays real so
// the assertions read the actually rendered href.
jest.mock('@/components/finance/ExternalPartnerAviReportView', () => ({
  ExternalPartnerAviReportView: () => null,
}))
jest.mock('@/components/finance/AviReportPrintButton', () => ({
  AviReportPrintButton: () => null,
}))
jest.mock('@/components/finance/AviShareLinkButton', () => ({
  AviShareLinkButton: () => null,
}))

import React from 'react'
import * as fs from 'fs'
import * as path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import IndexPage from '@/app/(app)/finance/external-partner/page'
import AviPage from '@/app/(app)/finance/external-partner/avi/page'
import AviLoading from '@/app/(app)/finance/external-partner/avi/loading'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'

const INDEX_ROUTE = '/finance/external-partner'
const ROOT_ROUTE = '/'

/** Every partner-report surface that can render a link. */
const PARTNER_SURFACES = [
  'src/app/(app)/finance/external-partner/page.tsx',
  'src/app/(app)/finance/external-partner/avi/page.tsx',
  'src/app/(app)/finance/external-partner/avi/loading.tsx',
  'src/app/(app)/finance/external-partner/avi/print/page.tsx',
]

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
}

beforeEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
  authMock.mockClear()
  authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
  buildMock.mockReset()
  buildMock.mockResolvedValue(composeAviCertifiedCanonicalFixtureReport())
})

describe('external-partner back navigation', () => {
  it('index page back arrow goes to the app root', async () => {
    const html = renderToStaticMarkup(await IndexPage())
    expect(html).toMatch(new RegExp(`href="${ROOT_ROUTE}"[^>]*aria-label="Go back"`))
  })

  it('Avi report back arrow goes to the partner-report index', async () => {
    const html = renderToStaticMarkup(await AviPage())
    expect(html).toMatch(new RegExp(`href="${INDEX_ROUTE}"[^>]*aria-label="Go back"`))
  })

  it('Avi loading skeleton uses the same back target as the loaded page', () => {
    const html = renderToStaticMarkup(<AviLoading />)
    expect(html).toMatch(new RegExp(`href="${INDEX_ROUTE}"[^>]*aria-label="Go back"`))
  })

  it('no partner-report surface links to /finance', () => {
    for (const rel of PARTNER_SURFACES) {
      const src = read(rel)
      expect(src).not.toContain('backRoute="/finance"')
      expect(src).not.toContain("backRoute='/finance'")
      expect(src).not.toContain('href="/finance"')
      expect(src).not.toContain("href='/finance'")
    }
  })

  it('no partner-report surface renders an href of exactly /finance', async () => {
    const rendered = [
      renderToStaticMarkup(await IndexPage()),
      renderToStaticMarkup(await AviPage()),
      renderToStaticMarkup(<AviLoading />),
    ]
    for (const html of rendered) {
      const hrefs = Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1])
      expect(hrefs).not.toContain('/finance')
      // Nested partner routes are fine — only the bare /finance dead-ends.
      for (const href of hrefs) {
        if (href.startsWith('/finance')) {
          expect(href.startsWith(INDEX_ROUTE)).toBe(true)
        }
      }
    }
  })

  it('both back targets resolve to a real route file', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/(app)/page.tsx'))).toBe(true)
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'src/app/(app)/finance/external-partner/page.tsx'),
      ),
    ).toBe(true)
  })

  it('documents that /finance still has no page (tracked separately)', () => {
    // If this ever becomes true, the back targets above may be revisited —
    // deliberately, not by accident.
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/(app)/finance/page.tsx'))).toBe(
      false,
    )
  })
})
