/**
 * Staff PDF route — auth fail-closed; react-pdf buffer; same certified DTO.
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

const renderPdfMock = jest.fn(
  async (_report?: unknown, _lang?: unknown) => Buffer.from('%PDF-staff-react'),
)
jest.mock('@/lib/pdf/renderAviPartnerReportPdf', () => ({
  renderAviPartnerReportPdf: (report: unknown, lang: unknown) => renderPdfMock(report, lang),
}))

import { GET } from '@/app/(app)/finance/external-partner/avi/pdf/route'

beforeEach(() => {
  authMock.mockReset()
  buildMock.mockReset()
  renderPdfMock.mockClear()
  renderPdfMock.mockResolvedValue(Buffer.from('%PDF-staff-react'))
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
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('staff but non-certified report → 404, no PDF render', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({ status: 'failed', failures: ['x'] })
    const res = await GET(req())
    expect(res.status).toBe(404)
    expect(renderPdfMock).not.toHaveBeenCalled()
  })

  it('authorized staff + certified → react-pdf buffer with identity-bearing DTO', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    const certified = {
      status: 'certified' as const,
      partners: [{ partner: 'Avi', netEur: 594.25, semanticNet: 'Avi is owed €594.25' }],
      finalSummary: { netEur: 594.25 },
      acquisition: { agreedTransactionValueEur: 500_000 },
    }
    buildMock.mockResolvedValue(certified)
    const res = await GET(req('he', 'sb-access-token=abc'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toContain('avi-partner-report-he.pdf')
    expect(res.headers.get('x-avi-pdf-export')).toBe('jj-sendable-staff')
    expect(res.headers.get('x-avi-pdf-engine')).toBe('react-pdf')
    expect(renderPdfMock).toHaveBeenCalledTimes(1)
    expect(renderPdfMock.mock.calls[0][0]).toMatchObject({
      status: 'certified',
      finalSummary: { netEur: 594.25 },
      acquisition: { agreedTransactionValueEur: 500_000 },
    })
    expect(renderPdfMock.mock.calls[0][1]).toBe('he')
  })

  it('PDF render failure returns generic 500 without leaking internals', async () => {
    authMock.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1', isActive: true })
    buildMock.mockResolvedValue({ status: 'certified' })
    renderPdfMock.mockRejectedValueOnce(new Error('font missing /tmp/secret'))
    const res = await GET(req('en'))
    expect(res.status).toBe(500)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ error: 'avi_staff_pdf_export_failed' })
    expect(JSON.stringify(body)).not.toMatch(/font missing|\/tmp|secret/i)
  })

  it('staff PDF route stays Node.js and does not import puppeteer', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(app)/finance/external-partner/avi/pdf/route.ts'),
      'utf8',
    )
    expect(src).toContain("export const runtime = 'nodejs'")
    expect(src).toContain('authenticateStatementUser')
    expect(src).toContain('renderAviPartnerReportPdf')
    expect(src).not.toMatch(/puppeteer|chromium|aviReportPdf|htmlContent|fetchAviStaffPrintHtml/)
  })
})
