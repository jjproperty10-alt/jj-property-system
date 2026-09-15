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

const fetchPrintMock = jest.fn()
jest.mock('@/lib/partner-settlement/external-partner/aviStaffPrintFetch', () => ({
  fetchAviStaffPrintHtml: (opts: unknown) => fetchPrintMock(opts),
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
  fetchPrintMock.mockReset()
  renderPdfMock.mockClear()
  fetchPrintMock.mockResolvedValue({
    ok: true,
    html: '<div data-testid="avi-report-certified">ok</div>',
  })
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
    expect(fetchPrintMock).not.toHaveBeenCalled()
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

  it('authorized staff + certified → PDF via print HTML fetch + setContent', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({
      status: 'certified',
      partners: [{ partner: 'Avi', netEur: 594.25 }],
    })
    const res = await GET(req('he', 'sb-access-token=abc; _vercel_jwt=prot'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toContain('avi-partner-report-he.pdf')
    expect(res.headers.get('x-avi-pdf-export')).toBe('jj-sendable-staff')
    expect(fetchPrintMock).toHaveBeenCalledTimes(1)
    expect(fetchPrintMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        printUrl: expect.stringContaining('/finance/external-partner/avi/print?lang=he'),
        cookieHeader: 'sb-access-token=abc; _vercel_jwt=prot',
      }),
    )
    expect(renderPdfMock).toHaveBeenCalledTimes(1)
    const opts = renderPdfMock.mock.calls[0][0]
    expect(opts.lang).toBe('he')
    expect(opts.htmlContent).toContain('avi-report-certified')
    expect(opts.cookieHeader).toBe('sb-access-token=abc; _vercel_jwt=prot')
    expect(opts.langAlreadyApplied).toBe(true)
  })

  it('print fetch failure returns staged 500 without leaking cookies', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({ status: 'certified' })
    fetchPrintMock.mockResolvedValueOnce({ ok: false, stage: 'print_http_401' })
    const res = await GET(req('en', 'sb-access-token=abc'))
    expect(res.status).toBe(500)
    expect(res.headers.get('x-avi-pdf-fail-stage')).toBe('print_http_401')
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ error: 'avi_staff_pdf_export_failed' })
    expect(JSON.stringify(body)).not.toMatch(/sb-access-token|cookie/i)
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('PDF launch failure returns chromium stage without leaking paths', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({ status: 'certified' })
    renderPdfMock.mockRejectedValueOnce(new Error('avi_pdf_stage:chromium_launch'))
    const res = await GET(req('en', 'sb-access-token=abc'))
    expect(res.status).toBe(500)
    expect(res.headers.get('x-avi-pdf-fail-stage')).toBe('chromium_launch')
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
    expect(src).toContain('fetchAviStaffPrintHtml')
    expect(src).toContain('X-Avi-Pdf-Fail-Stage')
    expect(src).not.toMatch(/console\.(log|info|debug|warn|error)/)
  })
})
