/**
 * @page /preview/avi-certified-compose/pdf
 * Partner-sendable A4 PDF (no Chrome headers/footers, JJ page numbers).
 * Available only when Supabase is unconfigured (same gate as the compose Preview).
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabaseConfig'
import {
  renderAviPartnerReportPdf,
  type AviReportPdfOptions,
} from '@/lib/partner-settlement/external-partner/aviReportPdf'
import type { AviReportLang } from '@/components/finance/aviReportCopy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function langFrom(req: Request): AviReportLang {
  const url = new URL(req.url)
  return url.searchParams.get('lang') === 'he' ? 'he' : 'en'
}

export async function GET(req: Request) {
  if (isSupabaseConfigured()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const lang = langFrom(req)
  const origin = new URL(req.url).origin
  const reportUrl = `${origin}/preview/avi-certified-compose`

  try {
    const opts: AviReportPdfOptions = { lang, reportUrl }
    const pdf = await renderAviPartnerReportPdf(opts)
    const filename =
      lang === 'he'
        ? 'avi-partner-report-he.pdf'
        : 'avi-partner-report-en.pdf'
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Avi-Pdf-Export': 'jj-sendable',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pdf_export_failed'
    return NextResponse.json(
      { error: 'avi_pdf_export_failed', message },
      { status: 500 },
    )
  }
}
