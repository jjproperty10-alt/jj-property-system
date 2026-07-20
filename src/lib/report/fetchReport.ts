/**
 * JJ Property 10 — RC3 Report Fetch Layer
 * Phase 3 — 2026-07-09
 *
 * SERVER-ONLY. This module is called exclusively from partnerStatementService,
 * which runs after partnerAuthService has completed its 8-step authorization
 * check (lifecycle.investor_auth). Never import this module in browser or
 * client-component code.
 *
 * createServiceClient() is used intentionally — the RC3 financial engine
 * requires service_role access because the underlying transactions table has
 * RLS policies that block the anon role (auth.role() = 'authenticated' required).
 * Authorization boundary: partnerAuthService. The DB client is not the
 * access-control layer here; partnerAuthService is.
 *
 * Follow-up: add `import 'server-only'` once the `server-only` npm package
 * is installed (not currently in package.json). This will cause the compiler
 * to reject any accidental client-bundle import.
 *
 * View chain:
 * transactions
 * → v_transactions_reporting (canonical property names)
 * → v_rc3_classified (account_type + flags)
 * → v_rc3_sale | v_rc3_renovation | v_rc3_rental | v_rc3_airbnb
 *
 * All views apply base filters automatically:
 * (review_status = 'active' OR review_status IS NULL) AND reporting_name IS NOT NULL
 */

import { createServiceClient } from '@/lib/supabase'
import { buildAccountSection } from './computeBalance'
import type { RC3AccountType, RC3PropertyReport, RC3Row } from './types'

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
  const client = createServiceClient()
  let q = (client as any)
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

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FetchReportParams {
  reportingName: string
  fromDate?: string  // ISO date e.g. "2024-01-01"
  toDate?: string    // ISO date e.g. "2026-12-31"
  /** Opening balances per account type.
   * Currently always 0 — will be populated from contact_opening_balances (Task 5). */
  openingBalances?: Partial<Record<RC3AccountType, number>>
}

/**
 * Fetch a complete RC3 property report.
 * Queries all four account views in parallel and builds account sections.
 * Accounts with no rows are omitted from the result.
 */
export async function fetchRC3Report(params: FetchReportParams): Promise<RC3PropertyReport> {
  const { reportingName, fromDate, toDate, openingBalances = {} } = params

  const results = await Promise.all(
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
  )

  const accounts = results.filter(
    (s): s is NonNullable<typeof s> => s !== null,
  )

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
  }
}

/**
 * Fetch sorted list of all property names that have RC3 data.
 * Unions across all four views for complete coverage.
 */
export async function fetchRC3PropertyList(): Promise<string[]> {
  const nameSet = new Set<string>()
  const client = createServiceClient()

  await Promise.all(
    Object.values(RC3_VIEWS).map(async (view) => {
      const { data } = await (client as any)
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
