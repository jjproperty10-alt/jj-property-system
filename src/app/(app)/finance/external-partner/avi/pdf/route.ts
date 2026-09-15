/**
 * @page /finance/external-partner/avi/pdf
 * Staff-authenticated partner-sendable A4 PDF (?lang=he|en).
 *
 * Same certified DTO as the staff report screen. Renders print HTML in-process
 * so headless Chromium does not depend on a second Vercel Deployment Protection
 * round-trip to /print. No settlement math. Fail-closed: no session → login
 * redirect; non-staff / inactive / non-certified → 404.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildAviExternalPartnerReport } from '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport'
import {
  renderAviPartnerReportPdf,
  type AviReportPdfOptions,
} from '@/lib/partner-settlement/external-partner/aviReportPdf'
import { buildAviStaffPdfHtmlDocument } from '@/lib/partner-settlement/external-partner/aviStaffPdfHtml'
import { sanitizeAviReportClientPayload } from '@/components/finance/aviReportPresentation'
import type { AviReportLang } from '@/components/finance/aviReportCopy'

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

  // Same certified builder as the staff page — refuse PDF if not certified.
  const built = await buildAviExternalPartnerReport()
  const report = sanitizeAviReportClientPayload(built)
  if (report.status !== 'certified') {
    return new NextResponse('Not Found', { status: 404 })
  }

  const lang = langFrom(req)
  const origin = new URL(req.url).origin
  const htmlContent = buildAviStaffPdfHtmlDocument({ report, lang, origin })

  try {
    const opts: AviReportPdfOptions = {
      lang,
      reportUrl: `${origin}/finance/external-partner/avi/print?lang=${lang}`,
      htmlContent,
      cookieHeader: req.headers.get('cookie'),
      langAlreadyApplied: true,
    }
    const pdf = await renderAviPartnerReportPdf(opts)
    const filename =
      lang === 'he' ? 'avi-partner-report-he.pdf' : 'avi-partner-report-en.pdf'
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Avi-Pdf-Export': 'jj-sendable-staff',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'avi_staff_pdf_export_failed' },
      { status: 500 },
    )
  }
}
