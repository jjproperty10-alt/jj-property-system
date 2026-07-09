/**
 * JJ Property 10 — RC3 Balance Engine
 * Phase 3 — 2026-07-09 (updated 2026-07-09: Rental/Airbnb expense handlers, Sale Tax/CSE handlers)
 * (updated 2026-07-09: contract_baseline for Sale and Renovation accounts)
 *
 * Implements the business rules from docs/HISTORICAL_BUSINESS_RULES_V1.md.
 * This file must remain in sync with that document — update both together.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Balance conventions
 * ────────────────────────────────────────────────────────────────────────────
 *   rental / airbnb : positive closing_balance = JJ owes owner  (owner_credit)
 *   sale / renovation : positive closing_balance = client owes JJ (client_debt)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Key rules (see HISTORICAL_BUSINESS_RULES_V1.md for full rationale)
 * ────────────────────────────────────────────────────────────────────────────
 *   is_contract_value = TRUE  → balance_effect = 0  (reference row display)
 *                             → client_amount added to contract_baseline (see below)
 *   is_platform_tracking = TRUE → balance_effect = 0  (payer=Airbnb; already in Platform Income)
 *   is_bpo = TRUE             → balance_effect = -client_amount (payment sent to owner)
 *
 *   Renovation: ONLY Extras (+) and Client Payment (-) affect balance.
 *               All other expense rows are internal cost tracking (balance_effect = 0).
 *
 *   Sale: Broker Fee is an internal JJ cost — hidden from client report (balance_effect = 0).
 *         Client Sale Expenses + Sale Tax: real costs billed to client → balance_effect = +client_amount.
 *
 *   Deposit / Deposit Refund (Management): trust account rows — balance_effect = 0
 *     (separate trust register, not part of P&L balance).
 *
 *   Rental Management Fee: always a real deduction from owner balance (balance_effect = -client_amount).
 *     This is JJ's monthly fee deducted from rent. No payer condition needed — the SQL view
 *     guarantees that category=Management rows never have is_platform_tracking=TRUE.
 *
 *   Airbnb Cleaning + Management Fee with payer = Airbnb:
 *     is_platform_tracking = TRUE (set by SQL view OQ-01 fix) → balance_effect = 0.
 *     Already netted from Platform Income — must not be counted twice.
 *
 *   Airbnb Cleaning + Management Fee with payer ≠ Airbnb:
 *     is_platform_tracking = FALSE → real expense → balance_effect = -client_amount.
 *     The payer split is enforced entirely at the SQL layer; TypeScript trusts the flag.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Three-section structure (approved 2026-07-09)
 * ────────────────────────────────────────────────────────────────────────────
 *   Section A — Reference  (display_group = 'reference', balance_effect = 0)
 *   Section B — Balance-Affecting  (display_group = 'income' | 'expense' | 'payment_out')
 *   Section C — Informational  (display_group = 'info', balance_effect = 0)
 *   Only Section B rows enter the closing balance equation.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Contract Baseline (approved Yossi 2026-07-09)
 * ────────────────────────────────────────────────────────────────────────────
 *   Sale / Renovation: contract value IS the client debt baseline.
 *   The contract row stays in Section A (reference, balance_effect=0 for display),
 *   but its client_amount is extracted and added to closing_balance.
 *
 *   Sale:       Contract + Sale Expenses − Client Payments − Third-Party Payments = Balance
 *   Renovation: Contract + Extras − Client Payments = Balance
 *   Rental / Airbnb: no contract baseline (P&L accounts, no fixed obligation)
 *
 *   Example — Liron & Alon:
 *     200,000 + 4,765 − 70,765 − 134,000 = 0
 */

import type {
  RC3Row,
  RC3AccountRow,
  RC3AccountSection,
  RC3AccountType,
  BalanceConvention,
  DisplayGroup,
} from './types'

// ─── Sets of subcategory names ────────────────────────────────────────────────

/**
 * Renovation expense subcategories that are INTERNAL cost tracking.
 * These appear in the transaction list for internal analysis but do NOT
 * affect the client-facing balance.
 * Rule: §3.2 — "The renovation account is based on the contract value."
 */
const RENOVATION_INTERNAL_SUBS = new Set([
  'Materials', 'Contractors', 'Workers',
  'Electrical Appliances', 'Furniture', 'Alouminiom',
  'Electricity', 'Consumable Supplies', 'Skip', 'Keramik',
  'Carpenter', 'Cleaning', 'Sheets and Towels', 'Design',
  'Plumber', 'Pool Service', 'Repair', 'Repairs',
  'Curtains', 'Lighting', 'Kitchen Supply', 'Kitchen',
  'Photography', 'Wine',
])

/**
 * Sale subcategories that are INTERNAL to JJ — hidden from client balance.
 * Rule: §4.9 — Broker Fee is paid by JJ from JJ funds; not client's cost.
 */
const SALE_INTERNAL_SUBS = new Set(['Broker Fee'])

/**
 * Management subcategories that are TRUST ACCOUNT rows.
 * Rule: §4.8 — Deposit/Deposit Refund are real cash but held in trust.
 * Not part of P&L balance — shown separately in trust register.
 */
const TRUST_SUBS = new Set(['Deposit', 'Deposit refund'])

/**
 * Rental (Management category) expense subcategories that reduce the owner's credit.
 * Rule (approved 2026-07-09): All operating costs JJ pays on behalf of the long-term rental
 * owner reduce the owner's settlement balance. Management Fee is always a real deduction
 * in this context — it is JJ's monthly management fee deducted from the rent collected.
 *
 * NOTE: Staff Accommodation Rent (payer=JJ, payee=JJ) is intentionally excluded —
 * it is an internal JJ entry requiring manual review.
 */
const RENTAL_EXPENSE_SUBS = new Set([
  // JJ management fee — deducted from rent
  'Management Fee',
  // Property operating costs paid by JJ on owner's behalf
  'Cleaning', 'Water', 'Electricity bill', 'Electricity',
  'Electrical Appliances', 'Furniture', 'Repairs', 'Repair',
  'Key Duplication', 'HOA', 'Plumber', 'Curtains', 'Pool Service',
  'Minor Renovation', 'Workers', 'Design', 'Consumable Supplies',
  'Insurance', 'Kitchen', 'Materials', 'Bazaraki',
])

/**
 * Airbnb (Short-Term Rental) expense subcategories that reduce the owner's credit.
 * Rule (approved 2026-07-09): Real expenses paid outside the Airbnb/Hostaway platform
 * reduce the owner's settlement balance.
 *
 * IMPORTANT — platform tracking split (OQ-01, enforced at SQL layer):
 *   'Management Fee' and 'Cleaning' appear here, but they are only reached when
 *   is_platform_tracking = FALSE (payer ≠ Airbnb). When payer = Airbnb, the
 *   is_platform_tracking guard in classifyAirbnbRow fires first and returns info/0.
 *   This guarantees platform-deducted amounts are never double-counted.
 *
 * 'Design Fee' and 'Guest Service Expenses': payer = Owner/Client, payee = JJ.
 *   Owner pays JJ for a service → reduces what JJ owes the owner.
 *   Same balance direction as other expenses (-client_amount).
 *
 * 'Corrections' and 'Other' are intentionally excluded — stay as Needs Review.
 */
const AIRBNB_EXPENSE_SUBS = new Set([
  // Platform subcategories — reached only when is_platform_tracking = FALSE (non-Airbnb payer)
  'Management Fee', 'Cleaning',
  // Owner-pays-JJ services (reduce owner credit)
  'Design Fee', 'Guest Service Expenses',
  // Property operating costs
  'Internet', 'Consumable Supplies', 'Electricity bill', 'Electricity',
  'Design', 'Airbnb Equipment', 'Electrical Appliances',
  'Water', 'Pool Service', 'Bedding/Pillows/Blankets', 'Photography',
  'Guest Supplies', 'HOA', 'Software/Hostaway', 'Plumber',
  'Property insurance', 'Wine', 'Kitchen Supply', 'Repairs', 'Repair',
  'Furniture', 'Key Duplication', 'Contractors', 'Curtains', 'Lighting',
  'Workers', 'Insurance', 'Minor Renovation', 'Materials',
  'Airbnb Tax Fee', 'Sweets', 'Laundry',
])

// ─── Row type ────────────────────────────────────────────────────────────────

type RowClassification = Pick<
  RC3AccountRow,
  'balance_effect' | 'is_balance_affecting' | 'display_group' | 'display_label'
>

// ─── Per-account classifiers ──────────────────────────────────────────────────

/**
 * RENTAL (Management category) row classifier.
 * Convention: positive = JJ owes owner (owner_credit)
 *
 * Increases balance (income): Tenant Payment, Client Payment
 * Decreases balance (expense): all operating expenses, Management Fee, BPO
 * Trust rows: Deposit, Deposit Refund — balance_effect = 0
 */
function classifyRentalRow(row: RC3Row): RowClassification {
  const sub = row.subcategory ?? ''

  // Reference rows (Renovation Contract etc. shouldn't appear here, but guard anyway)
  if (row.is_contract_value) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        sub,
    }
  }

  // Trust rows — real cash but separate trust ledger
  if (TRUST_SUBS.has(sub)) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'info',
      display_label:        `${sub} (Trust Account)`,
    }
  }

  // BPO — money sent to owner; decreases what JJ owes
  if (row.is_bpo) {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'payment_out',
      display_label:        'Payment Sent to You',
    }
  }

  // Income — increases owner credit
  if (sub === 'Tenant Payment') {
    return {
      balance_effect:       row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Rent Collected',
    }
  }
  if (sub === 'Client Payment') {
    return {
      balance_effect:       row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Client Payment',
    }
  }

  // Property expenses — reduce what JJ owes the owner.
  // Includes Management Fee (JJ's monthly deduction from rent) and all operating costs.
  // Rule (approved 2026-07-09): long-term rental expenses always affect owner balance.
  if (RENTAL_EXPENSE_SUBS.has(sub)) {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'expense',
      display_label:        sub,
    }
  }

  // Unknown subcategory — do not affect balance; flag for review.
  return {
    balance_effect:       0,
    is_balance_affecting: false,
    display_group:        'info',
    display_label:        `${sub || 'Unknown'} (Needs Review)`,
  }
}

/**
 * AIRBNB row classifier.
 * Convention: positive = JJ owes owner (owner_credit)
 */
function classifyAirbnbRow(row: RC3Row): RowClassification {
  const sub = row.subcategory ?? ''

  // Reference rows
  if (row.is_contract_value) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        sub,
    }
  }

  // Platform tracking rows — payer=Airbnb, already deducted from Platform Income
  if (row.is_platform_tracking) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'info',
      display_label:        `${sub} (in Platform Income)`,
    }
  }

  // BPO — money sent to owner
  if (row.is_bpo) {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'payment_out',
      display_label:        'Payment Sent to You',
    }
  }

  // Income — increases owner credit
  if (sub === 'Platform Income') {
    return {
      balance_effect:       row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Platform Income (Net to You)',
    }
  }
  if (sub === 'Client Payment') {
    return {
      balance_effect:       row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Client Payment',
    }
  }

  // Real expenses — reduce what JJ owes the owner.
  if (AIRBNB_EXPENSE_SUBS.has(sub)) {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'expense',
      display_label:        sub,
    }
  }

  // Unknown subcategory — do not affect balance; flag for review.
  return {
    balance_effect:       0,
    is_balance_affecting: false,
    display_group:        'info',
    display_label:        `${sub || 'Unknown'} (Needs Review)`,
  }
}

/**
 * SALE (Property Purchase) row classifier.
 * Convention: positive = client owes JJ (client_debt)
 *
 * NOTE: The contract value (Sale Contract) is NOT in the balance_effect here.
 * It is extracted separately as contract_baseline in buildAccountSection.
 *
 * Client Payment, Third-Party Payment: decrease debt (credits, negative balance_effect)
 * Client Sale Expenses, Sale Tax: increase debt (positive balance_effect)
 * Broker Fee: internal — balance_effect = 0
 * Sale Contract: is_contract_value = TRUE — balance_effect = 0 (baseline handled separately)
 */
function classifySaleRow(row: RC3Row): RowClassification {
  const sub = row.subcategory ?? ''

  // Contract reference — shown in Section A; value used as contract_baseline (see buildAccountSection)
  if (row.is_contract_value) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        'Sale Contract (Reference)',
    }
  }

  // Internal — hidden from client balance
  if (SALE_INTERNAL_SUBS.has(sub)) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        `${sub} (Internal)`,
    }
  }

  // Credits — reduce what client owes
  if (sub === 'Client Payment') {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Payment Received',
    }
  }
  if (sub === 'Third-Party Payment') {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Third-Party Payment (Bank Transfer to Seller)',
    }
  }

  // Client Sale Expenses / Sale Tax — real costs billed to the client.
  if (sub === 'Client Sale Expenses' || sub === 'Sale Tax') {
    return {
      balance_effect:       row.client_amount,
      is_balance_affecting: true,
      display_group:        'expense',
      display_label:        sub,
    }
  }

  // Unknown subcategory — do not affect balance; flag for review.
  return {
    balance_effect:       0,
    is_balance_affecting: false,
    display_group:        'info',
    display_label:        `${sub || 'Unknown'} (Needs Review)`,
  }
}

/**
 * RENOVATION row classifier.
 * Convention: positive = client owes JJ (client_debt)
 *
 * NOTE: The contract value (Renovation Contract) is NOT in the balance_effect here.
 * It is extracted separately as contract_baseline in buildAccountSection.
 *
 *   Client Payment: reduces client debt (negative balance_effect)
 *   Extras: additional work beyond contract scope, billed to client (positive balance_effect)
 *   All other expense rows: internal cost tracking (balance_effect = 0)
 */
function classifyRenovationRow(row: RC3Row): RowClassification {
  const sub = row.subcategory ?? ''

  // Contract reference — shown in Section A; value used as contract_baseline (see buildAccountSection)
  if (row.is_contract_value) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        'Renovation Contract (Reference)',
    }
  }

  // Credit — client payment reduces what client owes
  if (sub === 'Client Payment') {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Payment Received',
    }
  }

  // Extras — additional work beyond contract, billed to client
  if (sub === 'Extras') {
    return {
      balance_effect:       row.client_amount,
      is_balance_affecting: true,
      display_group:        'expense',
      display_label:        'Extras (Additional Work)',
    }
  }

  // Known internal cost-tracking subcategories
  if (RENOVATION_INTERNAL_SUBS.has(sub)) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'info',
      display_label:        `${sub} (Cost Tracking)`,
    }
  }

  // Unknown subcategory — do not affect balance; flag for review.
  return {
    balance_effect:       0,
    is_balance_affecting: false,
    display_group:        'info',
    display_label:        `${sub || 'Unknown'} (Needs Review)`,
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function classifyRow(row: RC3Row, accountType: RC3AccountType): RowClassification {
  switch (accountType) {
    case 'rental':     return classifyRentalRow(row)
    case 'airbnb':     return classifyAirbnbRow(row)
    case 'sale':       return classifySaleRow(row)
    case 'renovation': return classifyRenovationRow(row)
  }
}

// ─── Account metadata ─────────────────────────────────────────────────────────

const ACCOUNT_META: Record<RC3AccountType, {
  en: string
  he: string
  convention: BalanceConvention
}> = {
  sale:       { en: 'Property Purchase', he: 'רכישת נכס',   convention: 'client_debt'  },
  renovation: { en: 'Renovation',        he: 'שיפוץ',        convention: 'client_debt'  },
  rental:     { en: 'Rental Management', he: 'ניהול השכרה', convention: 'owner_credit' },
  airbnb:     { en: 'Short-Term Rental', he: 'אירבנב / STR', convention: 'owner_credit' },
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enrich raw RC3 rows with balance_effect, display_group, and display_label.
 * Rows are sorted by date ascending (view already orders them, this is a safety sort).
 */
export function enrichRows(rows: RC3Row[], accountType: RC3AccountType): RC3AccountRow[] {
  return [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(row => ({ ...row, ...classifyRow(row, accountType) }))
}

/**
 * Build a complete RC3AccountSection from raw rows.
 * openingBalance defaults to 0 (Task 5 — contact_opening_balances — is not yet implemented).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Contract Baseline Rule (approved Yossi 2026-07-09)
 * ────────────────────────────────────────────────────────────────────────────
 * For Sale and Renovation accounts the contract value is the CLIENT'S DEBT BASELINE.
 * The contract row stays in Section A (display_group='reference', balance_effect=0 for
 * row display), but its client_amount is extracted here and added to closing_balance.
 *
 *   Sale:       Contract + Sale Expenses − Client Payments − Third-Party Payments = Balance
 *   Renovation: Contract + Extras − Client Payments = Balance
 *   Rental:     No contract baseline (P&L account)
 *   Airbnb:     No contract baseline (P&L account)
 *
 * Example — Liron & Alon:
 *   200,000 + 4,765 − 70,765 − 134,000 = 0
 */
export function buildAccountSection(
  accountType:    RC3AccountType,
  rawRows:        RC3Row[],
  openingBalance: number = 0,
): RC3AccountSection {
  const meta = ACCOUNT_META[accountType]
  const rows = enrichRows(rawRows, accountType)

  const balanceRows = rows.filter(r => r.is_balance_affecting)

  // Contract baseline: sum of all reference (is_contract_value) rows' client_amount.
  // Applied to sale and renovation only — the contract value is what the client owes.
  // For rental / airbnb this is always 0.
  const contract_baseline =
    accountType === 'sale' || accountType === 'renovation'
      ? rows
          .filter(r => r.is_contract_value)
          .reduce((sum, r) => sum + r.client_amount, 0)
      : 0

  const total_income = balanceRows
    .filter(r => r.balance_effect > 0)
    .reduce((sum, r) => sum + r.balance_effect, 0)

  const total_expenses = balanceRows
    .filter(r => r.balance_effect < 0 && !r.is_bpo)
    .reduce((sum, r) => sum + Math.abs(r.balance_effect), 0)

  const total_bpo = balanceRows
    .filter(r => r.is_bpo)
    .reduce((sum, r) => sum + Math.abs(r.balance_effect), 0)

  const closing_balance =
    openingBalance + contract_baseline + balanceRows.reduce((sum, r) => sum + r.balance_effect, 0)

  return {
    account_type:       accountType,
    account_label:      meta.en,
    account_label_he:   meta.he,
    balance_convention: meta.convention,
    opening_balance:    openingBalance,
    contract_baseline,
    rows,
    total_income,
    total_expenses,
    total_bpo,
    closing_balance,
  }
}
