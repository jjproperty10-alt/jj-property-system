/**
 * @page /preview/avi-certified-compose/pdf
 * Partner-sendable A4 PDF from the certified compose fixture (@react-pdf).
 * Non-production + unconfigured Supabase only. Always 404 in Production.
 * Staff Production PDF: /finance/external-partner/avi/pdf
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { isAviCertifiedComposePreviewAllowed } from '@/lib/partner-settlement/external-partner/aviComposePreviewGate'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
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
  if (!isAviCertifiedComposePreviewAllowed()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const lang = langFrom(req)
  const report = composeAviCertifiedCanonicalFixtureReport()
  if (report.status !== 'certified') {
    return new NextResponse('Not Found', { status: 404 })
  }

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
        'X-Avi-Pdf-Export': 'jj-sendable',
        'X-Avi-Pdf-Engine': 'react-pdf',
      },
    })
  } catch {
    return NextResponse.json({ error: 'avi_pdf_export_failed' }, { status: 500 })
  }
}
