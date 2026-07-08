/**
 * JJ Property 10 â RC3 Balance Engine
 * Phase 3 â 2026-07-09
 *
 * Implements the business rules from docs/HISTORICAL_BUSINESS_RULES_V1.md.
 * This file must remain in sync with that document â update both together.
 *
 * ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 * Balance conventions
 * ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 *   rental / airbnb : positive closing_balance = JJ owes owner  (owner_credit)
 *   sale / renovation : positive closing_balance = client owes JJ (client_debt)
 *
 * ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 * Key rules (see HISTORICAL_BUSINESS_RULES_V1.md for full rationale)
 * ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 *   is_contract_value = TRUE  â balance_effect = 0  (reference row)
 *   is_platform_tracking = TRUE â balance_effect = 0  (payer=Airbnb; already in Platform Income)
 *   is_bpo = TRUE             â balance_effect = -client_amount (payment sent to owner)
 *
 *   Renovation: ONLY Extras (+) and Client Payment (-) affect balance.
 *               All other expense rows are internal cost tracking (balance_effect = 0).
 *
 *   Sale: Broker Fee is an internal JJ cost â hidden from client report (balance_effect = 0).
 *
 *   Deposit / Deposit Refund (Management): trust account rows â balance_effect = 0
 *     (separate trust register, not part of P&L balance).
 *
 *   Airbnb Cleaning + Management Fee with payer â  Airbnb:
 *     is_platform_tracking = FALSE after OQ-01 fix â treated as real expense (balance_effect = -client_amount).
 */

import type {
  RC3Row,
  RC3AccountRow,
  RC3AccountSection,
  RC3AccountType,
  BalanceConvention,
  DisplayGroup,
} from './types'

// âââ Sets of subcategory names ââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Renovation expense subcategories that are INTERNAL cost tracking.
 * These appear in the transaction list for internal analysis but do NOT
 * affect the client-facing balance.
 * Rule: Â§3.2 â "The renovation account is based on the contract value."
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
 * Sale subcategories that are INTERNAL to JJ â hidden from client balance.
 * Rule: Â§4.9 â Broker Fee is paid by JJ from JJ funds; not client's cost.
 */
const SALE_INTERNAL_SUBS = new Set(['Broker Fee'])

/**
 * Management subcategories that are TRUST ACCOUNT rows.
 * Rule: Â§4.8 â Deposit/Deposit Refund are real cash but held in trust.
 * Not part of P&L balance â shown separately in trust register.
 */
const TRUST_SUBS = new Set(['Deposit', 'Deposit refund'])

// âââ Row type ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

type RowClassification = Pick<
  RC3AccountRow,
  'balance_effect' | 'is_balance_affecting' | 'display_group' | 'display_label'
>

// âââ Per-account classifiers ââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * RENTAL (Management category) row classifier.
 * Convention: positive = JJ owes owner (owner_credit)
 *
 * Increases balance (income): Tenant Payment, Client Payment
 * Decreases balance (expense): all operating expenses, Management Fee, BPO
 * Trust rows: Deposit, Deposit Refund â balance_effect = 0
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

  // Trust rows â real cash but separate trust ledger
  if (TRUST_SUBS.has(sub)) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'info',
      display_label:        `${sub} (Trust Account)`,
    }
  }

  // BPO â money sent to owner; decreases what JJ owes
  if (row.is_bpo) {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'payment_out',
      display_label:        'Payment Sent to You',
    }
  }

  // Income â increases owner credit
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

  // All other rows are expenses paid by JJ on owner's behalf â decrease owner credit
  return {
    balance_effect:       -row.client_amount,
    is_balance_affecting: true,
    display_group:        'expense',
    display_label:        sub || 'Expense',
  }
}

/**
 * AIRBNB row classifier.
 * Convention: positive = JJ owes owner (owner_credit)
 *
 * is_platform_tracking = TRUE (payer=Airbnb): already netted from Platform Income â 0
 * is_platform_tracking = FALSE (payerâ Airbnb): real expense â -client_amount
 * This is the OQ-01 fix applied at the view layer.
 *
 * Design Fee and Guest Service Expenses: owner pays JJ for services.
 * They reduce what JJ owes the owner (payer=Owner, payee=JJ â income to JJ).
 * balance_effect = -client_amount (same direction as other expenses).
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

  // Platform tracking rows â payer=Airbnb, already deducted from Platform Income
  if (row.is_platform_tracking) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'info',
      display_label:        `${sub} (in Platform Income)`,
    }
  }

  // BPO â money sent to owner
  if (row.is_bpo) {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'payment_out',
      display_label:        'Payment Sent to You',
    }
  }

  // Income â increases owner credit
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

  // All other non-tracking rows decrease owner credit:
  //   - Operating expenses (JJ paid for property)
  //   - Management Fee / Cleaning where payer â  Airbnb (real expense)
  //   - Design Fee, Guest Service Expenses (JJ services billed to owner)
  return {
    balance_effect:       -row.client_amount,
    is_balance_affecting: true,
    display_group:        'expense',
    display_label:        sub || 'Expense',
  }
}

/**
 * SALE (Property Purchase) row classifier.
 * Convention: positive = client owes JJ (client_debt)
 *
 * Client Payment, Third-Party Payment: decrease debt (credits)
 * Client Sale Expenses, Sale Tax: increase debt
 * Broker Fee: internal â balance_effect = 0
 * Sale Contract: is_contract_value = TRUE â balance_effect = 0
 *
 * Third-Party Payment rule: money went bankâseller, JJ only recorded it.
 * Still reduces client's purchase price owed â credit against client debt.
 * (Rule: Â§4.11)
 */
function classifySaleRow(row: RC3Row): RowClassification {
  const sub = row.subcategory ?? ''

  // Contract reference
  if (row.is_contract_value) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        'Sale Contract (Reference)',
    }
  }

  // Internal â hidden from client balance
  if (SALE_INTERNAL_SUBS.has(sub)) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        `${sub} (Internal)`,
    }
  }

  // Credits â reduce what client owes
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
      // Note: no cash received by JJ â bank paid seller directly.
      // Label distinguishes from direct client payments.
      display_label:        'Third-Party Payment (Bank Transfer to Seller)',
    }
  }

  // Debits â increase what client owes
  // Client Sale Expenses, Sale Tax, and any other Sale subcategory
  return {
    balance_effect:       row.client_amount,
    is_balance_affecting: true,
    display_group:        'expense',
    display_label:        sub || 'Expense',
  }
}

/**
 * RENOVATION row classifier.
 * Convention: positive = client owes JJ (client_debt)
 *
 * The renovation account is contract-based, not line-item-based (Â§3.2 / Â§4.3):
 *   - Renovation Contract: reference only (is_contract_value = TRUE)
 *   - Client Payment: reduces client debt
 *   - Extras: additional work beyond contract scope, billed to client at client_charge
 *   - Materials / Contractors / Workers / all other expense rows: internal cost tracking
 *     (balance_effect = 0, shown as informational rows)
 */
function classifyRenovationRow(row: RC3Row): RowClassification {
  const sub = row.subcategory ?? ''

  // Contract reference
  if (row.is_contract_value) {
    return {
      balance_effect:       0,
      is_balance_affecting: false,
      display_group:        'reference',
      display_label:        'Renovation Contract (Reference)',
    }
  }

  // Credit â client payment reduces what client owes
  if (sub === 'Client Payment') {
    return {
      balance_effect:       -row.client_amount,
      is_balance_affecting: true,
      display_group:        'income',
      display_label:        'Payment Received',
    }
  }

  // Extras â additional work beyond contract, billed to client
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

  // Unknown subcategory â treat as internal until confirmed
  // (safer to exclude from balance than to silently add to client debt)
  return {
    balance_effect:       0,
    is_balance_affecting: false,
    display_group:        'info',
    display_label:        `${sub} (Unclassified)`,
  }
}

// âââ Dispatcher âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function classifyRow(row: RC3Row, accountType: RC3AccountType): RowClassification {
  switch (accountType) {
    case 'rental':     return classifyRentalRow(row)
    case 'airbnb':     return classifyAirbnbRow(row)
    case 'sale':       return classifySaleRow(row)
    case 'renovation': return classifyRenovationRow(row)
  }
}

// âââ Account metadata âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const ACCOUNT_META: Record<RC3AccountType, {
  en: string
  he: string
  convention: BalanceConvention
}> = {
  sale:       { en: 'Property Purchase', he: '×¨×××©×ª × ××¡',   convention: 'client_debt'  },
  renovation: { en: 'Renovation',        he: '×©××¤××¥',        convention: 'client_debt'  },
  rental:     { en: 'Rental Management', he: '× ×××× ××©××¨×', convention: 'owner_credit' },
  airbnb:     { en: 'Short-Term Rental', he: '×××¨×× × / STR', convention: 'owner_credit' },
}

// âââ Public API âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
 * openingBalance defaults to 0 (Task 5 â contact_opening_balances â is not yet implemented).
 */
export function buildAccountSection(
  accountType:    RC3AccountType,
  rawRows:        RC3Row[],
  openingBalance: number = 0,
): RC3AccountSection {
  const meta = ACCOUNT_META[accountType]
  const rows = enrichRows(rawRows, accountType)

  const balanceRows = rows.filter(r => r.is_balance_affecting)

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
    openingBalance + balanceRows.reduce((sum, r) => sum + r.balance_effect, 0)

  return {
    account_type:       accountType,
    account_label:      meta.en,
    account_label_he:   meta.he,
    balance_convention: meta.convention,
    opening_balance:    openingBalance,
    rows,
    total_income,
    total_expenses,
    total_bpo,
    closing_balance,
  }
}
