/**
 * Staff PDF route — auth fail-closed before PDF export; same certified DTO.
 */
jest.mock('server-only', () => ({}))

const authMock = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => authMock(),
}))

const buildMock = jest.fn()
jest.mock('@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport', () => ({
  buildAviExternalPartnerReport: () => buildMock(),
}))

jest.mock('@/components/finance/aviReportPresentation', () => ({
  sanitizeAviReportClientPayload: (report: unknown) => report,
}))

jest.mock('@/components/finance/ExternalPartnerAviReportView', () => ({
  ExternalPartnerAviReportView: () =>
    require('react').createElement(
      'div',
      { 'data-testid': 'avi-report-certified', 'data-avi-lang': 'he' },
      'certified-print',
    ),
}))

type PdfOpts = {
  lang: string
  reportUrl: string
  htmlContent?: string
  cookieHeader: string | null
  langAlreadyApplied: boolean
}

const renderPdfMock = jest.fn<Promise<Buffer>, [PdfOpts]>(async () =>
  Buffer.from('%PDF-staff'),
)
jest.mock('@/lib/partner-settlement/external-partner/aviReportPdf', () => ({
  renderAviPartnerReportPdf: (opts: PdfOpts) => renderPdfMock(opts),
}))

import { GET } from '@/app/(app)/finance/external-partner/avi/pdf/route'

beforeEach(() => {
  authMock.mockReset()
  buildMock.mockReset()
  renderPdfMock.mockClear()
})

function req(lang: 'he' | 'en' = 'en', cookie = 'sb=session') {
  return new Request(
    `http://127.0.0.1:3000/finance/external-partner/avi/pdf?lang=${lang}`,
    { headers: cookie ? { cookie } : {} },
  )
}

describe('GET /finance/external-partner/avi/pdf', () => {
  it('no session → redirect to login, no PDF render', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const res = await GET(req())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(buildMock).not.toHaveBeenCalled()
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('non-staff → 404, no PDF render', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    const res = await GET(req())
    expect(res.status).toBe(404)
    expect(buildMock).not.toHaveBeenCalled()
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('inactive staff → 404, no PDF render', async () => {
    authMock.mockResolvedValue({ ok: false, error: 'STAFF_INACTIVE' })
    const res = await GET(req())
    expect(res.status).toBe(404)
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('staff but non-certified report → 404, no PDF render', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({ status: 'failed', failures: ['x'] })
    const res = await GET(req())
    expect(res.status).toBe(404)
    expect(buildMock).toHaveBeenCalledTimes(1)
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('authorized staff + certified → PDF with cookie forward and print URL', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({
      status: 'certified',
      partners: [{ partner: 'Avi', netEur: 594.25 }],
    })
    const res = await GET(req('he', 'sb-access-token=abc'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toContain('avi-partner-report-he.pdf')
    expect(res.headers.get('x-avi-pdf-export')).toBe('jj-sendable-staff')
    expect(renderPdfMock).toHaveBeenCalledTimes(1)
    const opts = renderPdfMock.mock.calls[0][0]
    expect(opts.lang).toBe('he')
    expect(opts.reportUrl).toContain('/finance/external-partner/avi/print?lang=he')
    expect(opts.htmlContent).toEqual(expect.stringContaining('data-testid="avi-report-certified"'))
    expect(opts.cookieHeader).toBe('sb-access-token=abc')
    expect(opts.langAlreadyApplied).toBe(true)
  })

  it('PDF launch failure returns a generic 500 without leaking cookies or paths', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({ status: 'certified' })
    renderPdfMock.mockRejectedValueOnce(
      new Error('Failed to launch /usr/bin/google-chrome cookie=sb-access-token=abc'),
    )
    const res = await GET(req('en', 'sb-access-token=abc'))
    expect(res.status).toBe(500)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ error: 'avi_staff_pdf_export_failed' })
    expect(JSON.stringify(body)).not.toMatch(/google-chrome|sb-access-token|cookie/i)
  })

  it('staff PDF route stays Node.js runtime and authentication-gated', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/pdf/route.ts'),
      'utf8',
    )
    expect(src).toContain("export const runtime = 'nodejs'")
    expect(src).not.toContain("runtime = 'edge'")
    expect(src).toContain('authenticateStatementUser')
    expect(src).toContain('cookieHeader: req.headers.get(\'cookie\')')
    expect(src).not.toMatch(/console\.(log|info|debug|warn|error)/)
  })
})
