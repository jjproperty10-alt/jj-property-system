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

type PdfOpts = {
  lang: string
  reportUrl: string
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
    buildMock.mockResolvedValue({ status: 'certified' })
    const res = await GET(req('he', 'sb-access-token=abc'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('x-avi-pdf-export')).toBe('jj-sendable-staff')
    expect(renderPdfMock).toHaveBeenCalledTimes(1)
    const opts = renderPdfMock.mock.calls[0][0]
    expect(opts.lang).toBe('he')
    expect(opts.reportUrl).toContain('/finance/external-partner/avi/print?lang=he')
    expect(opts.cookieHeader).toBe('sb-access-token=abc')
    expect(opts.langAlreadyApplied).toBe(true)
  })
})
