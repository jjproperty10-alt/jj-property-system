/**
 * Render certified Avi partner report to a PDF buffer via @react-pdf/renderer.
 * Presentation only — no Chromium, no settlement math.
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { AviReportLang } from '@/components/finance/aviReportCopy'
import {
  AviPartnerReportPdf,
  type AviCertifiedReport,
} from '@/lib/pdf/AviPartnerReportPdf'
import { registerJjPdfFonts } from '@/lib/pdf/registerJjPdfFonts'

export async function renderAviPartnerReportPdf(
  report: AviCertifiedReport,
  lang: AviReportLang,
): Promise<Buffer> {
  registerJjPdfFonts()
  const element = React.createElement(AviPartnerReportPdf, { report, lang })
  const buffer = await renderToBuffer(
    element as Parameters<typeof renderToBuffer>[0],
  )
  return Buffer.from(buffer)
}
