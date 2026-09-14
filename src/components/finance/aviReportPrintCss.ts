/**
 * Dedicated A4 print stylesheet for the certified Avi External Partner report.
 * Layout only — no financial formulas.
 *
 * Root cause (empty MONTH column): a previous rule hid every `button` in print,
 * while month labels lived inside expand buttons. Month labels are plain text now.
 * Interactive controls use `.avi-print-hide` instead of a global `button` hide.
 *
 * Chrome/Edge still inject URL/date headers unless the operator unchecks
 * “Headers and footers”. Playwright PDF generation uses displayHeaderFooter with
 * a custom footer (no URL / localhost) and omits Chrome chrome.
 */
export const AVI_REPORT_PRINT_CSS = `
@media print {
  /* Chrome “Headers and footers” cannot be disabled from CSS. Uncheck them in the print dialog. */
  @page {
    size: A4 portrait;
    margin: 14mm 12mm 18mm 12mm;
  }

  html, body {
    background: #ffffff !important;
    color: #111827 !important;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .avi-print-hide,
  [data-avi-print-hide],
  nav[aria-label="Main navigation"],
  [aria-label="Open navigation menu"],
  [aria-label="Navigation menu"],
  [aria-label="Close navigation menu"],
  [aria-label="Go back"],
  form[action="/api/auth/logout"] {
    display: none !important;
  }

  [data-avi-print-root] {
    background: #ffffff !important;
    color: #111827 !important;
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
    padding-bottom: 10mm !important;
  }

  .avi-print-page {
    break-after: page;
    page-break-after: always;
  }

  .avi-print-page:last-of-type {
    break-after: auto;
    page-break-after: auto;
  }

  .avi-print-keep,
  .avi-final-hero,
  .jj-tile {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .avi-print-section-title {
    break-after: avoid;
    page-break-after: avoid;
  }

  [data-avi-print-root] table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
  }

  [data-avi-print-root] th,
  [data-avi-print-root] td {
    padding: 5px 6px !important;
    vertical-align: top;
  }

  [data-avi-print-root] thead {
    display: table-header-group !important;
  }

  /* Do NOT use table-footer-group: browsers reprint <tfoot> on every page
     fragment when a table spans pages (duplicate “Final result” mid-table). */
  [data-avi-print-root] tfoot {
    display: table-row-group !important;
  }

  [data-avi-print-root] tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  [data-avi-table-desktop] {
    display: block !important;
    overflow: visible !important;
  }

  [data-avi-table-mobile] {
    display: none !important;
  }

  .avi-screen-only {
    display: none !important;
  }

  .avi-print-only {
    display: block !important;
  }

  tr.avi-ops-continued-banner {
    display: table-row !important;
  }

  .avi-print-masthead {
    display: block !important;
  }


  .avi-he-date,
  .avi-he-generated,
  .avi-he-cutoff {
    direction: rtl !important;
    unicode-bidi: isolate !important;
    white-space: nowrap !important;
  }

  .avi-he-date-day,
  .avi-he-date-year {
    direction: ltr !important;
    unicode-bidi: isolate !important;
  }

  .avi-he-date-month {
    direction: rtl !important;
    unicode-bidi: isolate !important;
  }

  /* PDF page chrome comes from Playwright footerTemplate — not a CSS fixed footer. */
  .avi-print-footer {
    display: none !important;
  }

  a {
    color: inherit !important;
    text-decoration: none !important;
  }

  [dir="rtl"] {
    direction: rtl;
  }
}

@media screen {
  .avi-print-only {
    display: none !important;
  }

  tr.avi-ops-continued-banner {
    display: none !important;
  }
}
`
