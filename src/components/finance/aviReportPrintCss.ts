/**
 * Browser-native print stylesheet for the certified Avi External Partner report.
 * A4 portrait. No financial formulas — layout only.
 *
 * Chrome print dialog still injects URL/date/page headers unless the operator
 * unchecks “Headers and footers”. That chrome is not controllable from CSS.
 */
export const AVI_REPORT_PRINT_CSS = `
@media print {
  /* Chrome “Headers and footers” cannot be disabled from CSS. Uncheck them in the print dialog. */
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 14mm 12mm;
  }

  html, body {
    background: #ffffff !important;
    color: #111111 !important;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .avi-print-hide,
  [data-avi-print-hide] {
    display: none !important;
  }

  nav[aria-label="Main navigation"],
  [aria-label="Open navigation menu"],
  [aria-label="Navigation menu"],
  [aria-label="Close navigation menu"],
  [aria-label="Go back"],
  form[action="/api/auth/logout"],
  button {
    display: none !important;
  }

  [data-avi-print-root] {
    background: #ffffff !important;
    color: #111111 !important;
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .avi-print-keep,
  .jj-tile {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .avi-print-keep-header h3,
  .avi-print-keep-header .jj-label {
    break-after: avoid;
    page-break-after: avoid;
  }

  .avi-print-expenses .jj-card,
  .avi-print-payments .jj-card {
    break-inside: auto;
    page-break-inside: auto;
    box-shadow: none !important;
  }

  [data-avi-print-root] table {
    font-size: 9pt;
    width: 100%;
    border-collapse: collapse;
  }

  [data-avi-print-root] th,
  [data-avi-print-root] td {
    padding: 4px 6px !important;
    vertical-align: top;
  }

  [data-avi-print-root] th[dir="ltr"],
  [data-avi-print-root] td[dir="ltr"] {
    white-space: nowrap;
  }

  [data-avi-print-root] thead {
    display: table-header-group !important;
  }

  [data-avi-print-root] tfoot {
    display: table-footer-group !important;
  }

  [data-avi-print-root] tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  [data-avi-print-root] h1,
  [data-avi-print-root] h2,
  [data-avi-print-root] h3 {
    break-after: avoid;
    page-break-after: avoid;
  }

  .avi-print-payments {
    break-before: page;
    page-break-before: always;
  }

  [data-avi-table-desktop] {
    display: block !important;
    overflow: visible !important;
  }

  [data-avi-table-mobile] {
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
`
