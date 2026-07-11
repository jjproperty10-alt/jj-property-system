/**
 * JJ Property 10 — Approved Extras Registry
 * M0 — 2026-07-10
 *
 * Registry of approved extra subcategories in a Renovation account.
 *
 * ⚠️  NOT YET THE AUTHORITATIVE SOURCE.
 * The accounting classifier in computeBalance.ts still contains an
 * independent hardcoded `sub === 'Extras'` condition.
 *
 * Until M3 replaces that condition with `isApprovedExtra(sub)`, this
 * registry and the accounting classifier can drift independently.
 *
 * M3 action required:
 *   - import and use isApprovedExtra() in computeBalance.ts
 *   - remove the independent hardcoded condition
 *
 * Business rule (§3.2): "Extras" are additional work beyond the renovation
 * contract scope, billed to the client at client_charge.
 * They are the ONLY renovation expense subcategories that affect client balance.
 *
 * ACCOUNTING FREEZE: this file is classification-registry only.
 * Do NOT modify balance_effect, client_amount, or any accounting field.
 */

/**
 * Subcategory names that count as approved extra work in a Renovation account.
 *
 * Currently a single value ('Extras') — defined as a ReadonlySet for forward extension.
 * Both UI and PDF components must import from here — never duplicate inline.
 */
export const APPROVED_EXTRAS_SUBCATEGORIES: ReadonlySet<string> = new Set([
  'Extras',
])

/**
 * Returns true if the given subcategory is an approved extra.
 * Safe to call with null / undefined.
 */
export function isApprovedExtra(subcategory: string | null | undefined): boolean {
  if (!subcategory) return false
  return APPROVED_EXTRAS_SUBCATEGORIES.has(subcategory.trim())
}
