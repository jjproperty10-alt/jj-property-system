/**
 * @module ceo/companyDataService
 * @description Server-side data service for CEO Workspace — Company tab.
 *
 * Reads from three Supabase views:
 *   - v_cashbox_audit (partner cashboxes)
 *   - v_jj_company_pl (company P&L)
 *   - v_anastasia_clearing (employee clearing)
 *
 * SECURITY: Uses createServiceClient() (service_role). Server-only.
 * READ-ONLY: Never writes to any table.
 *
 * PARITY: Lifts data fetching from legacy page.tsx (Sections A, C, F).
 * No new accounting logic. No interpretation. Pure data retrieval.
 *
 * @see CLAUDE.md §5 — v_cashbox_audit
 * @see CLAUDE.md §10 — v_jj_company_pl, v_anastasia_clearing
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────

export interface CashboxRow {
  readonly cash_box_name: string
  readonly total_received: number
  readonly total_paid: number
  readonly balance: number
}

export interface CompanyPL {
  readonly jj_income: number
  readonly salary_anastasia: number
  readonly salary_fabi: number
  readonly total_payroll: number
  readonly office_expenses: number
  readonly marketing_platform: number
  readonly other_expenses: number
  readonly total_expenses: number
  readonly net_company_pl: number
  readonly transaction_count: number
}

export interface AnastasiaClearing {
  readonly cash_collected: number
  readonly cash_transfers_in: number
  readonly cash_transferred_out: number
  readonly expenses_paid: number
  readonly fabi_salary_paid: number
  readonly salary_received: number
  readonly cash_on_hand: number
  readonly anastasia_owes_jj: number
  readonly jj_owes_anastasia: number
  readonly tx_as_payer: number
  readonly tx_as_payee: number
}

export interface CompanyOverviewDTO {
  readonly cashboxes: readonly CashboxRow[]
  readonly pl: CompanyPL | null
  readonly anastasia: AnastasiaClearing | null
  readonly errors: readonly string[]
}

// ─── Numeric coercion ────────────────────────────────────────────────────
// Supabase returns PostgreSQL NUMERIC columns as strings at runtime.

function n(v: unknown): number {
  if (v == null) return 0
  const f = parseFloat(String(v))
  return isNaN(f) ? 0 : f
}

function coerceCashbox(raw: Record<string, unknown>): CashboxRow {
  return {
    cash_box_name: String(raw.cash_box_name ?? ''),
    total_received: n(raw.total_received),
    total_paid: n(raw.total_paid),
    balance: n(raw.balance),
  }
}

function coercePL(raw: Record<string, unknown>): CompanyPL {
  return {
    jj_income: n(raw.jj_income),
    salary_anastasia: n(raw.salary_anastasia),
    salary_fabi: n(raw.salary_fabi),
    total_payroll: n(raw.total_payroll),
    office_expenses: n(raw.office_expenses),
    marketing_platform: n(raw.marketing_platform),
    other_expenses: n(raw.other_expenses),
    total_expenses: n(raw.total_expenses),
    net_company_pl: n(raw.net_company_pl),
    transaction_count: n(raw.transaction_count),
  }
}

function coerceAnastasia(raw: Record<string, unknown>): AnastasiaClearing {
  return {
    cash_collected: n(raw.cash_collected),
    cash_transfers_in: n(raw.cash_transfers_in),
    cash_transferred_out: n(raw.cash_transferred_out),
    expenses_paid: n(raw.expenses_paid),
    fabi_salary_paid: n(raw.fabi_salary_paid),
    salary_received: n(raw.salary_received),
    cash_on_hand: n(raw.cash_on_hand),
    anastasia_owes_jj: n(raw.anastasia_owes_jj),
    jj_owes_anastasia: n(raw.jj_owes_anastasia),
    tx_as_payer: n(raw.tx_as_payer),
    tx_as_payee: n(raw.tx_as_payee),
  }
}

// ─── Data Fetch ──────────────────────────────────────────────────────────

export async function getCompanyOverview(): Promise<CompanyOverviewDTO> {
  const db = createServiceClient()

  const [cashboxRes, plRes, anastasiaRes] = await Promise.all([
    db.from('v_cashbox_audit').select('*').order('cash_box_name'),
    db.from('v_jj_company_pl').select('*').single(),
    db.from('v_anastasia_clearing').select('*').single(),
  ])

  const errors: string[] = []
  if (cashboxRes.error) errors.push(cashboxRes.error.message)
  if (plRes.error) errors.push(plRes.error.message)
  if (anastasiaRes.error) errors.push(anastasiaRes.error.message)

  return {
    cashboxes: (cashboxRes.data ?? []).map(r => coerceCashbox(r as Record<string, unknown>)),
    pl: plRes.data ? coercePL(plRes.data as Record<string, unknown>) : null,
    anastasia: anastasiaRes.data ? coerceAnastasia(anastasiaRes.data as Record<string, unknown>) : null,
    errors,
  }
}
