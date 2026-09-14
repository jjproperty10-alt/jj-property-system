'use client'

/**
 * Browser print control for the Avi External Partner report.
 * Uses window.print() — same architecture as the Owner LTR statement.
 * Hidden by print CSS; does not compute any financial value.
 *
 * Chrome cannot be stopped from adding URL/date/page chrome from here.
 * Uncheck “Headers and footers” in the print dialog.
 */
import { AVI_REPORT_COPY, type AviReportLang } from '@/components/finance/aviReportCopy'

export const AVI_PRINT_CHROME_HEADERS_NOTE_EN =
  'Chrome print dialog: uncheck Headers and footers so the URL, date, and page numbers are not printed. Paper is A4 portrait.'

export const AVI_PRINT_CHROME_HEADERS_NOTE_HE =
  'בחלון ההדפסה של Chrome: בטלו Headers and footers כדי שלא יודפסו כתובת, תאריך ומספרי עמוד. נייר A4 לאורך.'

/** @deprecated use language-aware notes */
export const AVI_PRINT_CHROME_HEADERS_NOTE = AVI_PRINT_CHROME_HEADERS_NOTE_EN

export function AviReportPrintButton({ lang = 'en' }: { lang?: AviReportLang }) {
  const copy = AVI_REPORT_COPY[lang]
  const hint = lang === 'he' ? AVI_PRINT_CHROME_HEADERS_NOTE_HE : AVI_PRINT_CHROME_HEADERS_NOTE_EN
  return (
    <div className="flex flex-col items-end gap-1 print:hidden avi-print-hide" data-avi-print-hide>
      <button
        type="button"
        data-testid="avi-print-button"
        onClick={() => window.print()}
        className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors print:hidden"
      >
        {copy.printButton}
      </button>
      <p
        className="max-w-xs text-right text-[11px] leading-snug text-gray-500"
        data-testid="avi-print-chrome-headers-note"
      >
        {hint}
      </p>
    </div>
  )
}
