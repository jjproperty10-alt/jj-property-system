/**
 * GET /owners/[slug]/statement?period=YYYY-MM — printable STR Owner Statement (PDF).
 *
 * Auth-gated (statement auth). Composes the owner STR statement (Hostaway reservation evidence +
 * JJ-derived management fee/net payout + JJ authoritative Expenses & Extras + reconciliation) and
 * renders it to a real PDF via the existing react-pdf stack. Read-only; no financial writes.
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { getOwnerWorkspace, getOwnerServiceEngagements } from '@/lib/owners/ownerWorkspaceService'
import { selectStrProperties } from '@/lib/owners/selectStrProperties'
import { buildOwnerStrStatement } from '@/lib/report/str/ownerStrStatementService'
import { OwnerStrStatementPdf } from '@/lib/pdf/OwnerStrStatementPdf'

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

  const period = new URL(req.url).searchParams.get('period') ?? ''
  if (!MONTH_RE.test(period)) {
    return new Response('Invalid or missing period (expected YYYY-MM)', { status: 400 })
  }

  const workspace = await getOwnerWorkspace(params.slug)
  if (!workspace) return new Response('Owner not found', { status: 404 })

  const services = await getOwnerServiceEngagements(params.slug)
  const strProps = selectStrProperties(services)
  const { start, end, label } = monthBounds(period)

  const dto = await buildOwnerStrStatement({
    ownerName: workspace.identity.name,
    properties: strProps,
    startDate: start,
    endDate: end,
    periodLabel: label,
  })

  // Cast as in src/lib/pdf/generate.ts — wrapper props {data} vs DocumentProps; functionally correct.
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
