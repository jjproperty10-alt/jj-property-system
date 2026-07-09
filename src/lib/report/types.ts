/**
 * JJ Property 10 — RC3 Report Engine Types
 * Phase 3 — 2026-07-09
 *
 * Source of truth for the account-based client report model.
 * All Phase 3 report components must import from here.
 *
 * Business rules reference: docs/HISTORICAL_BUSINESS_RULES_V1.md
 *
 * Balance conventions:
 *   rental / airbnb : positive = JJ owes owner  (owner_credit)
 *   sale / renovation : positive = client owes JJ (client_debt)
 */

// ─── Account type ─────────────────────────────────────────────────────────────

/** The four client-facing account types in RC3.
 *  Order matches client report display order: Sale → Renovation → Rental → Airbnb */
export type RC3AccountType = 'sale' | 'renovation' | 'rental' | 'airbnb'

/** Which direction the account balance is expressed */
export type BalanceConvention = 'owner_credit' | 'client_debt'

/** Display grouping for transaction rows within an account section */
export type DisplayGroup =
  | 'income'       // increases the positive side of the balance
  | 'expense'      // decreases the positive side of the balance
  | 'payment_out'  // BPO — money sent to owner
  | 'info'         // platform tracking, internal cost tracking — shown but balance_effect = 0
  | 'reference'    // contract values, internal-only rows — shown collapsed or hidden

// ─── Raw view row ─────────────────────────────────────────────────────────────

/** Raw row shape returned by v_rc3_sale | v_rc3_renovation | v_rc3_rental | v_rc3_airbnb.
 *  All fields match the Supabase view columns exactly. */
export interface RC3Row {
  id:                   string
  date:                 string         // ISO date string e.g. "2025-03-15"
  property_name:        string | null
  reporting_name:       string | null  // canonical name from property_reporting_map
  category:             string
  subcategory:          string | null
  description:          string | null
  payer:                string | null
  payee:                string | null
  amount_eur:           number         // JJ internal cost
  client_charge:        number | null
  client_amount:        number         // COALESCE(client_charge, amount_eur) — computed by view
  notes:                string | null
  k_note:               string | null
  account_type:         string         // 'sale' | 'renovation' | 'rental' | 'airbnb' from view
  is_contract_value:    boolean
  is_platform_tracking: boolean        // only TRUE when payer = 'Airbnb' (OQ-01 fix applied)
  is_bpo:               boolean        // Bank Payment to Owner
  review_status:        string | null
  created_at?:          string
  updated_at?:          string
}

// ─── Enriched row ─────────────────────────────────────────────────────────────

/** RC3Row enriched with computed display + balance fields by computeBalance.ts */
export interface RC3AccountRow extends RC3Row {
  /** Signed amount applied to closing balance.
   *  Positive = increases balance (income or additional debt depending on convention).
   *  Zero = informational or reference row. */
  balance_effect: number

  /** Whether this row enters the balance equation. False = info/reference. */
  is_balance_affecting: boolean

  /** Client-facing display grouping */
  display_group: DisplayGroup

  /** Client-facing subcategory label (e.g. 'Rent Collected', 'Payment Received') */
  display_label: string
}

// ─── Account section ──────────────────────────────────────────────────────────

/** One account section in the report (one per account_type with data) */
export interface RC3AccountSection {
  account_type:        RC3AccountType
  account_label:       string           // e.g. 'Property Purchase'
  account_label_he:    string           // e.g. 'רכישת נכס'
  balance_convention:  BalanceConvention
  opening_balance:     number           // 0 until contact_opening_balances is implemented (Task 5)
  rows:                RC3AccountRow[]  // all rows including info/reference
  // Contract baseline (sale + renovation only)
  // Sum of is_contract_value rows' client_amount.
  // Rental / airbnb always 0.
  // Rule (approved Yossi 2026-07-09): contract value is the client debt baseline.
  contract_baseline:   number
  // Aggregates (balance-affecting rows only)
  total_income:        number           // sum of positive balance effects
  total_expenses:      number           // sum of expense effects (absolute value)
  total_bpo:           number           // Bank Payments to Owner (absolute value)
  closing_balance:     number           // contract_baseline + opening_balance + Σ balance_effect
}

// ─── Full report ──────────────────────────────────────────────────────────────

/** Complete RC3 report for one property (one reporting_name) */
export interface RC3PropertyReport {
  reporting_name: string
  from_date:      string | null   // ISO date or null (all time)
  to_date:        string | null
  generated_at:   string          // ISO timestamp
  accounts:       RC3AccountSection[]
  // Convenience flags — which accounts have data
  has_sale:        boolean
  has_renovation:  boolean
  has_rental:      boolean
  has_airbnb:      boolean
}
