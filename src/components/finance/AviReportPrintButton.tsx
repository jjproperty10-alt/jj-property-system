'use client'

/**
 * Staff-only browser print control for the Avi External Partner report.
 * Uses window.print() — the same architecture as the Owner LTR statement.
 * Hidden by print CSS; does not compute any financial value.
 *
 * Chrome cannot be stopped from adding URL/date/page chrome from here.
 * Uncheck “Headers and footers” in the print dialog.
 */
export const AVI_PRINT_CHROME_HEADERS_NOTE =
  'Chrome print dialog: uncheck Headers and footers so the URL, date, and page numbers are not printed. Paper is A4 portrait.'

export function AviReportPrintButton() {
  return (
    <div className="flex flex-col items-end gap-1 print:hidden" data-avi-print-hide>
      <button
        type="button"
        data-testid="avi-print-button"
        onClick={() => window.print()}
        className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors print:hidden"
      >
        Print / Save PDF
      </button>
      <p className="max-w-xs text-right text-[11px] leading-snug text-gray-500" data-testid="avi-print-chrome-headers-note">
        {AVI_PRINT_CHROME_HEADERS_NOTE}
      </p>
    </div>
  )
}
