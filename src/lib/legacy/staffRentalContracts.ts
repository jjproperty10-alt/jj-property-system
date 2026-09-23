'use server'

import { createServiceClient } from '@/lib/supabase'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'

/**
 * Staff-only access to public.rental_contracts.
 * The service role is opened only after authenticateStatementUser() succeeds.
 * Callers cannot pass a table name or raw SQL.
 * lifecycle.rental_contracts is a different table and is not read here.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

const LIST_SELECT = 'id, property_id, tenant_name, start_date, end_date, monthly_rent, deposit, payment_day, management_fee_type, management_fee_value, status, notes, properties(name, nickname)'
const DETAIL_SELECT = 'id, property_id, tenant_name, start_date, end_date, monthly_rent, deposit, payment_day, management_fee_type, management_fee_value, status, notes, properties(name, nickname, address)'
const ALERT_SELECT = 'id, property_id, tenant_name, end_date, monthly_rent, status, properties(name)'

export type StaffContractError = { message: string; code: string }

export type StaffContractResult = {
  data: any
  error: StaffContractError | null
  count: number | null
}

export type StaffContractInsert = {
  property_id: string
  tenant_name: string
  start_date: string
  end_date: string | null
  monthly_rent: number
  deposit: number
  payment_day: number
  management_fee_type: 'fixed' | 'percentage'
  management_fee_value: number
  notes: string | null
}

function denied(): StaffContractResult {
  return { data: null, error: { message: 'not authorized', code: '42501' }, count: null }
}

function bad(message: string): StaffContractResult {
  return { data: null, error: { message, code: '22023' }, count: null }
}

function finiteNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

async function authorize(): Promise<StaffContractResult | null> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return denied()
  return null
}

export async function listStaffRentalContracts(purpose: 'list' | 'alerts'): Promise<StaffContractResult> {
  const blocked = await authorize()
  if (blocked) return blocked

  const db = createServiceClient()
  const select = purpose === 'alerts' ? ALERT_SELECT : LIST_SELECT
  let query = db.from('rental_contracts').select(select) as any
  if (purpose === 'alerts') query = query.eq('status', 'active')
  else query = query.order('end_date', { ascending: true })
  const result = await query.limit(1000)
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, code: result.error.code ?? 'PGRST' } : null,
    count: null,
  }
}

export async function readStaffRentalContract(id: string): Promise<StaffContractResult> {
  if (!UUID.test(id)) return bad('contract id is not available')
  const blocked = await authorize()
  if (blocked) return blocked

  const db = createServiceClient()
  const result = await db.from('rental_contracts').select(DETAIL_SELECT).eq('id', id).single()
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, code: result.error.code ?? 'PGRST' } : null,
    count: null,
  }
}

const RENT_STATUSES = ['Rent', 'Rent&Sale'] as const

export async function listStaffContractProperties(): Promise<StaffContractResult> {
  const blocked = await authorize()
  if (blocked) return blocked

  const db = createServiceClient()
  const result = await db
    .from('properties')
    .select('id, name, nickname')
    .in('status', [...RENT_STATUSES])
    .order('name')
    .limit(500)
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, code: result.error.code ?? 'PGRST' } : null,
    count: null,
  }
}

export async function countStaffRentalContracts(): Promise<StaffContractResult> {
  const blocked = await authorize()
  if (blocked) return blocked

  const db = createServiceClient()
  const result = await db.from('rental_contracts').select('id', { count: 'exact', head: true })
  return {
    data: null,
    error: result.error ? { message: result.error.message, code: result.error.code ?? 'PGRST' } : null,
    count: typeof result.count === 'number' ? result.count : null,
  }
}

export async function createStaffRentalContract(input: StaffContractInsert): Promise<StaffContractResult> {
  if (!UUID.test(input.property_id)) return bad('property is not available')
  const tenant = input.tenant_name?.trim() ?? ''
  if (tenant.length < 1 || tenant.length > 200) return bad('tenant name is not available')
  if (!DAY.test(input.start_date)) return bad('start date is not available')
  if (input.end_date != null && !DAY.test(input.end_date)) return bad('end date is not available')
  if (!finiteNumber(input.monthly_rent) || input.monthly_rent < 0) return bad('rent is not available')
  if (!finiteNumber(input.deposit) || input.deposit < 0) return bad('deposit is not available')
  if (!Number.isInteger(input.payment_day) || input.payment_day < 1 || input.payment_day > 31) {
    return bad('payment day is not available')
  }
  if (input.management_fee_type !== 'fixed' && input.management_fee_type !== 'percentage') {
    return bad('fee type is not available')
  }
  if (!finiteNumber(input.management_fee_value) || input.management_fee_value < 0) return bad('fee is not available')
  if (input.notes != null && input.notes.length > 2000) return bad('notes are not available')

  const blocked = await authorize()
  if (blocked) return blocked

  const db = createServiceClient()
  const result = await db.from('rental_contracts').insert({
    property_id: input.property_id,
    tenant_name: tenant,
    start_date: input.start_date,
    end_date: input.end_date,
    monthly_rent: input.monthly_rent,
    deposit: input.deposit,
    payment_day: input.payment_day,
    management_fee_type: input.management_fee_type,
    management_fee_value: input.management_fee_value,
    status: 'active',
    notes: input.notes,
  }).select('id').single()
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, code: result.error.code ?? 'PGRST' } : null,
    count: null,
  }
}
