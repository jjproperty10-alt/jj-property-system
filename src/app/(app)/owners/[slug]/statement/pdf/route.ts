/**
 * GET /owners/[slug]/statement/pdf?period=YYYY-MM[&property=UUID] - printable STR Owner Statement (PDF).
 *
 * Auth-gated (statement auth). Same certified builder as the range PDF. Read-only; no financial writes.
 * `property=<canonical uuid>` selects one in-scope STR property; omitted = owner aggregation.
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildOwnerStrStatement } from '@/lib/report/str/ownerStrStatementService'
import { OwnerStrStatementPdf } from '@/lib/pdf/OwnerStrStatementPdf'
import { resolveStrStatementPdfScope } from '@/lib/owners/strStatementPdfScopeServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function monthBounds(ym: string): { start: string; end: string; label: string } {
  const [y, mo] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const last = new Date(Date.UTC(y, mo, 0))
  const end = `${ym}-${String(last.getUTCDate()).padStart(2, '0')}`
  const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { start, end, label }
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return new Response('Unauthorized', { status: auth.error === 'NO_SESSION' ? 401 : 403 })
  }

  const url = new URL(req.url)
  const period = url.searchParams.get('period') ?? ''
  const propertyId = url.searchParams.get('property')
  if (!MONTH_RE.test(period)) {
    return new Response('Invalid or missing period (expected YYYY-MM)', { status: 400 })
  }

  const scope = await resolveStrStatementPdfScope(params.slug, propertyId)
  if (!scope.ok) return new Response(scope.message, { status: scope.status })

  const { start, end, label } = monthBounds(period)
  const dto = await buildOwnerStrStatement({
    ownerName: scope.ownerName,
    properties: scope.properties,
    startDate: start,
    endDate: end,
    periodLabel: label,
  })

  const element = React.createElement(OwnerStrStatementPdf, { data: dto }) as unknown as React.ReactElement
  const buffer = await renderToBuffer(element as any)
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="owner-statement-${params.slug}-${period}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
