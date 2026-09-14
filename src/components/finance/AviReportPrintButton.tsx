'use client'

/**
 * Print / sendable-PDF controls for the Avi External Partner report.
 *
 * - Download sendable PDF: Chromium headless export with empty header + JJ
 *   footer (Page N of M). No localhost / Chrome date chrome.
 * - Browser Print: still available, but Chrome can inject URL/date/"1/9"
 *   unless Headers and footers are unchecked — not the partner-send path.
 */
import { AVI_REPORT_COPY, type AviReportLang } from '@/components/finance/aviReportCopy'

export const AVI_PRINT_CHROME_HEADERS_NOTE_EN =
  'Browser Print is not the partner-send path. If you use it: uncheck Headers and footers so the URL, date, and Chrome page numbers are not printed. Prefer Download sendable A4 PDF.'

export const AVI_PRINT_CHROME_HEADERS_NOTE_HE =
  'הדפסת דפדפן אינה נתיב השליחה לשותף. אם בכל זאת מדפיסים: בטלו Headers and footers כדי שלא יודפסו כתובת, תאריך ומספרי Chrome. העדיפו «הורדת PDF לשליחה».'

/** @deprecated use language-aware notes */
export const AVI_PRINT_CHROME_HEADERS_NOTE = AVI_PRINT_CHROME_HEADERS_NOTE_EN

export function AviReportPrintButton({
  lang = 'en',
  sendablePdfHref = null,
}: {
  lang?: AviReportLang
  /** When set, primary action is the JJ sendable PDF export (no Chrome chrome). */
  sendablePdfHref?: string | null
}) {
  const copy = AVI_REPORT_COPY[lang]
  const hint = lang === 'he' ? AVI_PRINT_CHROME_HEADERS_NOTE_HE : AVI_PRINT_CHROME_HEADERS_NOTE_EN
  return (
    <div className="flex flex-col items-end gap-2 print:hidden avi-print-hide" data-avi-print-hide>
      {sendablePdfHref ? (
        <a
          href={sendablePdfHref}
          data-testid="avi-download-sendable-pdf"
          className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2d5a9e] transition-colors print:hidden no-underline"
        >
          {copy.downloadSendablePdf}
        </a>
      ) : null}
      <button
        type="button"
        data-testid="avi-print-button"
        onClick={() => window.print()}
        className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors print:hidden"
      >
        {copy.printButton}
      </button>
      {sendablePdfHref ? (
        <p
          className="max-w-xs text-end text-[11px] leading-snug text-slate-600"
          data-testid="avi-download-sendable-pdf-hint"
        >
          {copy.downloadSendablePdfHint}
        </p>
      ) : null}
      <p
        className="max-w-xs text-end text-[11px] leading-snug text-gray-500"
        data-testid="avi-print-chrome-headers-note"
      >
        {hint}
      </p>
    </div>
  )
}
