/**
 * Build partner-sendable Avi print HTML in-process for staff PDF export.
 *
 * react-dom/server must not appear as a static import reachable from App Router
 * route modules (Next.js 14 build rejects that). Load it via Node createRequire.
 */
import 'server-only'
import { createRequire } from 'node:module'
import React from 'react'
import { ExternalPartnerAviReportView } from '@/components/finance/ExternalPartnerAviReportView'
import type { AviReportLang } from '@/components/finance/aviReportCopy'
import type { ExternalPartnerAviReport } from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'

export type AviCertifiedStaffReport = Extract<
  ExternalPartnerAviReport,
  { status: 'certified' }
>

type ReactDomServer = {
  renderToStaticMarkup: (element: React.ReactElement) => string
}

function loadRenderToStaticMarkup(): ReactDomServer['renderToStaticMarkup'] {
  const nodeRequire = createRequire(__filename)
  const mod = nodeRequire('react-dom/server') as ReactDomServer
  return mod.renderToStaticMarkup
}

/**
 * Full HTML document for Chromium setContent. <base href> resolves /fonts
 * against the deployment origin while Cookie + bypass headers remain set.
 */
export function buildAviStaffPdfHtmlDocument(opts: {
  readonly report: AviCertifiedStaffReport
  readonly lang: AviReportLang
  readonly origin: string
}): string {
  const renderToStaticMarkup = loadRenderToStaticMarkup()
  const markup = renderToStaticMarkup(
    React.createElement(ExternalPartnerAviReportView, {
      report: opts.report,
      audience: 'partner',
      initialLang: opts.lang,
    }),
  )
  const dir = opts.lang === 'he' ? 'rtl' : 'ltr'
  return `<!DOCTYPE html><html lang="${opts.lang}" dir="${dir}"><head><meta charset="utf-8"/><base href="${opts.origin}/"/></head><body>${markup}</body></html>`
}
