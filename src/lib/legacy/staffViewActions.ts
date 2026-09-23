'use server'

import { createServiceClient } from '@/lib/supabase'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'

/**
 * Staff-only read of the public views whose client SELECT was revoked.
 * The service role is used only after authenticateStatementUser() succeeds.
 * Callers cannot pass a view outside this list, and cannot pass raw SQL.
 */

const STAFF_VIEWS = [
  'v_airbnb_summary',
  'v_anastasia_clearing',
  'v_cashbox_audit',
  'v_ceo_summary',
  'v_entity_anastasia_reimbursement',
  'v_entity_net_cash_position',
  'v_entity_ownership_allocation',
  'v_entity_resolved',
  'v_entity_settlement',
  'v_jj_internal_partnership_settlement',
  'v_jj_property_net_position',
  'v_owner_balances',
  'v_ownership_summary',
  'v_partnership_capital',
  'v_partnership_expense_markup_allocation',
  'v_partnership_partner_capital_allocation',
  'v_possible_duplicates',
  'v_property_summary',
  'v_rpt_client_transactions',
  'v_rpt_contact_properties',
  'v_transaction_issues',
  'v_unmapped_queue',
] as const

export type StaffViewName = (typeof STAFF_VIEWS)[number]

const VIEW_SET = new Set<string>(STAFF_VIEWS)
const IDENT = /^[a-z_][a-z0-9_]*$/

export type StaffViewError = { message: string; code: string }

export type StaffViewRequest = {
  view: StaffViewName
  select?: string
  eq?: Record<string, string>
  in?: Record<string, string[]>
  gte?: Record<string, string>
  lte?: Record<string, string>
  order?: { column: string; ascending?: boolean }
  limit?: number
  single?: boolean
  head?: boolean
}

export type StaffViewResult = {
  data: any
  error: StaffViewError | null
  count: number | null
}

function bad(message: string): StaffViewResult {
  return { data: null, error: { message, code: '22023' }, count: null }
}

function checkIdent(name: string): boolean {
  return IDENT.test(name)
}

function checkValue(value: string): boolean {
  return value.length > 0 && value.length <= 300
}

function checkSelect(select: string): boolean {
  return select.split(',').every(part => {
    const column = part.trim()
    return column === '*' || checkIdent(column)
  })
}

export async function readStaffView(request: StaffViewRequest): Promise<StaffViewResult> {
  if (!VIEW_SET.has(request.view)) return bad('view is not available')
  const select = request.select ?? '*'
  if (!checkSelect(select)) return bad('select is not available')
  if (request.limit != null && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 10000)) {
    return bad('limit is not available')
  }

  const filters: Array<['eq' | 'gte' | 'lte', string, string] | ['in', string, string[]]> = []
  for (const [column, value] of Object.entries(request.eq ?? {})) {
    if (!checkIdent(column) || !checkValue(value)) return bad('filter is not available')
    filters.push(['eq', column, value])
  }
  for (const [column, value] of Object.entries(request.gte ?? {})) {
    if (!checkIdent(column) || !checkValue(value)) return bad('filter is not available')
    filters.push(['gte', column, value])
  }
  for (const [column, value] of Object.entries(request.lte ?? {})) {
    if (!checkIdent(column) || !checkValue(value)) return bad('filter is not available')
    filters.push(['lte', column, value])
  }
  for (const [column, values] of Object.entries(request.in ?? {})) {
    if (!checkIdent(column) || values.length < 1 || values.length > 500) return bad('filter is not available')
    if (values.some(value => !checkValue(value))) return bad('filter is not available')
    filters.push(['in', column, values])
  }
  if (request.order && !checkIdent(request.order.column)) return bad('order is not available')

  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    return { data: null, error: { message: 'not authorized', code: '42501' }, count: null }
  }

  const db = createServiceClient()
  let query = db.from(request.view).select(select, request.head ? { count: 'exact', head: true } : undefined) as any
  for (const filter of filters) {
    if (filter[0] === 'eq') query = query.eq(filter[1], filter[2])
    else if (filter[0] === 'gte') query = query.gte(filter[1], filter[2])
    else if (filter[0] === 'lte') query = query.lte(filter[1], filter[2])
    else query = query.in(filter[1], filter[2])
  }
  if (request.order) query = query.order(request.order.column, { ascending: request.order.ascending !== false })
  if (request.limit != null) query = query.limit(request.limit)

  const result = request.single ? await query.single() : await query
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, code: result.error.code ?? 'PGRST' } : null,
    count: typeof result.count === 'number' ? result.count : null,
  }
}
