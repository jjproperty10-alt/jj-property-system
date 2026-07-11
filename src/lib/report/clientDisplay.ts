/**
 * JJ Property 10 — Client Display Helper
 * M0 — 2026-07-10
 *
 * clientDisplayText() — safe, client-facing text from an enriched row.
 *
 * Priority chain (approved M0):
 *   1. clientDescription param  — reserved for future `client_description` DB column
 *   2. row.display_label        — computed by computeBalance.ts → enrichRows()
 *   3. ''                       — safe empty-string fallback
 *
 * ⚠️  CRITICAL: The raw `description` field from the transactions table must
 *     NEVER be exposed to clients. It is JJ-internal and may contain operational
 *     notes, partner names, or other confidential information.
 *     This function NEVER reads row.description for any reason.
 *
 * ACCOUNTING FREEZE: presentation-only.
 * Do NOT read or modify balance_effect, client_amount, or any accounting field.
 */

import type { RC3AccountRow } from './types'

/**
 * Returns the safe, client-facing display text for a transaction row.
 *
 * Priority:
 *   1. `clientDescription` — explicit override from the future `client_description`
 *      DB column. Pass it when that column becomes available (post-RC3).
 *      Currently: always omit this argument (column not yet in schema).
 *   2. `row.display_label` — enriched label from computeBalance.ts.
 *      Stripped of trailing suffixes like ' (Cost Tracking)', ' (Needs Review)', etc.
 *      when shown in client-facing context — handled at the UI/PDF render layer.
 *   3. `''`               — empty string safe fallback.
 *      Callers should render a dash or nothing for empty strings.
 *
 * Usage — current (M0, M1, M2, M3):
 *   const label = clientDisplayText(row)
 *
 * Usage — future (when client_description column is available):
 *   const label = clientDisplayText(row, row.client_description)
 *
 * @param row               Enriched RC3AccountRow from computeBalance.ts/enrichRows()
 * @param clientDescription Optional override from `client_description` DB column.
 *                          DO NOT pass `row.description` here — forbidden without exception.
 */
export function clientDisplayText(
  row: RC3AccountRow,
  clientDescription?: string | null,
): string {
  // Priority 1: explicit client_description (future DB column — reserved)
  if (clientDescription != null && clientDescription.trim() !== '') {
    return clientDescription.trim()
  }

  // Priority 2: display_label from computeBalance enrichment
  if (row.display_label && row.display_label.trim() !== '') {
    return row.display_label.trim()
  }

  // Priority 3: safe empty-string fallback
  // *** row.description is intentionally never read here ***
  return ''
}
