/**
 * JJ Property 10 — PDF Document Engine
 * Shared types for all PDF report documents.
 *
 * Place at: src/lib/pdf/types.ts
 */

// ─── Primitive row ────────────────────────────────────────────
export interface PdfTransaction {
  date:        string
  type:        string   // subcategory
  description: string
  amount:      number   // amount_eur (absolute)
  balEff:      number   // signed balance effect
  payer?:      string
  payee?:      string
}

// ─── Section (one per classifyTx bucket) ─────────────────────
export interface PdfSection {
  key:         string
  title:       string
  operating:   boolean   // true → affects closingBalance
  isSettlement: boolean  // true → affects remainingBalance (post-closing)
  totalCredit: number
  totalDebit:  number
  rows:        PdfTransaction[]
}

// ─── Balance direction ────────────────────────────────────────
export type BalanceDirection = 'owed_to_owner' | 'owed_to_jj' | 'settled'

// ─── Owner Settlement Report data ────────────────────────────
export interface OwnerPdfData {
  // Metadata
  contactName:  string
  properties:   string[]
  fromDate:     string   // ISO date e.g. "2023-01-01"
  toDate:       string
  generatedAt:  string   // display string e.g. "07 Jul 2026, 14:30"

  // Opening balance metadata
  openingBalanceAsOf?: string | null   // ISO date of the opening balance source record
  pendingReviewCount?: number           // rows classified as pending_review (excluded from balance)

  // Balance components
  openingBalance:    number
  totalPlatform:     number
  totalClientPmts:   number
  totalCharges:      number
  totalExpenses:     number
  totalRenovation:   number
  totalBankPayments: number
  closingBalance:    number   // openingBalance + operating balEff
  remainingBalance:  number   // closingBalance + bankPayments

  // Direction shorthand
  direction: BalanceDirection

  // Sections — only those with rows, in canonical order
  sections: PdfSection[]
}
