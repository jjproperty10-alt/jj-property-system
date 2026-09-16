/**
 * @page /finance/external-partner
 * @description Internal JJ staff index of certified external-partner reports.
 *
 * Server Component. Read-only. Presentation only — every figure, date and
 * status is read off the same certified DTO the report itself renders. No
 * settlement arithmetic, no second source of truth, no literal amounts.
 *
 * AUTHORIZATION: authenticateStatementUser — identical guard to the Avi report.
 * FAIL CLOSED before any data is built:
 *   - NO_SESSION            -> redirect('/login')
 *   - NOT_STAFF / INACTIVE  -> notFound()
 *
 * Partners have no account here. This is a staff surface only; the partner
 * receives a capability share URL from the report page itself.
 */

import 'server-only'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildAviExternalPartnerReport } from '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport'
import { sanitizeAviReportClientPayload } from '@/components/finance/aviReportPresentation'
import {
  AVI_REPORT_COPY,
  formatAviFullDate,
  formatAviOwedCopy,
} from '@/components/finance/aviReportCopy'
import { MoneyValue, PageShell, StatusBadge, WorkspaceHeader } from '@/components/ds'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Partner Reports',
}

const AVI_REPORT_ROUTE = '/finance/external-partner/avi'
const AVI_PDF_ROUTE = `${AVI_REPORT_ROUTE}/pdf`

const PRIMARY_ACTION =
  'inline-flex items-center justify-center rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white no-underline transition-colors hover:bg-[#2d5a9e]'
const SECONDARY_ACTION =
  'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 no-underline transition-colors hover:bg-gray-50'

export default async function ExternalPartnerIndexPage() {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    notFound()
  }

  const report = sanitizeAviReportClientPayload(await buildAviExternalPartnerReport())
  const isCertified = report.status === 'certified'

  // Narrow once, then read only from the DTO. A non-certified report shows no
  // amounts and no PDF actions — the PDF route 404s in that state anyway.
  const avi = report.status === 'certified'
    ? report.partners.find((partner) => partner.partner === 'Avi') ?? null
    : null
  const cutoffIso = report.status === 'certified' ? report.snapshot.cutoffDate : null

  const en = AVI_REPORT_COPY.en
  const he = AVI_REPORT_COPY.he
  const owedEn = avi ? avi.semanticNet : null
  const owedHe = avi ? formatAviOwedCopy('he', avi.semanticNet, avi.direction) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <PageShell maxWidth="xl">
        {/* Back goes to the app root, not /finance — that route has no page
            yet and would dead-end on a 404. */}
        <WorkspaceHeader
          title="Partner Reports"
          subtitle="דוחות שותפים"
          backRoute="/"
        />

        <article
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
          data-testid="external-partner-avi-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">
                {en.reportTitle}
              </h2>
              {/* dir keeps the bidi order correct; text-left keeps the Hebrew
                  under its English counterpart instead of at the card edge. */}
              <p className="text-left text-sm text-gray-500" dir="rtl">
                {he.reportTitle}
              </p>
            </div>
            <StatusBadge
              status={isCertified ? 'confirmed' : 'critical'}
              label={isCertified ? en.certified : en.provisional}
            />
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {en.propertyName}
              </dt>
              <dd className="mt-1 text-left text-sm text-gray-900" dir="rtl">
                {he.propertyName}
              </dd>
            </div>

            {cutoffIso ? (
              <div data-testid="external-partner-avi-cutoff">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {en.transactionsThrough}
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatAviFullDate(cutoffIso, 'en')}
                </dd>
                <dd className="text-left text-sm text-gray-600" dir="rtl">
                  {he.transactionsThrough} {formatAviFullDate(cutoffIso, 'he')}
                </dd>
              </div>
            ) : null}
          </dl>

          {avi ? (
            <div
              className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4"
              data-testid="external-partner-avi-settlement"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {en.finalSettlement}
              </p>
              <div className="mt-1">
                <MoneyValue amount={avi.netEur} size="xl" />
              </div>
              {owedEn ? (
                <p className="mt-1 text-sm font-medium text-gray-900">{owedEn}</p>
              ) : null}
              {owedHe ? (
                <p className="text-left text-sm font-medium text-gray-900" dir="rtl">
                  {owedHe}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={AVI_REPORT_ROUTE}
              className={PRIMARY_ACTION}
              data-testid="external-partner-avi-open"
              dir="rtl"
            >
              פתיחת הדוח
            </Link>
            {isCertified ? (
              <>
                {/* dir is required here: without it the Latin "PDF" run is
                    reordered and the label reads back-to-front. */}
                <a
                  href={`${AVI_PDF_ROUTE}?lang=he`}
                  className={SECONDARY_ACTION}
                  data-testid="external-partner-avi-pdf-he"
                  dir="rtl"
                >
                  הורדת PDF בעברית
                </a>
                <a
                  href={`${AVI_PDF_ROUTE}?lang=en`}
                  className={SECONDARY_ACTION}
                  data-testid="external-partner-avi-pdf-en"
                >
                  Download English PDF
                </a>
              </>
            ) : null}
          </div>
        </article>
      </PageShell>
    </div>
  )
}
