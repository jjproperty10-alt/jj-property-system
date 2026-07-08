/**
 * JJ Property 10 — PDF formatting utilities.
 * Pure functions — no React, no side effects.
 *
 * Place at: src/lib/pdf/formatters.ts
 */

/**
 * Format a number as a Euro amount with thousands separator and 2 decimal places.
 * Always positive — caller decides sign/label.
 * Example: fmt(1234567.8) → "€1,234,567.80"
 */
export function fmt(n: number): string {
  const abs = Math.abs(n)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `€${formatted}.${decPart}`
}

/**
 * Format a number with an explicit +/- prefix.
 * Uses ASCII hyphen-minus (U+002D) — safe for all PDF fonts including Heebo.
 * Example: fmtSigned(-1234) → "-€1,234.00"
 *          fmtSigned(1234)  → "+€1,234.00"
 *          fmtSigned(0)     → "€0.00"
 */
export function fmtSigned(n: number): string {
  if (Math.abs(n) < 0.005) return '€0.00'
  return n > 0 ? `+${fmt(n)}` : `-${fmt(n)}`
}
