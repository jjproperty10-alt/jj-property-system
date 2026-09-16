/**
 * Preview compose routes must hard-404 when the production gate denies.
 */
jest.mock('server-only', () => ({}))

jest.mock('@/lib/partner-settlement/external-partner/aviComposePreviewGate', () => ({
  isAviCertifiedComposePreviewAllowed: jest.fn(),
}))

jest.mock('@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture', () => ({
  composeAviCertifiedCanonicalFixtureReport: jest.fn(() => ({ status: 'certified' })),
}))

jest.mock('@/components/finance/aviReportPresentation', () => ({
  sanitizeAviReportClientPayload: (r: unknown) => r,
}))

jest.mock('@/components/finance/ExternalPartnerAviReportView', () => ({
  ExternalPartnerAviReportView: () => null,
}))

jest.mock('@/components/ds', () => ({
  PageShell: (props: { children: unknown }) => props.children,
}))

jest.mock('@/lib/pdf/AviPartnerReportPdf', () => ({
  AviPartnerReportPdf: 'AviPartnerReportPdf',
}))

jest.mock('@/lib/pdf/registerJjPdfFonts', () => ({
  registerJjPdfFonts: jest.fn(),
}))

jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: jest.fn(async () => Buffer.from('%PDF')),
  Font: { register: jest.fn() },
}))

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NOT_FOUND')
  }),
}))

import { notFound } from 'next/navigation'
import { isAviCertifiedComposePreviewAllowed } from '@/lib/partner-settlement/external-partner/aviComposePreviewGate'
import PreviewPage from '@/app/preview/avi-certified-compose/page'
import { GET as PreviewPdfGet } from '@/app/preview/avi-certified-compose/pdf/route'

const allowed = isAviCertifiedComposePreviewAllowed as jest.MockedFunction<
  typeof isAviCertifiedComposePreviewAllowed
>

describe('preview avi-certified-compose production gate', () => {
  beforeEach(() => {
    allowed.mockReset()
    ;(notFound as unknown as jest.Mock).mockClear()
  })

  it('preview page calls notFound when gate denies', async () => {
    allowed.mockReturnValue(false)
    await expect(PreviewPage()).rejects.toThrow('NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('preview PDF returns 404 when gate denies', async () => {
    allowed.mockReturnValue(false)
    const res = await PreviewPdfGet(
      new Request('http://127.0.0.1/preview/avi-certified-compose/pdf?lang=en'),
    )
    expect(res.status).toBe(404)
  })
})

describe('middleware production preview block (source)', () => {
  it('middleware returns 404 for preview path when NODE_ENV is production', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/middleware.ts'), 'utf8')
    expect(src).toContain("NODE_ENV === 'production'")
    expect(src).toContain('/preview/avi-certified-compose')
    expect(src).toContain('status: 404')
  })
})
