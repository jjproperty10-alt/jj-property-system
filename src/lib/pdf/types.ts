/**
 * JJ Property 10 — PDF Document Engine
 * Shared types for all PDF report documents.
 *
 * Place at: src/lib/pdf/types.ts
 */

// ─── Primitive row ────────────────────────────────────────────
export interface PdfTransaction {
  date:         string
  type:         string    // classification label (used as description fallback)
  description:  string    // raw description from DB
  amount:       number    // amount_eur — internal only, not shown in client PDF
  clientAmount: number    // client_charge when present, else amount_eur — used for display
  balEff:       number    // signed balance effect
  property?:    string    // canonical property name — shown only for multi-property reports
  payer?:       string
  payee?:       string
}

// ─── Section (one per classifyTx bucket) ─────────────────────
export interface PdfSection {
  key:          string
  title:        string
  operating:    boolean    // true → affects closingBalance
  isSettlement: boolean    // true → affects remainingBalance (post-closing)
  totalCredit:  number
  totalDebit:   number
  rows:         PdfTransaction[]
}

// ─── Balance direction ────────────────────────────────────────
export type BalanceDirection = 'owed_to_owner' | 'owed_to_jj' | 'settled'

// ─── Owner Settlement Report data ────────────────────────────
export interface OwnerPdfData {
  // Metadata
  contactName:  string
  properties:   string[]
  fromDate:     string    // ISO date e.g. "2023-01-01"
  toDate:       string
  generatedAt:  string    // display string e.g. "07 Jul 2026, 14:30"

  // Opening balance metadata
  openingBalanceAsOf?:  string | null   // ISO date of the opening balance source record
  pendingReviewCount?:  number           // rows excluded from balance (pending review)

  // Balance components
  openingBalance:    number
  totalPlatform:     number
  totalClientPmts:   number
  totalCharges:      number    // charges billed at client_charge (not amount_eur)
  totalExpenses:     number
  totalRenovation:   number
  totalBankPayments: number    // absolute amount sent to owner
  closingBalance:    number    // openingBalance + operating balEff (Stage 1)
  remainingBalance:  number    // closingBalance + totalBankPayments (Stage 3)

  // Direction shorthand
  direction: BalanceDirection

  // Sections — only those with rows, hidden sections already filtered out
  sections: PdfSection[]

  // Report mode flag
  includeReferenceInfo?: boolean  // default false — sale/purchase sections excluded
  }
