/**
 * @page /finance/partner-settlement/[period]
 * @description Partner Report B — Stage 1 (READ-ONLY framework).
 *
 * Server Component. Read-only: computes the framework DTO server-side and renders it.
 * The consolidated Yossi<->Jacob headline is gated (never asserts a final debtor/
 * creditor on partial data — see 12f). No mutations, no writes.
 *
 * [period] = YYYY-MM -> first/last day of that month.
 */

import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
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

  // Light session gate (read-only). No session -> login; never leaks detail.
  const sessionClient = createSupabaseServerClient()
  const { data: { user }, error } = await sessionClient.auth.getUser()
  if (error || !user) redirect('/login')

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
