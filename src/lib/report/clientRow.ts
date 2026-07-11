/**
 * JJ Property 10 — Client-Safe DTO
 * ADR-001 Stage 4B — M1 — 2026-07-11
 *
 * ClientDisplayRow: narrow interface containing ONLY the fields that
 * client-facing renderers (TxRow, ExpenseGroupBlock, TxGroupTable, RefSection)
 * need to display a transaction row.
 *
 * Deliberately excludes: description, notes, k_note, memo, payer, payee,
 * amount_eur, client_charge, and all internal classification flags.
 *
 * Receiving ClientDisplayRow instead of RC3AccountRow makes whitelist
 * violations compile-time errors rather than CI-time catches.
 *
 * Usage:
 *   import { toClientRow } from '@/lib/report/clientRow'
 *   const rows: ClientDisplayRow[] = section.rows.map(toClientRow)
 */

import type { RC3AccountRow, DisplayGroup } from './types'

export interface ClientDisplayRow {
  /** Transaction UUID -- used as React key */
  id:            string
  /** ISO date string e.g. "2025-03-15" */
  date:          string
  /** Amount shown to client: COALESCE(client_charge, amount_eur) */
  client_amount: number
  /** Client-facing display grouping (income / expense / payment_out / info / reference) */
  display_group: DisplayGroup
  /** Client-facing subcategory label e.g. "Rent Collected" */
  display_label: string
  /** Account type: 'sale' | 'renovation' | 'rental' | 'airbnb' */
  account_type:  string
  /** Raw subcategory -- used by buildRowLabel for expense label lookup */
  subcategory:   string | null
}

/**
 * Convert a full RC3AccountRow to the client-safe DTO.
 *
 * Only approved display fields are copied.
 * Forbidden fields (description, notes, k_note, payer, payee, amount_eur,
 * client_charge, and internal flags) are structurally excluded.
 *
 * This function is the single authorized boundary between the full internal
 * row model and the client-facing presentation layer.
 */
export function toClientRow(row: RC3AccountRow): ClientDisplayRow {
  return {
    id:            row.id,
    date:          row.date,
    client_amount: row.client_amount,
    display_group: row.display_group,
    display_label: row.display_label,
    account_type:  row.account_type,
    subcategory:   row.subcategory ?? null,
  }
}
