/**
 * JJ Property 10 â RC3 Report Engine Types
 * Phase 3 â 2026-07-09
 * Gate 2 â 2026-07-19: Certified STR + Counterparty Settlement types
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

// âââ Account type âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** The four client-facing account types in RC3.
 *  Order matches client report display order: Sale â Renovation â Rental â Airbnb */
export type RC3AccountType = 'sale' | 'renovation' | 'rental' | 'airbnb'

/** Which direction the account balance is expressed */
export type BalanceConvention = 'owner_credit' | 'client_debt'

/** Display grouping for transaction rows within an account section */
export type DisplayGroup =
  | 'income'       // increases the positive side of the balance
  | 'expense'      // decreases the positive side of the balance
  | 'payment_out'  // BPO â money sent to owner
  | 'info'         // platform tracking, internal cost tracking â shown but balance_effect = 0
  | 'reference'    // contract values, internal-only rows â shown collapsed or hidden

// âââ Raw view row âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
  client_amount:        number         // COALESCE(client_charge, amount_eur) â computed by view
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

// âââ Enriched row âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

// âââ Account section ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** One account section in the report (one per account_type with data) */
export interface RC3AccountSection {
  account_type:        RC3AccountType
  account_label:       string           // e.g. 'Property Purchase'
  account_label_he:    string           // e.g. '×¨×××©×ª × ××¡'
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
  closing_balance:     number           // contract_baseline + opening_balance + Î£ balance_effect
}

// âââ Certified STR Settlement (from v_str_settlement_report) ââââââââââââââââ

/** One month of certified STR financial data for a single property.
 *  Source: pms.v_str_property_settlement via public.v_str_settlement_report wrapper.
 *  Semantic owner: "What is the certified STR financial result for this property and reporting month?" */
export interface CertifiedSTRMonth {
  property_name:                          string
  owner_name:                             string
  reporting_month:                        string           // ISO date, first of month e.g. "2026-01-01"
  reservation_count:                      number
  booked_nights:                          number
  gross_rental_revenue:                   number
  cleaning_income:                        number
  total_platform_fees:                    number
  total_payment_fees:                     number
  total_taxes:                            number
  total_payout:                           number
  management_fee:                         number
  hostaway_monthly_fee:                   number
  other_owner_chargeable_str_expenses:    number
  total_owner_chargeable_expenses:        number
  hostaway_owner_entitlement:             number
  owner_payments_attributed_to_property:  number
  property_period_balance:                number
  // Certification
  snapshot_count:                         number
  all_control_checks_pass:                boolean
  source_confidence:                      string           // 'CERTIFIED' | 'PROVISIONAL' | ...
  has_unresolved_data:                    boolean
  rounding_delta:                         number
}

/** Period coverage status for certified STR data */
export type STRPeriodCoverage =
  | 'full'            // selected range aligns to full calendar months
  | 'partial'         // selected range contains partial months
  | 'unavailable'     // no certified STR data for this property/period

/** Aggregated certified STR data for the report period */
export interface CertifiedSTRSummary {
  months:                       CertifiedSTRMonth[]
  // Aggregates across all months in range
  total_reservation_count:      number
  total_booked_nights:          number
  total_gross_rental_revenue:   number
  total_cleaning_income:        number
  total_platform_fees:          number
  total_payment_fees:           number
  total_taxes:                  number
  total_payout:                 number
  total_management_fee:         number
  total_owner_chargeable_expenses: number
  total_owner_entitlement:      number
  total_owner_payments:         number
  total_period_balance:         number
  // Certification status
  all_months_certified:         boolean
  all_controls_pass:            boolean
  has_any_unresolved:           boolean
  period_coverage:              STRPeriodCoverage
  // Owner name (for counterparty lookup)
  owner_name:                   string | null
}

// âââ Counterparty Settlement (from v_counterparty_position) âââââââââââââââââ

/** Settlement position for the property owner (counterparty-wide).
 *  Source: public.v_counterparty_position.
 *  Semantic owner: "What is the current known settlement position between JJ and the counterparty?" */
export interface CounterpartySettlement {
  counterparty_name:            string
  counterparty_id:              string
  // Domain balances
  str_balance:                  number
  management_balance:           number
  renovation_balance:           number
  sale_balance:                 number
  // Aggregate position
  gross_counterparty_position:  number
  owner_payments:               number
  final_counterparty_position:  number
  position_direction:           string        // 'jj_owes_counterparty' | 'counterparty_owes_jj' | 'settled'
  position_label:               string
  // Coverage & confidence
  has_certified_str:            boolean
  str_controls_pass:            boolean
  has_unresolved_history:       boolean
  unresolved_item_count:        number
  confidence_status:            string         // 'CERTIFIED' | 'PROVISIONAL' | ...
  str_coverage_count:           number
  total_property_count:         number
  as_of_date:                   string
}

// âââ Full report ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** Complete RC3 report for one property (one reporting_name) */
export interface RC3PropertyReport {
  reporting_name: string
  from_date:      string | null   // ISO date or null (all time)
  to_date:        string | null
  generated_at:   string          // ISO timestamp
  accounts:       RC3AccountSection[]
  // Convenience flags â which accounts have data
  has_sale:        boolean
  has_renovation:  boolean
  has_rental:      boolean
  has_airbnb:      boolean
  // Gate 2 â Certified STR settlement (null if unavailable or failed to load)
  certifiedSTR:    CertifiedSTRSummary | null
  // Gate 2 â Counterparty settlement position (null if unavailable or failed to load)
  settlement:      CounterpartySettlement | null
}
