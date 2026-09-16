/**
 * @page /finance/external-partner/avi/print
 * @description Staff-only HTML print surface for headless PDF export.
 *
 * Same certified DTO as the staff screen. No settlement math changes.
 * Used only by /finance/external-partner/avi/pdf (cookie-forwarded Chromium).
 * Query: ?lang=he|en — language applied server-side for the PDF renderer.
 */

import 'server-only'
import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { buildAviExternalPartnerReport } from '@/lib/partner-settlement/external-partner/buildAviExternalPartnerReport'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import { sanitizeAviReportClientPayload } from '@/components/finance/aviReportPresentation'
import type { AviReportLang } from '@/components/finance/aviReportCopy'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Avi partner report (print)',
  robots: { index: false, follow: false },
}

function langFromSearch(raw: string | string[] | undefined): AviReportLang {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'he' ? 'he' : 'en'
}

export default async function ExternalPartnerAviPrintPage({
  searchParams,
}: {
  searchParams?: { lang?: string | string[] }
}) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    notFound()
  }

  const lang = langFromSearch(searchParams?.lang)
  const report = sanitizeAviReportClientPayload(await buildAviExternalPartnerReport())
  if (report.status !== 'certified') {
    notFound()
  }

  return (
    <div
      className="min-h-screen bg-white"
      data-avi-print-root
      data-avi-staff-print
      data-testid="avi-staff-print-root"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      <ExternalPartnerAviReportView
        report={report}
        audience="partner"
        initialLang={lang}
      />
    </div>
  )
}
