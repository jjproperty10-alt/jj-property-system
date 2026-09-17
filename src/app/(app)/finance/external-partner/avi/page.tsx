/**
 * @page /finance/external-partner/avi
 * @description Internal JJ staff screen — Certified Avi External Partner Report.
 *
 * Server Component. Read-only. Uses the Commit 2C service/DTO as the single
 * report source. No direct transaction queries. No financial formulas.
 *
 * Print: browser-native window.print() + A4 @media print CSS. Staff-only.
 * Staff may mint a 72-hour HMAC share URL. That route is outside (app) and
 * has no Avi login. This page stays staff-gated. No second settlement engine.
 * AUTHORIZATION: authenticateStatementUser — session + jj_staff_config.
 * FAIL CLOSED before any data is built:
 *   - NO_SESSION            -> redirect('/login')
 *   - NOT_STAFF / INACTIVE  -> notFound()
 *
 * Avi does not receive a user account. The share URL is a capability link.
 */

import 'server-only'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildAviExternalPartnerReport } from '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import { AviReportPrintButton } from '@/components/finance/AviReportPrintButton'
import { AviShareLinkButton } from '@/components/finance/AviShareLinkButton'
import { PageShell, WorkspaceHeader } from '@/components/ds'
import { sanitizeAviReportClientPayload } from '@/components/finance/aviReportPresentation'
import { VM1_OPERATIONS_ROUTE } from '@/lib/partnership-workspace/vm1OperationsRoutes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — External Partner Report — Avi',
}

export default async function ExternalPartnerAviPage() {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    notFound()
  }

  const report = sanitizeAviReportClientPayload(await buildAviExternalPartnerReport())

  return (
    <div className="min-h-screen bg-gray-50" data-avi-print-root dir="ltr">
      <PageShell maxWidth="xl" className="print:max-w-none print:px-0 print:py-0">
        <div className="avi-print-hide print:hidden" data-avi-print-hide>
          {/* Back goes up to the partner-report index, not /finance — that
              route has no page yet and would dead-end on a 404. */}
          <WorkspaceHeader
            title="External Partner Report"
            subtitle="Avi — Villa Mazotos"
            backRoute="/finance/external-partner"
            actions={
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
                <Link
                  href={VM1_OPERATIONS_ROUTE}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 no-underline transition-colors hover:bg-gray-50"
                  data-testid="avi-staff-property-operations-link"
                >
                  Property Operations / פעילות הנכס
                </Link>
                {report.status === 'certified' ? (
                  <>
                    <AviShareLinkButton />
                    <AviReportPrintButton />
                  </>
                ) : null}
              </div>
            }
          />
        </div>
        <ExternalPartnerAviReportView
          report={report}
          sendablePdfPath={
            report.status === 'certified'
              ? '/finance/external-partner/avi/pdf'
              : null
          }
        />
      </PageShell>
    </div>
  )
}
