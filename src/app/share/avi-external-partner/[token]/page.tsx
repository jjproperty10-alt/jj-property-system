/**
 * @page /share/avi-external-partner/[token]
 * @description Read-only certified Avi report for a staff-minted HMAC link.
 *
 * Outside (app): no JJ sidebar. No Avi login. Invalid/expired tokens 404.
 * Uses the same certified builder/DTO as the staff screen.
 */

import 'server-only'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/ds'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import { AviReportPrintButton } from '@/components/finance/AviReportPrintButton'
import { buildAviExternalPartnerReport } from '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from '@/lib/partner-settlement/external-partner/externalPartnerSnapshot'
import { verifyAviShareToken } from '@/lib/partner-settlement/external-partner/aviShareToken'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — External Partner Report — Avi',
  robots: { index: false, follow: false },
}

interface Props {
  params: { token: string }
}

export default async function AviExternalPartnerSharePage({ params }: Props) {
  const token = decodeURIComponent(params.token ?? '')
  const verified = verifyAviShareToken(token, {
    expectedSnapshotVersion: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
    expectedSnapshotSha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
  })
  if (!verified.ok) {
    notFound()
  }

  const report = await buildAviExternalPartnerReport()
  if (report.status !== 'certified') {
    notFound()
  }
  if (
    report.snapshot.version !== verified.claims.snapshotVersion ||
    report.snapshot.sha256 !== verified.claims.snapshotSha256
  ) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50" data-avi-print-root data-avi-share-root dir="ltr">
      <PageShell maxWidth="xl" className="print:max-w-none print:px-0 print:py-0">
        <div className="avi-print-hide print:hidden mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">External Partner Report — Avi</h1>
            <p className="text-sm text-gray-500">Villa Mazotos</p>
          </div>
          <AviReportPrintButton />
        </div>
        <ExternalPartnerAviReportView report={report} audience="partner" />
      </PageShell>
    </div>
  )
}
