/**
 * GET /client-report-rc3/pdf — server-rendered client report PDF.
 *
 * Server-boundary repair (Option A′), 2026-08-23.
 *
 * Fully auth-gated: it re-runs the SAME canonical authorization chain as the
 * screen's server action (validateAuthorizedReportScope → session cookie →
 * user_roles policy → authorized property set). It is NOT an authorization
 * bypass — an unauthenticated or unauthorized caller is rejected before any
 * data is read.
 *
 * The RC3 report is fetched server-side and OwnerSettlementPdfV3 is rendered to
 * a PDF buffer server-side. Only the finished PDF bytes reach the browser — the
 * raw RC3 rows and SUPABASE_SERVICE_KEY never do.
 *
 * @react-pdf/renderer (a top-level-await ESM module) is imported statically
 * here because ROUTE HANDLERS may host async modules; Server Actions may not —
 * which is why PDF rendering lives here rather than in the server action.
 *
 * Query params:
 *   property=<reporting_name>   (required)
 *   type=full|periodic          (default: full)
 *   lang=en|he                  (default: en)
 *   from=YYYY-MM-DD             (optional)
 *   to=YYYY-MM-DD               (optional)
 */
import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToBuffer, Font } from '@react-pdf/renderer'
import { validateAuthorizedReportScope } from '@/lib/auth/reportAuthorization'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { OwnerSettlementPdfV3 } from '@/lib/pdf/OwnerSettlementPdfV3'
import type { Lang } from '@/lib/report/labels'
import type { ReportType } from '@/lib/report/reportTypes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

let _fontsRegistered = false
function registerPdfFonts() {
  if (_fontsRegistered) return
  const fontDir = path.join(process.cwd(), 'public', 'fonts')
  const regularPath = path.join(fontDir, 'Heebo-Regular.ttf')
  const boldPath = path.join(fontDir, 'Heebo-Bold.ttf')
  if (!fs.existsSync(regularPath) || !fs.existsSync(boldPath)) {
    throw new Error('pdf_fonts_missing')
  }
  Font.register({
    family: 'Heebo',
    fonts: [
      { src: `data:font/ttf;base64,${fs.readFileSync(regularPath).toString('base64')}` },
      { src: `data:font/ttf;base64,${fs.readFileSync(boldPath).toString('base64')}`, fontWeight: 'bold' },
    ],
  })
  _fontsRegistered = true
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const property = (url.searchParams.get('property') ?? '').trim()
  const type: ReportType = url.searchParams.get('type') === 'periodic' ? 'periodic' : 'full'
  const lang: Lang = url.searchParams.get('lang') === 'he' ? 'he' : 'en'
  const fromRaw = url.searchParams.get('from') ?? undefined
  const toRaw = url.searchParams.get('to') ?? undefined

  // Strict validation — fail closed, generic messages.
  if (!property) return new Response('Invalid request', { status: 400 })
  if (fromRaw && !DATE_RE.test(fromRaw)) return new Response('Invalid request', { status: 400 })
  if (toRaw && !DATE_RE.test(toRaw)) return new Response('Invalid request', { status: 400 })

  try {
    // Re-run the full authorization chain for the requested property.
    const auth = await validateAuthorizedReportScope({ type: 'single_property', propertyName: property })
    if (!auth.ok || !auth.resolvedProperties.includes(property)) {
      return new Response('Not authorized', { status: 403 })
    }

    registerPdfFonts()

    const raw = await fetchRC3Report({ reportingName: property, fromDate: fromRaw, toDate: toRaw })
    const element = React.createElement(OwnerSettlementPdfV3, { report: raw, lang, reportType: type })
    // renderToBuffer expects a react-pdf DocumentElement; OwnerSettlementPdfV3
    // renders one at runtime (same cast as the existing owner PDF route).
    const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0])

    const slug = type === 'full' ? 'Full_Owner_Report' : 'Periodic_Owner_Report'
    const filename = `JJ_${slug}_${property.replace(/\s+/g, '_')}_${fromRaw || 'all'}_to_${toRaw || 'all'}.pdf`

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    // Never surface internal error detail to the browser.
    return new Response('Could not generate report', { status: 500 })
  }
}
