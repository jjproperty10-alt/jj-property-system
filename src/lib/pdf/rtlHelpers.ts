/**
 * RTL/LTR layout helpers for react-pdf.
 *
 * react-pdf does not implement the Unicode bidi algorithm natively.
 * These helpers provide a consistent, reusable system for laying out
 * Hebrew (RTL) and English (LTR) PDFs from the same component tree.
 *
 * Conventions:
 *   - Dates:     always LTR  (English format, numeric — no bidi issue)
 *   - Currency:  always LTR-readable (€1,234.56 — numeric, never character-reversed)
 *   - Labels:    rtlTextStyle() → textAlign:'right' in RTL
 *   - Row order: rtlRowDirection() → flexDirection:'row-reverse' in RTL
 */

import type { Lang } from '../report/labels'

/** True when the given language renders right-to-left. */
export function isRTL(lang: Lang): boolean {
  return lang === 'he'
}

/**
 * Returns `{ flexDirection: 'row-reverse' }` for RTL, `{}` for LTR.
 * Apply to any View with an implicit or explicit `flexDirection: 'row'`.
 */
export function rtlRowDirection(lang: Lang): { flexDirection?: 'row-reverse' } {
  return isRTL(lang) ? { flexDirection: 'row-reverse' as const } : {}
}

/**
 * Returns `{ textAlign: 'right' }` for RTL, `{}` for LTR.
 * Apply to Text elements containing translated labels.
 * Do NOT apply to numeric/currency Text — those are always LTR-readable.
 */
export function rtlTextStyle(lang: Lang): { textAlign?: 'right' } {
  return isRTL(lang) ? { textAlign: 'right' as const } : {}
}

/**
 * Amount column alignment:
 *   RTL → `{ textAlign: 'left' }`   (amount col is visually leftmost in a reversed row)
 *   LTR → `{ textAlign: 'right' }`  (standard right-aligned amount column)
 *
 * Use on currency / amount columns to replace the static `textAlign:'right'` style.
 */
export function rtlColumnOrder(lang: Lang): { textAlign: 'left' | 'right' } {
  return isRTL(lang)
    ? { textAlign: 'left' as const }
    : { textAlign: 'right' as const }
}

/**
 * End-anchor alignment for sub-views:
 *   RTL → `{ alignItems: 'flex-start' }` (header right panel flips to left anchor)
 *   LTR → `{ alignItems: 'flex-end' }`
 *
 * Apply to right-anchored panels (e.g. header right side) that should flip in RTL.
 */
export function rtlAlignEnd(lang: Lang): { alignItems: 'flex-start' | 'flex-end' } {
  return isRTL(lang)
    ? { alignItems: 'flex-start' as const }
    : { alignItems: 'flex-end' as const }
}
