/**
 * JJ Property 10 — Client-Safe Report DTO
 * Server-boundary repair (post PR #184) — 2026-08-23
 *
 * Explicit client-safe allowlist for the /client-report-rc3 screen. The raw
 * RC3PropertyReport / RC3AccountRow objects carry JJ-internal fields
 * (amount_eur = internal cost, client_charge, description, payer, payee, notes,
 * k_note, platform/audit flags). Those MUST NEVER cross into the browser.
 *
 * `toClientReport` is the single authorized boundary that converts a raw RC3
 * report (fetched server-side) into this allowlisted DTO. Anything not listed
 * here is dropped and never serialized to the client.
 *
 * This DTO carries ONLY the fields the on-screen renderer and the aggregate
 * helpers already read (verified by the client-display whitelist gate):
 *   - report meta (name, dates, generated_at, has_* flags)
 *   - per-account aggregates + labels
 *   - per-row: id, date, subcategory, client_amount, display grouping, and the
 *     balance-classification fields (balance_effect, is_balance_affecting,
 *     is_contract_value, is_bpo) needed to group/label rows for display.
 *
 * Excluded (never present at runtime): amount_eur, client_charge, description,
 * payer, payee, notes, k_note, category, is_platform_tracking, review_status,
 * property_name, created_at, updated_at.
 */
import type {
  RC3PropertyReport,
  RC3AccountSection,
  RC3AccountRow,
  RC3AccountType,
  BalanceConvention,
  DisplayGroup,
} from './types'
import { filterOwnerFacingSections } from './executiveSummary'

/** Fields in a raw RC3 row that must never reach the browser. */
export const CLIENT_REPORT_FORBIDDEN_ROW_FIELDS = [
  'amount_eur',
  'client_charge',
  'description',
  'payer',
  'payee',
  'notes',
  'k_note',
  'category',
  'is_platform_tracking',
  'review_status',
  'property_name',
  'created_at',
  'updated_at',
] as const

/** Client-safe transaction row (explicit allowlist). */
export interface ClientReportRow {
  id:                   string
  date:                 string
  reporting_name:       string | null
  subcategory:          string | null
  client_amount:        number
  account_type:         string
  is_contract_value:    boolean
  is_bpo:               boolean
  balance_effect:       number
  is_balance_affecting: boolean
  display_group:        DisplayGroup
  display_label:        string
}

/** Client-safe account section (aggregates + client-safe rows). */
export interface ClientReportSection {
  account_type:        RC3AccountType
  account_label:       string
  account_label_he:    string
  balance_convention:  BalanceConvention
  opening_balance:     number
  rows:                ClientReportRow[]
  contract_baseline:   number
  total_income:        number
  total_expenses:      number
  total_bpo:           number
  closing_balance:     number
}

/** Client-safe property report DTO returned to the browser. */
export interface ClientReport {
  reporting_name: string
  from_date:      string | null
  to_date:        string | null
  generated_at:   string
  accounts:       ClientReportSection[]
  has_purchase:   boolean
  has_sale:       boolean
  has_renovation: boolean
  has_rental:     boolean
  has_airbnb:     boolean
}

/** Client-facing wording for Sale / Third-Party Payment (P3b). DB/server unchanged. */
const CLIENT_SAFE_PROPERTY_PURCHASE_PAYMENT = 'Payment toward property purchase'

function toClientReportRow(row: RC3AccountRow): ClientReportRow {
  // Explicit allowlist copy — forbidden raw fields are structurally never read.
  // P3b: Sale / Third-Party Payment must not serialize internal terminology
  // ("Third-Party Payment", "Seller", bank-routing) into the browser DTO.
  const isSaleThirdParty =
    row.account_type === 'sale' && row.subcategory === 'Third-Party Payment'

  return {
    id:                   row.id,
    date:                 row.date,
    reporting_name:       row.reporting_name,
    subcategory:          isSaleThirdParty ? CLIENT_SAFE_PROPERTY_PURCHASE_PAYMENT : (row.subcategory ?? null),
    client_amount:        row.client_amount,
    account_type:         row.account_type,
    is_contract_value:    row.is_contract_value,
    is_bpo:               row.is_bpo,
    balance_effect:       row.balance_effect,
    is_balance_affecting: row.is_balance_affecting,
    display_group:        row.display_group,
    display_label:        isSaleThirdParty ? CLIENT_SAFE_PROPERTY_PURCHASE_PAYMENT : row.display_label,
  }
}

function toClientReportSection(section: RC3AccountSection): ClientReportSection {
  return {
    account_type:       section.account_type,
    account_label:      section.account_label,
    account_label_he:   section.account_label_he,
    balance_convention: section.balance_convention,
    opening_balance:    section.opening_balance,
    rows:               section.rows.map(toClientReportRow),
    contract_baseline:  section.contract_baseline,
    total_income:       section.total_income,
    total_expenses:     section.total_expenses,
    total_bpo:          section.total_bpo,
    closing_balance:    section.closing_balance,
  }
}

/**
 * Single authorized boundary: raw RC3 report (server-side) → client-safe DTO.
 * Never returns the raw report; every field is explicitly allowlisted above.
 *
 * P1 Purchase Confidentiality: internal Purchase (account_type = 'purchase')
 * is JJ acquisition cost and MUST NEVER be serialized to the browser.
 * filterOwnerFacingSections strips it before DTO conversion. has_purchase
 * is always false in the client DTO — the client has no reason to know
 * Purchase data exists. Sale (displayed as "Property Purchase") is retained.
 */
export function toClientReport(report: RC3PropertyReport): ClientReport {
  const clientAccounts = filterOwnerFacingSections(report.accounts)
  return {
    reporting_name: report.reporting_name,
    from_date:      report.from_date,
    to_date:        report.to_date,
    generated_at:   report.generated_at,
    accounts:       clientAccounts.map(toClientReportSection),
    has_purchase:   false,
    has_sale:       clientAccounts.some(a => a.account_type === 'sale'),
    has_renovation: clientAccounts.some(a => a.account_type === 'renovation'),
    has_rental:     clientAccounts.some(a => a.account_type === 'rental'),
    has_airbnb:     clientAccounts.some(a => a.account_type === 'airbnb'),
  }
}
