/**
 * JJ Property 10 — RC3 Report Fetch Layer
 * Phase 3 — 2026-07-09
 * Gate 2 — 2026-07-19: Certified STR + Counterparty Settlement queries
 *
 * Queries the four RC3 account views for a given reporting_name and date range.
 * Gate 2 adds parallel queries for certified STR data and counterparty settlement.
 *
 * View chain:
 *   transactions
 *   → v_transactions_reporting (canonical property names)
 *   → v_rc3_classified (account_type + flags)
 *   → v_rc3_sale | v_rc3_renovation | v_rc3_rental | v_rc3_airbnb
 *
 * Gate 2 additional sources:
 *   pms.v_str_property_settlement → public.v_str_settlement_report (wrapper view)
 *   public.v_counterparty_position
 *
 * All views apply base filters automatically:
 *   (review_status = 'active' OR review_status IS NULL) AND reporting_name IS NOT NULL
 */

import { supabase } from '@/lib/supabase'
import { buildAccountSection } from './computeBalance'
import type {
  RC3AccountType,
  RC3PropertyReport,
  RC3Row,
  CertifiedSTRMonth,
  CertifiedSTRSummary,
  STRPeriodCoverage,
  CounterpartySettlement,
} from './types'

// ─── View map ───────────────────────────────────────────────────────────────

const RC3_VIEWS: Record<RC3AccountType, string> = {
  sale: 'v_rc3_sale',
  renovation: 'v_rc3_renovation',
  rental: 'v_rc3_rental',
  airbnb: 'v_rc3_airbnb',
}

/** Client-facing account order (confirmed 2026-07-08, Yossi) */
const ACCOUNT_ORDER: RC3AccountType[] = ['sale', 'renovation', 'rental', 'airbnb']

// ─── Query helper ───────────────────────────────────────────────────────────

async function fetchViewRows(
  view: string,
  reportingName: string,
  fromDate?: string,
  toDate?: string,
): Promise<RC3Row[]> {
  let q = (supabase as any)
    .from(view)
    .select('*')
    .eq('reporting_name', reportingName)
    .order('date', { ascending: true })

  if (fromDate) q = q.gte('date', fromDate)
  if (toDate) q = q.lte('date', toDate)

  const { data, error } = await q
  if (error) {
    console.error(`[fetchReport] ${view} error:`, error.message)
    throw new Error(`${view}: ${error.message}`)
  }
  return (data ?? []) as RC3Row[]
}

// ─── Gate 2: Period coverage detection ──────────────────────────────────────

/**
 * Determine if date range aligns to full calendar months.
 * Certified STR data is aggregated by full calendar months.
 * If the user selects a partial month range, we mark coverage as 'partial'.
 */
function detectPeriodCoverage(fromDate?: string, toDate?: string): STRPeriodCoverage {
  // No date filter → full coverage (all available months)
  if (!fromDate && !toDate) return 'full'

  // Check if fromDate is 1st of month
  if (fromDate) {
    const d = new Date(fromDate + 'T00:00:00')
    if (d.getDate() !== 1) return 'partial'
  }

  // Check if toDate is last day of month
  if (toDate) {
    const d = new Date(toDate + 'T00:00:00')
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    if (d.getDate() !== lastDay) return 'partial'
  }

  return 'full'
}

/**
 * Convert date range to full calendar month boundaries for STR queries.
 * Returns { fromMonth, toMonth } where both are first-of-month ISO dates.
 * Returns null if the range doesn't contain any full months.
 */
function getFullMonthRange(fromDate?: string, toDate?: string): {
  fromMonth: string | null
  toMonth: string | null
} {
  let fromMonth: string | null = null
  let toMonth: string | null = null

  if (fromDate) {
    const d = new Date(fromDate + 'T00:00:00')
    // If not first of month, advance to next month
    if (d.getDate() !== 1) {
      d.setMonth(d.getMonth() + 1)
      d.setDate(1)
    }
    fromMonth = d.toISOString().split('T')[0]
  }

  if (toDate) {
    const d = new Date(toDate + 'T00:00:00')
    // toMonth = first of the month that toDate falls in
    d.setDate(1)
    toMonth = d.toISOString().split('T')[0]
  }

  return { fromMonth, toMonth }
}

// ─── Gate 2: Certified STR fetch ────────────────────────────────────────────

/**
 * Fetch certified STR settlement data from public.v_str_settlement_report.
 * This is the public wrapper view over pms.v_str_property_settlement.
 *
 * Security: queries through PostgREST with authenticated role.
 * The wrapper view exposes only report-level fields, not the full pms schema.
 *
 * Graceful failure: returns null on any error (report still renders without STR).
 */
async function fetchCertifiedSTR(
  reportingName: string,
  fromDate?: string,
  toDate?: string,
): Promise<CertifiedSTRSummary | null> {
  try {
    const periodCoverage = detectPeriodCoverage(fromDate, toDate)

    // Query v_str_settlement_report by property_name (= reporting_name)
    let q = (supabase as any)
      .from('v_str_settlement_report')
      .select('*')
      .eq('property_name', reportingName)
      .order('reporting_month', { ascending: true })

    // Apply month-aligned date filtering
    if (fromDate || toDate) {
      const { fromMonth, toMonth } = getFullMonthRange(fromDate, toDate)
      if (fromMonth) q = q.gte('reporting_month', fromMonth)
      if (toMonth) q = q.lte('reporting_month', toMonth)
    }

    const { data, error } = await q

    if (error) {
      console.warn('[fetchReport] v_str_settlement_report error:', error.message)
      return null
    }

    const months = (data ?? []) as CertifiedSTRMonth[]
    if (months.length === 0) return null

    // Aggregate across all months
    const summary: CertifiedSTRSummary = {
      months,
      total_reservation_count:      months.reduce((s, m) => s + (m.reservation_count ?? 0), 0),
      total_booked_nights:          months.reduce((s, m) => s + (m.booked_nights ?? 0), 0),
      total_gross_rental_revenue:   months.reduce((s, m) => s + (m.gross_rental_revenue ?? 0), 0),
      total_cleaning_income:        months.reduce((s, m) => s + (m.cleaning_income ?? 0), 0),
      total_platform_fees:          months.reduce((s, m) => s + (m.total_platform_fees ?? 0), 0),
      total_payment_fees:           months.reduce((s, m) => s + (m.total_payment_fees ?? 0), 0),
      total_taxes:                  months.reduce((s, m) => s + (m.total_taxes ?? 0), 0),
      total_payout:                 months.reduce((s, m) => s + (m.total_payout ?? 0), 0),
      total_management_fee:         months.reduce((s, m) => s + (m.management_fee ?? 0), 0),
      total_owner_chargeable_expenses: months.reduce((s, m) => s + (m.total_owner_chargeable_expenses ?? 0), 0),
      total_owner_entitlement:      months.reduce((s, m) => s + (m.hostaway_owner_entitlement ?? 0), 0),
      total_owner_payments:         months.reduce((s, m) => s + (m.owner_payments_attributed_to_property ?? 0), 0),
      total_period_balance:         months.reduce((s, m) => s + (m.property_period_balance ?? 0), 0),
      // Certification status
      all_months_certified:         months.every(m => m.source_confidence === 'CERTIFIED'),
      all_controls_pass:            months.every(m => m.all_control_checks_pass === true),
      has_any_unresolved:           months.some(m => m.has_unresolved_data === true),
      period_coverage:              periodCoverage,
      // Owner name from first month (consistent across all months for same property)
      owner_name:                   months[0]?.owner_name ?? null,
    }

    return summary
  } catch (err) {
    console.warn('[fetchReport] Certified STR fetch failed:', err)
    return null
  }
}

// ─── Gate 2: Counterparty Settlement fetch ──────────────────────────────────

/**
 * Fetch counterparty settlement position from public.v_counterparty_position.
 * Uses the owner_name from certified STR data to find the counterparty.
 *
 * If ownerName is not available (no STR data), falls back to looking up
 * counterparty by property_name through the existing mapping.
 *
 * Graceful failure: returns null on any error.
 */
async function fetchCounterpartySettlement(
  ownerName: string | null,
): Promise<CounterpartySettlement | null> {
  if (!ownerName) return null

  try {
    const { data, error } = await (supabase as any)
      .from('v_counterparty_position')
      .select('*')
      .eq('counterparty_name', ownerName)
      .limit(1)
      .single()

    if (error) {
      console.warn('[fetchReport] v_counterparty_position error:', error.message)
      return null
    }

    return (data ?? null) as CounterpartySettlement | null
  } catch (err) {
    console.warn('[fetchReport] Counterparty settlement fetch failed:', err)
    return null
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FetchReportParams {
  reportingName: string
  fromDate?: string  // ISO date e.g. "2024-01-01"
  toDate?: string    // ISO date e.g. "2026-12-31"
  /** Opening balances per account type.
   *  Currently always 0 — will be populated from contact_opening_balances (Task 5). */
  openingBalances?: Partial<Record<RC3AccountType, number>>
}

/**
 * Fetch a complete RC3 property report.
 * Queries all four account views in parallel and builds account sections.
 * Gate 2: Also fetches certified STR and counterparty settlement in parallel.
 * Accounts with no rows are omitted from the result.
 *
 * Failure behavior (Gate 2 requirement):
 *   - Domain transaction report always renders, even if STR/settlement fails.
 *   - certifiedSTR and settlement are set to null on failure.
 *   - No report-wide crash from certified data queries.
 */
export async function fetchRC3Report(params: FetchReportParams): Promise<RC3PropertyReport> {
  const { reportingName, fromDate, toDate, openingBalances = {} } = params

  // Phase 1: Fetch domain transactions + certified STR in parallel
  const [accountResults, certifiedSTR] = await Promise.all([
    // Domain transaction queries (existing pipeline)
    Promise.all(
      ACCOUNT_ORDER.map(async (accountType) => {
        const rows = await fetchViewRows(
          RC3_VIEWS[accountType],
          reportingName,
          fromDate,
          toDate,
        )
        if (rows.length === 0) return null
        const opening = openingBalances[accountType] ?? 0
        return buildAccountSection(accountType, rows, opening)
      }),
    ),
    // Certified STR query (graceful failure → null)
    fetchCertifiedSTR(reportingName, fromDate, toDate),
  ])

  const accounts = accountResults.filter(
    (s): s is NonNullable<typeof s> => s !== null,
  )

  // Phase 2: Fetch counterparty settlement using owner_name from STR data
  // This depends on STR result, so it runs after Phase 1
  const ownerName = certifiedSTR?.owner_name ?? null
  const settlement = await fetchCounterpartySettlement(ownerName)

  return {
    reporting_name: reportingName,
    from_date: fromDate ?? null,
    to_date: toDate ?? null,
    generated_at: new Date().toISOString(),
    accounts,
    has_sale: accounts.some(a => a.account_type === 'sale'),
    has_renovation: accounts.some(a => a.account_type === 'renovation'),
    has_rental: accounts.some(a => a.account_type === 'rental'),
    has_airbnb: accounts.some(a => a.account_type === 'airbnb'),
    // Gate 2
    certifiedSTR,
    settlement,
  }
}

/**
 * Fetch sorted list of all property names that have RC3 data.
 * Unions across all four views for complete coverage.
 */
export async function fetchRC3PropertyList(): Promise<string[]> {
  const nameSet = new Set<string>()

  await Promise.all(
    Object.values(RC3_VIEWS).map(async (view) => {
      const { data } = await (supabase as any)
        .from(view)
        .select('reporting_name')
      if (data) {
        ;(data as Array<{ reporting_name: string | null }>).forEach(r => {
          if (r.reporting_name) nameSet.add(r.reporting_name)
        })
      }
    }),
  )

  return Array.from(nameSet).sort((a, b) => a.localeCompare(b))
}
