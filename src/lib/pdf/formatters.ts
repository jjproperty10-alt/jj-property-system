/**
 * JJ Property 10 — PDF Formatting Utilities
 *
 * Pure number-to-string formatters shared by the PDF engine.
 * Extracted from OwnerSettlementPdf.tsx so they can be unit-tested
 * independently of the React-PDF renderer.
 *
 * Place at: src/lib/pdf/formatters.ts
 */

/**
 * Format an absolute euro amount with thousands separator and exactly 2 decimal places.
 * Negative inputs are treated as positive (use fmtSigned for signed display).
 *
 * @example fmt(1234.567)  → "€1,234.57"
 * @example fmt(0)         → "€0.00"
 */
export function fmt(n: number): string {
  const abs = Math.abs(n)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `€${formatted}.${decPart}`
}

/**
 * Format a signed euro amount.
 * Values within ±€0.005 are treated as zero and rendered as "€0.00".
 * Positive values get a "+" prefix; negative values get a "−" (Unicode minus U+2212) prefix.
 *
 * @example fmtSigned(1234.56)  → "+€1,234.56"
 * @example fmtSigned(-1234.56) → "−€1,234.56"   (Unicode minus, not ASCII hyphen)
 * @example fmtSigned(0)        → "€0.00"
 */
export function fmtSigned(n: number): string {
  if (Math.abs(n) < 0.005) return '€0.00'
  return n > 0 ? `+${fmt(n)}` : `−${fmt(n)}`
}
