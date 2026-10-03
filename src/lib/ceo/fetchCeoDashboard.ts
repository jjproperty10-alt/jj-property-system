import { MISSING_PERMISSION_BLOCK, requireStaffCompanyPermission } from '@/lib/auth/requireStaffCompanyPermission'
import { createServiceClient } from '@/lib/supabase'
import type { Settlement } from '@/components/ceo/SettlementSection'

// Company-verified service client. These company-wide views are read only
// after the company gate resolves a verified company; a refused context
// (for example, two active companies) fails closed and no view is read.

interface CashboxRow {
  cash_box_name: string
  total_received: number | string
  total_paid: number | string
  balance: number | string
  transaction_count_received: number | string
  transaction_count_paid: number | string
}

interface AnastasiaClearing {
  cash_collected: number | string
  cash_transfers_in: number | string
  cash_transferred_out: number | string
  expenses_paid: number | string
  fabi_salary_paid: number | string
  salary_received: number | string
  cash_on_hand: number | string
  anastasia_owes_jj: number | string
  jj_owes_anastasia: number | string
  tx_as_payer: number
  tx_as_payee: number
}

interface CeoSummary {
  total_cash_position_profit: number | string
  total_contract_profit: number | string
  cash_contract_gap: number | string
  client_cash_position_profit: number | string
  jj_own_cash_profit: number | string
  partnership_jj_cash_profit: number | string
  company_cash_profit: number | string
  due_to_owners: number | string
  reno_receivables: number | string
  sale_receivables: number | string
  total_receivables: number | string
}

interface CompanyPL {
  jj_income: number | string
  salary_anastasia: number | string
  salary_fabi: number | string
  total_payroll: number | string
  office_expenses: number | string
  marketing_platform: number | string
  other_expenses: number | string
  total_expenses: number | string
  net_company_pl: number | string
  transaction_count: number | string
}

const COMPANY_CONTEXT_BLOCKED = 'BLOCKED_BY_COMPANY_CONTEXT'

export async function fetchAll() {
  let sb: Awaited<ReturnType<typeof createServiceClient>>
  try {
    await requireStaffCompanyPermission()
    sb = await createServiceClient()
  } catch (error) {
    if (error instanceof Error && (error.message === COMPANY_CONTEXT_BLOCKED || error.message === MISSING_PERMISSION_BLOCK)) {
      return {
        cashboxes: [] as CashboxRow[],
        settlement: null as Settlement | null,
        anastasia: null as AnastasiaClearing | null,
        summary: null as CeoSummary | null,
        pl: null as CompanyPL | null,
        errors: [error.message],
      }
    }
    throw error
  }

  // Production exposes v_ceo_summary, but not total_cash_position_profit and not
  // public.v_settlement_verification. select('*') keeps every column the view
  // actually returns. Missing keys stay unavailable; they are not replaced.
  let results
  try {
    results = await Promise.all([
      sb.from('v_cashbox_audit').select('*').order('cash_box_name'),
      sb.from('v_anastasia_clearing').select('*').single(),
      sb.from('v_ceo_summary').select('*').single(),
      sb.from('v_jj_company_pl').select('*').single(),
    ])
  } catch (error) {
    if (error instanceof Error && error.message === COMPANY_CONTEXT_BLOCKED) {
      return {
        cashboxes: [] as CashboxRow[],
        settlement: null as Settlement | null,
        anastasia: null as AnastasiaClearing | null,
        summary: null as CeoSummary | null,
        pl: null as CompanyPL | null,
        errors: [COMPANY_CONTEXT_BLOCKED],
      }
    }
    throw error
  }
  const [cashboxRes, anastasiaRes, summaryRes, plRes] = results

  return {
    cashboxes: (cashboxRes.data ?? []) as CashboxRow[],
    settlement: null as Settlement | null,
    anastasia: anastasiaRes.data as AnastasiaClearing | null,
    summary: summaryRes.data as CeoSummary | null,
    pl: plRes.data as CompanyPL | null,
    errors: [cashboxRes.error, anastasiaRes.error, summaryRes.error, plRes.error]
      .filter(Boolean)
      .map(e => e?.message),
  }
}
