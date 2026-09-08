/**
 * GET /owners/[slug]/statement/range/pdf?from=YYYY-MM&to=YYYY-MM[&property=UUID]
 *
 * Auth-gated (statement auth). Composes each month via the certified single-month builder and rolls up
 * to an overall summary + per-month breakdown, rendered to a real PDF. Read-only; no financial writes.
 *
 * Omitted `property` = all eligible STR properties (owner report).
 * `property=<canonical uuid>` = that property only, if it is in this slug's STR scope.
 * Historical-only properties without an Owner Room slug (Yogev Port) resolve via property-name slug.
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildOwnerStrRangeStatement, monthsInRange } from '@/lib/report/str/ownerStrRangeStatementService'
import { OwnerStrRangeStatementPdf } from '@/lib/pdf/OwnerStrRangeStatementPdf'
import { resolveStrStatementPdfScope } from '@/lib/owners/strStatementPdfScopeServer'

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
  const propertyId = url.searchParams.get('property')
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) {
    return new Response('Invalid or missing from/to (expected YYYY-MM)', { status: 400 })
  }
  if (from > to) {
    return new Response('Range start must not be after range end', { status: 400 })
  }
  if (monthsInRange(from, to, 37).length > 36) {
    return new Response('Range too large (max 36 months)', { status: 400 })
  }

  const scope = await resolveStrStatementPdfScope(params.slug, propertyId)
  if (!scope.ok) return new Response(scope.message, { status: scope.status })

  const dto = await buildOwnerStrRangeStatement({
    ownerName: scope.ownerName,
    properties: scope.properties,
    fromMonth: from,
    toMonth: to,
  })

  const element = React.createElement(OwnerStrRangeStatementPdf, { data: dto }) as unknown as React.ReactElement
  const buffer = await renderToBuffer(element as any)
  const propSuffix = scope.properties.length === 1
    ? `-${scope.properties[0].name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    : ''
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="owner-statement-${params.slug}${propSuffix}-${from}_to_${to}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
