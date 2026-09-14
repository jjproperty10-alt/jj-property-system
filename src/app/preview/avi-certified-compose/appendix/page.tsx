/**
 * @page /preview/avi-certified-compose/appendix
 * Optional certified expense appendix for unconfigured Preview.
 * Not embedded in the main partner report PDF by default.
 */
import 'server-only'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/ds'
import { AviCertifiedExpenseAppendix } from '@/components/finance/ExternalPartnerAviReportView'
import { AviReportPrintButton } from '@/components/finance/AviReportPrintButton'
import { isAviCertifiedComposePreviewAllowed } from '@/lib/partner-settlement/external-partner/aviComposePreviewGate'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import { AVI_REPORT_COPY } from '@/components/finance/aviReportCopy'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Avi certified expense appendix (Preview)',
  robots: { index: false, follow: false },
}

export default async function AviCertifiedComposeAppendixPage() {
  if (!isAviCertifiedComposePreviewAllowed()) {
    notFound()
  }

  const report = composeAviCertifiedCanonicalFixtureReport()
  if (report.status !== 'certified') {
    notFound()
  }

  const copy = AVI_REPORT_COPY.en

  return (
    <div className="min-h-screen bg-gray-50" data-avi-print-root data-avi-fixture-preview dir="ltr">
      <PageShell maxWidth="xl" className="print:max-w-none print:px-0 print:py-0">
        <div className="avi-print-hide print:hidden mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{copy.appendixTitle}</p>
          <p className="mt-1">{copy.appendixSubtitle}</p>
          <Link
            href="/preview/avi-certified-compose"
            className="mt-2 inline-flex font-semibold underline"
          >
            {copy.backToReport}
          </Link>
        </div>
        <div className="avi-print-hide print:hidden mb-6 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{copy.appendixTitle}</h1>
          <AviReportPrintButton />
        </div>
        <AviCertifiedExpenseAppendix
          expenses={report.partnerExpenses}
          totals={report.visibleExpenseTotals}
          layers={report.layers}
          completeness={report.expenseCompleteness}
          lang="en"
        />
      </PageShell>
    </div>
  )
}
