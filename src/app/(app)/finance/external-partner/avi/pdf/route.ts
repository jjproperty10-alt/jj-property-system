/**
 * @page /finance/external-partner/avi/pdf
 * Staff-authenticated partner-sendable A4 PDF (?lang=he|en).
 *
 * Same certified DTO as the staff report screen. Renders via @react-pdf/renderer
 * (no Chromium). Fail-closed: no session → login; non-staff / inactive /
 * non-certified → 404.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildAviExternalPartnerReport } from '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport'
import { sanitizeAviReportClientPayload } from '@/components/finance/aviReportPresentation'
import type { AviReportLang } from '@/components/finance/aviReportCopy'
import { renderAviPartnerReportPdf } from '@/lib/pdf/renderAviPartnerReportPdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function langFrom(req: Request): AviReportLang {
  const url = new URL(req.url)
  return url.searchParams.get('lang') === 'he' ? 'he' : 'en'
}

export async function GET(req: Request) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      const login = new URL('/login', req.url)
      login.searchParams.set('next', '/finance/external-partner/avi')
      return NextResponse.redirect(login)
    }
    return new NextResponse('Not Found', { status: 404 })
  }

  const built = await buildAviExternalPartnerReport()
  const report = sanitizeAviReportClientPayload(built)
  if (report.status !== 'certified') {
    return new NextResponse('Not Found', { status: 404 })
  }

  const lang = langFrom(req)

  try {
    const buffer = await renderAviPartnerReportPdf(report, lang)
    const filename =
      lang === 'he' ? 'avi-partner-report-he.pdf' : 'avi-partner-report-en.pdf'
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Avi-Pdf-Export': 'jj-sendable-staff',
        'X-Avi-Pdf-Engine': 'react-pdf',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'avi_staff_pdf_export_failed' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }
}
