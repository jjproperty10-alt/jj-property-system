/**
 * @page /preview/avi-certified-compose
 * @description Unconfigured-environment Preview of the certified Avi compose
 * fixture (canonical 202-row CSV). Not live Supabase. Not a staff auth bypass.
 *
 * Available only when isSupabaseConfigured() is false. When keys are present
 * this route 404s so Production / configured Preview cannot use it.
 */

import 'server-only'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/ds'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import { AviReportPrintButton } from '@/components/finance/AviReportPrintButton'
import { isSupabaseConfigured } from '@/lib/supabaseConfig'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Avi certified compose fixture (Preview)',
  robots: { index: false, follow: false },
}

export default async function AviCertifiedComposePreviewPage() {
  if (isSupabaseConfigured()) {
    notFound()
  }

  const report = composeAviCertifiedCanonicalFixtureReport()
  if (report.status !== 'certified') {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50" data-avi-print-root data-avi-fixture-preview dir="ltr">
      <PageShell maxWidth="xl" className="print:max-w-none print:px-0 print:py-0">
        <div
          data-testid="avi-certified-compose-fixture-banner"
          className="avi-print-hide print:hidden mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <p className="font-semibold">Certified compose fixture — not live Supabase</p>
          <p className="mt-1">
            This Preview has no Supabase keys, so staff login cannot reach the account
            service. The report below is composed from the frozen 202-row canonical CSV
            and the approved Avi identity (Avi is owed €740.94). It is not a live
            database read and not an auth bypass for Production.
          </p>
        </div>
        <div className="avi-print-hide print:hidden mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">External Partner Report — Avi</h1>
            <p className="text-sm text-gray-500">Villa Mazotos · fixture Preview</p>
          </div>
          <AviReportPrintButton />
        </div>
        <ExternalPartnerAviReportView report={report} audience="staff" />
      </PageShell>
    </div>
  )
}
