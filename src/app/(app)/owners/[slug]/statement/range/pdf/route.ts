/**
 * GET /owners/[slug]/statement/range/pdf?from=YYYY-MM&to=YYYY-MM — printable MULTI-MONTH Owner Statement.
 *
 * Auth-gated (statement auth). Composes each month via the certified single-month builder and rolls up
 * to an overall summary + per-month breakdown, rendered to a real PDF. Read-only; no financial writes.
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { getOwnerWorkspace, getOwnerServiceEngagements } from '@/lib/owners/ownerWorkspaceService'
import { selectStrProperties } from '@/lib/owners/selectStrProperties'
import { buildOwnerStrRangeStatement, monthsInRange } from '@/lib/report/str/ownerStrRangeStatementService'
import { OwnerStrRangeStatementPdf } from '@/lib/pdf/OwnerStrRangeStatementPdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return new Response('Unauthorized', { status: auth.error === 'NO_SESSION' ? 401 : 403 })
  }

  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) {
    return new Response('Invalid or missing from/to (expected YYYY-MM)', { status: 400 })
  }
  if (from > to) {
    return new Response('Range start must not be after range end', { status: 400 })
  }
  // Guard against absurd ranges (max 36 months).
  if (monthsInRange(from, to, 37).length > 36) {
    return new Response('Range too large (max 36 months)', { status: 400 })
  }

  const workspace = await getOwnerWorkspace(params.slug)
  if (!workspace) return new Response('Owner not found', { status: 404 })

  const services = await getOwnerServiceEngagements(params.slug)
  const strProps = selectStrProperties(services)

  const dto = await buildOwnerStrRangeStatement({
    ownerName: workspace.identity.name,
    properties: strProps,
    fromMonth: from,
    toMonth: to,
  })

  const element = React.createElement(OwnerStrRangeStatementPdf, { data: dto }) as unknown as React.ReactElement
  const buffer = await renderToBuffer(element as any)
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="owner-statement-${params.slug}-${from}_to_${to}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
