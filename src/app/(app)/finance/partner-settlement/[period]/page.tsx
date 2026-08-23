/**
 * @page /finance/partner-settlement/[period]
 * @description Partner Report B — Stage 2 (READ-ONLY wired ledger).
 *
 * Server Component. Read-only. The consolidated Yossi<->Jacob headline is gated
 * (never asserts a final debtor/creditor on partial data — see 12f). No mutations.
 *
 * AUTHORIZATION (QA fix #1): uses the repository's established JJ-staff flow
 * (authenticateStatementUser — session + jj_staff_config). FAIL CLOSED before
 * buildPartnerReportB() is ever called:
 *   - NO_SESSION            -> redirect('/login')
 *   - NOT_STAFF / STAFF_INACTIVE / AUTH_ERROR (or any other failure) -> notFound()
 * This is partner financial data — a bare authenticated session is NOT sufficient.
 *
 * [period] = YYYY-MM -> first/last day of that month.
 */

import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildPartnerReportB } from '@/lib/partner-settlement/partnerReportBService'
import { PartnerReportBView } from '@/components/partner-settlement/PartnerReportBView'

export const dynamic = 'force-dynamic'

interface Props {
  params: { period: string }
}

function parsePeriod(period: string): { start: string; end: string } | null {
  const m = period.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
  const start = `${m[1]}-${m[2]}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export default async function PartnerSettlementPage({ params }: Props) {
  const period = parsePeriod(params.period)
  if (!period) notFound()

  // ── Staff authorization — FAIL CLOSED before any data is built ──────────────
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    // NOT_STAFF, STAFF_INACTIVE, AUTH_ERROR → generic 404 (never leak detail)
    notFound()
  }

  const dto = await buildPartnerReportB({
    periodStart: period.start,
    periodEnd: period.end,
    generatedAt: new Date().toISOString(),
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <PartnerReportBView dto={dto} />
    </div>
  )
}
