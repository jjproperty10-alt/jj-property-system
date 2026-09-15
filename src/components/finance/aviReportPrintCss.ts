/**
 * Avi partner-report print/screen stylesheet.
 * Visual language mirrored from OwnerSettlementPdfV3 (Orit / RC3 client PDF):
 * navy masthead, meta rows, financial-summary panel, colour account bars,
 * quiet uppercase table headers, gray total rows, document footer.
 * Layout only — no financial formulas.
 *
 * Partner-sendable PDFs: `renderAviPartnerReportPdf` (empty Chrome header +
 * JJ footer Page N of M). Interactive window.print() is not the send path.
 */
import { AVI_REPORT_COLORS as C } from '@/components/finance/aviReportTokens'

export const AVI_REPORT_PRINT_CSS = `
@font-face {
  font-family: 'Heebo';
  src: url('/fonts/Heebo-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Heebo';
  src: url('/fonts/Heebo-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

[data-avi-print-root] {
  --avi-navy: ${C.navy};
  --avi-navy-light: ${C.navyLight};
  --avi-navy-deep: ${C.navyDeep};
  --avi-green: ${C.green};
  --avi-green-bg: ${C.greenBg};
  --avi-green-border: ${C.greenBorder};
  --avi-red: ${C.red};
  --avi-orange: ${C.orange};
  --avi-purple: ${C.purple};
  --avi-blue: ${C.blue};
  --avi-gray-bg: ${C.grayBg};
  --avi-gray-border: ${C.grayBorder};
  --avi-gray-line: ${C.grayLine};
  --avi-gray-text: ${C.grayText};
  --avi-gray-mid: ${C.grayMid};
  --avi-gray-dark: ${C.grayDark};
  --avi-white: ${C.white};
  font-family: 'Heebo', system-ui, sans-serif;
  color: ${C.grayDark};
  font-size: 9.5pt;
  line-height: 1.35;
  background: ${C.white};
}

/* ── Orit masthead ───────────────────────────────────────────────────────── */
.avi-doc-masthead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.85rem;
  padding-bottom: 0.65rem;
  border-bottom: 2px solid ${C.navy};
}

.avi-doc-brand-block { min-width: 0; }

.avi-doc-brand {
  font-size: 17pt;
  font-weight: 700;
  color: ${C.navy};
  letter-spacing: 0.02em;
  text-transform: none;
  line-height: 1.15;
}

.avi-doc-title,
.avi-doc-title-main {
  margin-top: 0.15rem;
  font-size: 8.5pt;
  font-weight: 400;
  color: ${C.grayText};
  letter-spacing: 0;
}

.avi-doc-property {
  margin-top: 0.2rem;
  font-size: 11pt;
  font-weight: 700;
  color: ${C.navy};
}

.avi-doc-meta {
  font-size: 7.5pt;
  color: ${C.grayText};
  line-height: 1.4;
  text-align: end;
}

.avi-doc-meta-line { margin: 0.1rem 0 0; }

.avi-doc-meta-confidential {
  font-weight: 700;
  color: ${C.navy};
  letter-spacing: 0.04em;
}

.avi-doc-meta .avi-certified-pill {
  display: inline-block;
  margin-bottom: 0.3rem;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  background: ${C.greenBg};
  color: ${C.green};
  border: 1px solid ${C.greenBorder};
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.avi-doc-meta-note {
  color: ${C.grayMid};
  max-width: 15rem;
  font-size: 7pt;
}

/* Meta rows — PROPERTY / PERIOD / GENERATED */
.avi-meta-block {
  margin: 0 0 0.9rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid ${C.grayBorder};
}

.avi-meta-row {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.2rem;
  align-items: baseline;
}

.avi-meta-label {
  flex: 0 0 5.5rem;
  font-size: 7pt;
  font-weight: 700;
  color: ${C.grayText};
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.avi-meta-value {
  flex: 1;
  font-size: 8.5pt;
  color: ${C.grayDark};
}

/* ── Financial summary (Orit dark dashboard) ─────────────────────────────── */
.avi-fin-summary {
  background: ${C.navy};
  color: ${C.white};
  border-radius: 5px;
  padding: 0.85rem 0.95rem 0.95rem;
  margin-bottom: 0.85rem;
}

.avi-fin-summary-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.45rem;
}

.avi-fin-summary-kicker,
.avi-fin-summary-badge {
  font-size: 6.5pt;
  font-weight: 700;
  color: #93c5fd;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.avi-fin-summary-title {
  font-size: 12pt;
  font-weight: 700;
  color: ${C.white};
  margin: 0;
}

.avi-fin-summary-sub {
  font-size: 7.5pt;
  color: #bfdbfe;
  margin-top: 0.1rem;
}

.avi-fin-balance {
  margin-top: 0.65rem;
  background: rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 0.7rem 0.85rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.avi-fin-balance-label {
  font-size: 7pt;
  font-weight: 700;
  color: #bfdbfe;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.avi-fin-balance-value {
  font-size: 16pt;
  font-weight: 700;
  color: #bbf7d0;
  line-height: 1.15;
  text-align: end;
}

.avi-fin-balance-hint {
  font-size: 7pt;
  color: #93c5fd;
  margin-top: 0.15rem;
  text-align: end;
}

.avi-fin-ops {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  margin-top: 0.65rem;
}

.avi-fin-ops-cell {
  border: 1px solid rgba(134, 239, 172, 0.35);
  border-radius: 4px;
  background: rgba(15, 40, 70, 0.55);
  padding: 0.55rem 0.5rem 0.45rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
}

.avi-fin-ops-cell[data-tone="summary"] {
  background: rgba(22, 101, 52, 0.45);
  border-color: rgba(134, 239, 172, 0.55);
}

.avi-fin-ops-label {
  font-size: 6pt;
  font-weight: 700;
  color: #93c5fd;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.avi-fin-ops-value {
  font-size: 11pt;
  font-weight: 700;
  color: ${C.white};
  font-variant-numeric: tabular-nums;
}

.avi-fin-ops-cell[data-tone="summary"] .avi-fin-ops-value {
  color: #bbf7d0;
}

.avi-fin-formula {
  margin-top: 0.55rem;
  font-size: 7pt;
  color: #bfdbfe;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ── KPI metric strip (Orit moduleMetrics) ───────────────────────────────── */
.avi-kpi-strip {
  display: flex;
  border: 1px solid ${C.grayBorder};
  border-radius: 4px;
  overflow: hidden;
  background: ${C.grayBg};
  margin: 0.45rem 0 0.55rem;
}

.avi-kpi-tile {
  flex: 1;
  padding: 0.45rem 0.5rem;
  border-inline-end: 1px solid ${C.grayBorder};
  text-align: center;
  background: ${C.grayBg};
  border-radius: 0;
}

.avi-kpi-tile:last-child {
  border-inline-end: none;
  background: #f1f5f9;
}

.avi-kpi-tile .avi-kpi-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${C.grayText};
  margin-bottom: 0.2rem;
}

.avi-kpi-tile .avi-kpi-value {
  font-size: 10pt;
  font-weight: 700;
  color: ${C.grayDark};
  font-variant-numeric: tabular-nums;
}

/* ── Colour account bars (Orit accountHeader) ────────────────────────────── */
.avi-account-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.7rem;
  border-radius: 4px;
  margin: 0.7rem 0 0.4rem;
  color: ${C.white};
  background: ${C.navy};
}

.avi-account-bar[data-tone="navy"] { background: ${C.navy}; }
.avi-account-bar[data-tone="purple"] { background: ${C.purple}; }
.avi-account-bar[data-tone="orange"] { background: ${C.orange}; }
.avi-account-bar[data-tone="blue"] { background: ${C.blue}; }
.avi-account-bar[data-tone="green"] { background: ${C.green}; }

.avi-account-bar-title {
  font-size: 9.5pt;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: ${C.white};
  margin: 0;
}

.avi-account-bar-sub {
  font-size: 7pt;
  color: rgba(255,255,255,0.85);
  margin-top: 0.1rem;
}

.avi-account-bar-right {
  text-align: end;
}

.avi-account-bar--centered {
  flex-direction: column;
  justify-content: center;
  text-align: center;
  gap: 0.35rem;
}

.avi-account-bar--centered .avi-account-bar-right {
  text-align: center;
}

.avi-account-bar-amount {
  font-size: 11pt;
  font-weight: 700;
  color: ${C.white};
  font-variant-numeric: tabular-nums;
}

.avi-account-bar-amount-hint {
  font-size: 6.5pt;
  color: rgba(255,255,255,0.85);
}

/* Soft section wrapper — document flow, not dashboard cards */
.avi-section {
  border: none;
  background: transparent;
  border-radius: 0;
  overflow: visible;
  margin-bottom: 0.35rem;
}

.avi-section-head {
  display: none; /* replaced by avi-account-bar */
}

.avi-section-body {
  padding: 0;
}

.avi-section-sub {
  font-size: 7.5pt;
  color: ${C.grayText};
  margin: 0 0 0.35rem;
}

/* ── Tables (Orit tableHead / tableRow / tableTot) ────────────────────────── */
.avi-table,
.avi-section table,
[data-avi-print-root] table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
}

.avi-table thead th,
.avi-section table thead th,
[data-avi-print-root] table thead th {
  background: ${C.grayBg};
  color: ${C.grayText};
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.02em;
  /* Keep brand names (Airbnb / Hostaway) readable — never force ALL CAPS. */
  text-transform: none;
  padding: 0.28rem 0.4rem;
  border-top: 1px solid ${C.grayBorder};
  border-bottom: 1px solid ${C.grayBorder};
  text-align: start;
}

.avi-table tbody td,
.avi-section table tbody td,
[data-avi-print-root] table tbody td {
  padding: 0.28rem 0.4rem;
  border-bottom: 1px solid ${C.grayLine};
  vertical-align: top;
  color: ${C.grayDark};
  font-size: 8pt;
}

.avi-table tbody tr:nth-child(even) td {
  background: #fafafa;
}

.avi-table .avi-total-row td,
.avi-section tr[data-testid="avi-monthly-totals"] td,
[data-avi-print-root] .avi-total-row td {
  background: ${C.grayBg} !important;
  border-top: 1px solid ${C.grayBorder};
  font-weight: 700;
  color: ${C.grayDark};
}

.avi-amt,
.avi-table .text-right,
.avi-table .text-end {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.avi-group-label {
  font-size: 7.5pt;
  font-weight: 700;
  color: ${C.grayText};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.45rem 0.15rem 0.25rem;
}

/* Settlement summary navy card (Orit finalSection).
   Table body is white with dark text so print's html/body grayDark !important
   cannot wash out layer names and amounts on the navy panel. */
.avi-settlement-box {
  margin-top: 0.75rem;
  background: ${C.navy};
  color: ${C.white};
  border-radius: 5px;
  padding: 0.85rem;
}

.avi-settlement-box .avi-settlement-kicker {
  font-size: 6.5pt;
  font-weight: 700;
  color: #93c5fd !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.35rem;
  text-align: center;
}

.avi-settlement-box .avi-fin-summary-sub,
.avi-settlement-box .avi-settlement-title {
  color: ${C.white} !important;
  text-align: center;
  margin: 0 0 0.55rem;
}

.avi-settlement-box table,
.avi-settlement-box .avi-settlement-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.55rem;
  background: #ffffff !important;
  border-radius: 4px;
  overflow: hidden;
}

.avi-settlement-box thead,
.avi-settlement-box tbody,
.avi-settlement-box tr {
  background: #ffffff !important;
}

.avi-settlement-box th,
.avi-settlement-box td {
  padding: 0.32rem 0.4rem;
  border-bottom: 1px solid ${C.grayLine};
  color: ${C.grayDark} !important;
  font-size: 7.5pt;
  background: #ffffff !important;
  text-align: center !important;
}

.avi-settlement-box th {
  background: ${C.grayBg} !important;
  color: ${C.grayText} !important;
  font-size: 6.5pt;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.02em;
  border-bottom: 1px solid ${C.grayBorder};
}

.avi-settlement-box td span,
.avi-settlement-box th span {
  color: inherit !important;
}

.avi-settlement-box .avi-total-row td {
  background: ${C.grayBg} !important;
  border-top: 1px solid ${C.grayBorder};
  color: ${C.grayDark} !important;
  font-weight: 700;
}

.avi-settlement-box .avi-fin-ops,
.avi-settlement-box .avi-settlement-summary-row {
  justify-items: center;
}

.avi-settlement-box .avi-fin-ops-label,
.avi-settlement-box .avi-fin-balance-label {
  color: #93c5fd !important;
  text-align: center;
}

.avi-settlement-box .avi-fin-ops-value,
.avi-settlement-box .avi-fin-ops-value span,
.avi-settlement-box .avi-fin-balance-value,
.avi-settlement-box .avi-fin-balance-value span {
  color: ${C.white} !important;
  text-align: center;
}

.avi-settlement-box .avi-fin-ops-cell[data-tone="summary"] .avi-fin-ops-value,
.avi-settlement-box .avi-fin-ops-cell[data-tone="summary"] .avi-fin-ops-value span {
  color: #bbf7d0 !important;
}

.avi-settlement-box .avi-fin-balance {
  flex-direction: column;
  justify-content: center;
  text-align: center;
  gap: 0.25rem;
}

.avi-settlement-box .avi-fin-balance-value,
.avi-settlement-box .avi-fin-balance-hint {
  text-align: center;
}

.avi-settlement-narrative {
  font-size: 7.5pt;
  color: #bfdbfe !important;
  line-height: 1.45;
  margin-top: 0.45rem;
  text-align: center;
}

.avi-print-payments table th,
.avi-print-payments table td,
.avi-print-payments .text-left,
.avi-print-payments .text-right,
.avi-print-payments .text-center {
  text-align: center !important;
}

.avi-ownership-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.55rem;
  border-bottom: 1px solid ${C.grayLine};
}

.avi-ownership-row:last-child { border-bottom: none; }

.avi-note-plain {
  font-size: 7.5pt;
  color: ${C.grayText};
  margin: 0.35rem 0;
}

/* Legacy aliases kept for existing markup */
.avi-final-hero { display: none; }
.avi-formula { display: none; }

@media (max-width: 640px) {
  .avi-fin-ops { grid-template-columns: 1fr; }
  .avi-kpi-strip { flex-direction: column; }
  .avi-kpi-tile { border-inline-end: none; border-bottom: 1px solid ${C.grayBorder}; }
  .avi-doc-masthead { flex-direction: column; }
  .avi-doc-meta { text-align: start; }
}

@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 11mm 14mm 11mm;
  }

  html, body {
    background: #ffffff !important;
    color: ${C.grayDark} !important;
    font-family: 'Heebo', system-ui, sans-serif !important;
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
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
    gap: 0.35rem !important;
    font-size: 8.5pt !important;
  }

  [data-avi-print-root].space-y-6 > :not([hidden]) ~ :not([hidden]) {
    margin-top: 0.4rem !important;
  }

  .avi-print-keep,
  .avi-fin-summary,
  .avi-account-bar,
  .avi-kpi-strip,
  .avi-settlement-box {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .avi-account-bar,
  .avi-print-section-title {
    break-after: avoid;
    page-break-after: avoid;
  }

  .avi-doc-masthead {
    display: flex !important;
    margin-bottom: 0.55rem !important;
    padding-bottom: 0.45rem !important;
  }

  .avi-doc-brand { font-size: 14pt !important; }
  .avi-doc-title, .avi-doc-title-main { font-size: 8pt !important; }
  .avi-doc-property { font-size: 10pt !important; }
  .avi-doc-meta { font-size: 7pt !important; }

  .avi-fin-summary { padding: 0.65rem 0.75rem !important; }
  .avi-fin-balance-value { font-size: 14pt !important; }

  [data-avi-print-root] table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5pt;
  }

  [data-avi-print-root] th,
  [data-avi-print-root] td {
    padding: 2.5px 4px !important;
    vertical-align: top;
  }

  /* Final-settlement table must stay white-on-readability inside the navy card. */
  .avi-settlement-box table,
  .avi-settlement-box thead,
  .avi-settlement-box tbody,
  .avi-settlement-box tr,
  .avi-settlement-box td {
    background: #ffffff !important;
    color: ${C.grayDark} !important;
  }
  .avi-settlement-box th,
  .avi-settlement-box td {
    text-align: center !important;
  }
  .avi-settlement-box th {
    background: ${C.grayBg} !important;
    color: ${C.grayText} !important;
  }
  .avi-settlement-box td span,
  .avi-settlement-box th span {
    color: inherit !important;
  }
  .avi-settlement-box .avi-fin-ops-label,
  .avi-settlement-box .avi-fin-balance-label {
    color: #93c5fd !important;
    text-align: center !important;
  }
  .avi-settlement-box .avi-fin-ops-value,
  .avi-settlement-box .avi-fin-ops-value span,
  .avi-settlement-box .avi-fin-balance-value,
  .avi-settlement-box .avi-fin-balance-value span {
    color: #ffffff !important;
    text-align: center !important;
  }
  .avi-settlement-box .avi-fin-summary-sub,
  .avi-settlement-box .avi-settlement-kicker {
    color: #93c5fd !important;
    text-align: center !important;
  }
  .avi-settlement-box .avi-fin-summary-sub {
    color: #ffffff !important;
  }
  .avi-settlement-box .avi-fin-balance {
    flex-direction: column !important;
    justify-content: center !important;
    text-align: center !important;
  }
  .avi-settlement-narrative {
    color: #bfdbfe !important;
    text-align: center !important;
  }
  .avi-print-payments .avi-account-bar--centered {
    flex-direction: column !important;
    text-align: center !important;
  }
  .avi-print-payments table th,
  .avi-print-payments table td {
    text-align: center !important;
  }

  [data-avi-print-root] thead { display: table-header-group !important; }
  [data-avi-print-root] tfoot { display: table-row-group !important; }
  [data-avi-print-root] tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  [data-avi-table-desktop] { display: block !important; overflow: visible !important; }
  [data-avi-table-mobile] { display: none !important; }
  .avi-screen-only { display: none !important; }
  .avi-print-only { display: block !important; }

  tr.avi-ops-continued-banner { display: table-row !important; }
  tr.avi-ops-continued-banner th {
    background: ${C.orange} !important;
    color: ${C.white} !important;
    font-size: 7.5pt !important;
    font-weight: 700 !important;
    text-transform: none !important;
  }

  .avi-print-masthead { display: flex !important; }

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

  .avi-print-footer { display: none !important; }

  [data-avi-print-root] .jj-card {
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  a { color: inherit !important; text-decoration: none !important; }
  [dir="rtl"] { direction: rtl; }
}

@media screen {
  .avi-print-only { display: none !important; }
  tr.avi-ops-continued-banner { display: none !important; }
}
`
