/**
 * GET /owners/[slug]/report/pdf — Owner LTR Financial Report (PDF).
 *
 * Gap I — PR #166 Hard Gap Audit.
 *
 * Auth-gated (statement auth). Fetches RC3 data per property and renders
 * OwnerSettlementPdfV3 to a real PDF via server-side renderToBuffer.
 * Read-only; no financial writes.
 *
 * Query params:
 *   ?lang=he       — Hebrew RTL layout (default: en)
 *   ?type=full     — Report type: full | periodic (default: full)
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD — optional date range
 *
 * Constitutional:
 *   P-LEDGER-6: Owner-facing amounts = COALESCE(client_charge, amount_eur)
 *   P-ARCH-1: NULL = Unknown, never 0
 *   fetchRC3Report is the canonical financial authority
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { getOwnerWorkspace } from '@/lib/owners/ownerWorkspaceService'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { OwnerSettlementPdfV3 } from '@/lib/pdf/OwnerSettlementPdfV3'
import type { Lang } from '@/lib/report/labels'
import type { ReportType } from '@/lib/report/reportTypes'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return new Response('Unauthorized', { status: auth.error === 'NO_SESSION' ? 401 : 403 })
  }

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') === 'he' ? 'he' : 'en') as Lang
  const reportType = (url.searchParams.get('type') === 'periodic' ? 'periodic' : 'full') as ReportType
  const fromDate = url.searchParams.get('from') ?? null
  const toDate = url.searchParams.get('to') ?? null

  // Validate date params if provided
  if (fromDate && !DATE_RE.test(fromDate)) {
    return new Response('Invalid from date (expected YYYY-MM-DD)', { status: 400 })
  }
  if (toDate && !DATE_RE.test(toDate)) {
    return new Response('Invalid to date (expected YYYY-MM-DD)', { status: 400 })
  }

  const workspace = await getOwnerWorkspace(params.slug)
  if (!workspace) return new Response('Owner not found', { status: 404 })

  const properties = workspace.identity.properties
  if (!properties || properties.length === 0) {
    return new Response('No properties found for this owner', { status: 404 })
  }

  // Fetch RC3 reports for each property in parallel
  const reportResults = await Promise.allSettled(
    properties.map(reportingName =>
      fetchRC3Report({
        reportingName,
        fromDate: fromDate ?? undefined,
        toDate: toDate ?? undefined,
      }),
    ),
  )

  // Filter to successful reports only (some properties may have no data)
  const reports = reportResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchRC3Report>>> =>
      r.status === 'fulfilled',
    )
    .map(r => r.value)
    .filter(r => r.accounts.length > 0) // skip properties with no financial data

  if (reports.length === 0) {
    return new Response('No financial data found for this owner', { status: 404 })
  }

  // For single property: render one OwnerSettlementPdfV3
  // For multi-property: render each as separate pages in the same document
  // OwnerSettlementPdfV3 produces a full <Document> per report,
  // so for multi-property we render each separately and return the first
  // (multi-property PDF composition is a future enhancement)
  const report = reports[0]

  const element = React.createElement(OwnerSettlementPdfV3, {
    report,
    lang,
    reportType,
  }) as unknown as React.ReactElement

  const buffer = await renderToBuffer(element as any)

  const ownerName = (workspace.identity.name || 'Owner').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')
  const dateSuffix = fromDate && toDate ? `_${fromDate}_to_${toDate}` : '_all_history'
  const filename = `${ownerName}_Financial_Report${dateSuffix}.pdf`

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
