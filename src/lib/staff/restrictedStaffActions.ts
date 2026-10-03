'use server'

import type {
  AccountingRule,
  ConfirmationStatus,
  Contact,
  ContactLink,
  EntityAlias,
  EntityRegistry,
  EntityType,
  PartnershipOwnership,
} from '@/lib/entity-registry'
import { MISSING_PERMISSION_BLOCK } from '@/lib/auth/requireStaffCompanyPermission'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

/**
 * Staff-gated access to the tables whose draft RLS no longer allows the
 * anon-key browser singleton. authenticateStatementUser() must succeed,
 * and createServiceClient() then repeats active staff plus company
 * membership before the client is returned. A staff user who is not a
 * member of the resolved company never receives the client.
 *
 * Capital upsert keeps the stricter admin gate on top of that factory:
 * an active jj_staff_config ceo or superadmin, or an active user_roles
 * superadmin. The user_roles read is the caller's own row on the session
 * client. The service client still refuses user_roles.
 */

type ServiceDb = Awaited<ReturnType<typeof createServiceClient>>

type Failure = { ok: false; error: string }

const TEXT_LIMIT = 300

function cleanText(value: string, limit = TEXT_LIMIT): string | null {
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > limit) return null
  return trimmed
}

function optionalText(value: string | null | undefined, limit = TEXT_LIMIT): string | null | undefined {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > limit) return undefined
  return trimmed
}

function finiteOrNull(value: number | null): number | null | undefined {
  if (value == null) return null
  if (!Number.isFinite(value)) return undefined
  return value
}

function permissionDenied(error: unknown): boolean {
  return error instanceof Error && (
    error.message === MISSING_PERMISSION_BLOCK
    || error.message === 'BLOCKED_BY_COMPANY_CONTEXT'
  )
}

async function openService(): Promise<{ ok: true; db: ServiceDb } | Failure> {
  try {
    const db = await createServiceClient()
    return { ok: true, db }
  } catch (error) {
    if (permissionDenied(error)) return { ok: false, error: 'not authorized' }
    throw error
  }
}

async function openStaffDb(): Promise<{ ok: true; db: ServiceDb } | Failure> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'not authorized' }
  return openService()
}

async function isActiveSuperadmin(userId: string): Promise<boolean> {
  const session = createSupabaseServerClient()
  const { data, error } = await session
    .from('user_roles')
    .select('role, is_active')
    .eq('user_id', userId)
    .limit(1)
  if (error) return false
  const row = (Array.isArray(data) ? data[0] : data) as { role?: string; is_active?: boolean } | null | undefined
  return !!row && row.role === 'superadmin' && row.is_active === true
}

/**
 * File 3 writes partnership_capital only when finance.is_active_jj_admin() is true:
 * an active jj_staff_config ceo, or an active user_roles superadmin.
 * finance_admin and statement_operator are staff, and they are not admins.
 * The factory's staff and membership check still runs before the write.
 */
async function openAdminDb(): Promise<{ ok: true; db: ServiceDb } | Failure> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'not authorized' }
  if (auth.staffRole !== 'ceo' && auth.staffRole !== 'superadmin') {
    const superadmin = await isActiveSuperadmin(auth.userId)
    if (!superadmin) return { ok: false, error: 'not authorized' }
  }
  return openService()
}

export type StaffContactRow = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  property_name: string | null
  notes: string | null
  created_at: string
}

export async function countStaffContacts(): Promise<{ count: number | null; error: { message: string } | null }> {
  const gate = await openStaffDb()
  if (!gate.ok) return { count: null, error: { message: gate.error } }
  const { count, error } = await gate.db.from('contacts').select('id', { count: 'exact', head: true })
  if (error || typeof count !== 'number') {
    return { count: null, error: { message: error?.message ?? 'db_error' } }
  }
  return { count, error: null }
}

export async function listStaffContacts(): Promise<{ ok: true; contacts: StaffContactRow[] } | Failure> {
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db.from('contacts').select('*').order('name')
  if (error) return { ok: false, error: error.message }
  return { ok: true, contacts: (data ?? []) as StaffContactRow[] }
}

export async function createStaffContact(input: {
  name: string
  type: string
  email: string | null
  phone: string | null
  property_name: string | null
  notes: string | null
}): Promise<{ ok: true } | Failure> {
  const name = cleanText(input.name)
  const type = cleanText(input.type, 40)
  const email = optionalText(input.email)
  const phone = optionalText(input.phone, 40)
  const propertyName = optionalText(input.property_name)
  const notes = optionalText(input.notes, 2000)
  if (!name || !type || email === undefined || phone === undefined || propertyName === undefined || notes === undefined) {
    return { ok: false, error: 'invalid input' }
  }

  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('contacts').insert([{
    name,
    type,
    email,
    phone,
    property_name: propertyName,
    notes,
  }])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteStaffContact(id: string): Promise<{ ok: true } | Failure> {
  const contactId = cleanText(id, 80)
  if (!contactId) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('contacts').delete().eq('id', contactId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function listContactLinks(
  propertyName: string,
): Promise<{ ok: true; links: ContactLink[] } | Failure> {
  const name = cleanText(propertyName)
  if (!name) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db
    .from('contact_properties')
    .select('*, contact:contacts(id, name, type)')
    .eq('property_name', name)
  if (error) return { ok: false, error: error.message }
  const links = ((data ?? []) as ContactLink[]).filter(row => row.is_deleted !== true)
  return { ok: true, links }
}

export async function searchStaffContacts(
  query: string,
): Promise<{ ok: true; contacts: Contact[] } | Failure> {
  const needle = cleanText(query, 100)
  if (!needle) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db
    .from('contacts')
    .select('id, name, type')
    .ilike('name', `%${needle}%`)
    .limit(10)
  if (error) return { ok: false, error: error.message }
  const contacts = ((data ?? []) as Array<Contact & { is_deleted?: boolean }>)
    .filter(row => row.is_deleted !== true)
    .map(({ id, name, type }) => ({ id, name, type }))
  return { ok: true, contacts }
}

export async function addContactLink(input: {
  contactId: string
  propertyName: string
  role: string
  status: string
}): Promise<{ ok: true } | Failure> {
  const contactId = cleanText(input.contactId, 80)
  const propertyName = cleanText(input.propertyName)
  const role = cleanText(input.role, 40)
  const status = cleanText(input.status, 40)
  if (!contactId || !propertyName || !role || !status) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('contact_properties').insert({
    contact_id: contactId,
    property_name: propertyName,
    relationship_role: role,
    confirmation_status: status,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeContactLink(linkId: string): Promise<{ ok: true } | Failure> {
  const id = cleanText(linkId, 80)
  if (!id) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('contact_properties').update({ is_deleted: true }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function upsertPartnershipCapital(row: {
  property_name: string
  partner_name: string
  ownership_percent: number
  entry_date: string | null
  jj_original_acquisition_cost: number | null
  partner_entry_valuation: number | null
  amount_paid_by_partner: number
  notes: string | null
}): Promise<{ ok: true } | Failure> {
  const propertyName = cleanText(row.property_name)
  const partnerName = cleanText(row.partner_name)
  const entryDate = optionalText(row.entry_date, 40)
  const notes = optionalText(row.notes, 2000)
  const originalCost = finiteOrNull(row.jj_original_acquisition_cost)
  const entryValuation = finiteOrNull(row.partner_entry_valuation)
  const paid = finiteOrNull(row.amount_paid_by_partner)
  if (
    !propertyName
    || !partnerName
    || !Number.isFinite(row.ownership_percent)
    || entryDate === undefined
    || notes === undefined
    || originalCost === undefined
    || entryValuation === undefined
    || paid == null
  ) {
    return { ok: false, error: 'invalid input' }
  }

  const gate = await openAdminDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('partnership_capital').upsert(
    {
      property_name: propertyName,
      partner_name: partnerName,
      ownership_percent: row.ownership_percent,
      entry_date: entryDate,
      jj_original_acquisition_cost: originalCost,
      partner_entry_valuation: entryValuation,
      amount_paid_by_partner: paid,
      notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_name,partner_name' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type OpeningBalanceEntry = {
  property_name: string
  balance_eur: number
  as_of_date: string | null
  id: string | null
  source: 'db' | 'default'
}

export async function readContactOpeningBalances(input: {
  contactId: string
  propertyNames: string[]
  asOfDate: string
}): Promise<{ ok: true; entries: OpeningBalanceEntry[] } | Failure> {
  const contactId = cleanText(input.contactId, 80)
  const asOfDate = cleanText(input.asOfDate, 40)
  if (!contactId || !asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return { ok: false, error: 'invalid input' }
  }
  if (!Array.isArray(input.propertyNames) || input.propertyNames.length < 1 || input.propertyNames.length > 500) {
    return { ok: false, error: 'invalid input' }
  }
  const propertyNames: string[] = []
  for (const name of input.propertyNames) {
    const cleaned = cleanText(name)
    if (!cleaned) return { ok: false, error: 'invalid input' }
    propertyNames.push(cleaned)
  }

  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db
    .from('contact_opening_balances')
    .select('id, property_name, balance_eur, as_of_date')
    .eq('contact_id', contactId)
    .in('property_name', propertyNames)
    .lte('as_of_date', asOfDate)
    .eq('is_voided', false)
    .order('as_of_date', { ascending: false })
  if (error) return { ok: false, error: error.message }

  const seen = new Set<string>()
  const entries: OpeningBalanceEntry[] = []
  for (const row of (data ?? []) as Array<{ id: string; property_name: string; balance_eur: string | number; as_of_date: string }>) {
    if (seen.has(row.property_name)) continue
    seen.add(row.property_name)
    const balance = Number.parseFloat(String(row.balance_eur))
    entries.push({
      property_name: row.property_name,
      balance_eur: Number.isFinite(balance) ? balance : 0,
      as_of_date: row.as_of_date,
      id: row.id,
      source: 'db',
    })
  }
  for (const name of propertyNames) {
    if (!seen.has(name)) {
      entries.push({ property_name: name, balance_eur: 0, as_of_date: null, id: null, source: 'default' })
    }
  }
  return { ok: true, entries }
}

const ENTITY_TYPES: readonly EntityType[] = [
  'client_property', 'partnership_property', 'jj_property', 'jj_internal',
  'person', 'transfer_account', 'special_case',
]
const CONFIRMATION_STATUSES: readonly ConfirmationStatus[] = [
  'confirmed', 'likely', 'needs_review', 'special_case',
]
const ALIAS_SOURCES: readonly EntityAlias['source'][] = ['case_variant', 'typo', 'historical', 'manual']

function asNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? 0))
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function getStaffEntity(id: string): Promise<{ ok: true; entity: EntityRegistry | null } | Failure> {
  const entityId = cleanText(id, 80)
  if (!entityId) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db.from('entity_registry').select('*').eq('id', entityId).limit(1)
  if (error) return { ok: false, error: error.message }
  const rows = (data ?? []) as EntityRegistry[]
  return { ok: true, entity: rows[0] ?? null }
}

export async function listStaffEntities(filters?: {
  entity_type?: EntityType[]
  confirmation_status?: ConfirmationStatus[]
  is_active?: boolean
  search?: string
}): Promise<{ ok: true; entities: EntityRegistry[] } | Failure> {
  const types = filters?.entity_type ?? []
  const statuses = filters?.confirmation_status ?? []
  if (types.some(type => !ENTITY_TYPES.includes(type))) return { ok: false, error: 'invalid input' }
  if (statuses.some(status => !CONFIRMATION_STATUSES.includes(status))) return { ok: false, error: 'invalid input' }
  if (filters?.is_active != null && typeof filters.is_active !== 'boolean') return { ok: false, error: 'invalid input' }
  const search = filters?.search == null || filters.search.trim() === '' ? null : cleanText(filters.search, 100)
  if (filters?.search != null && filters.search.trim() !== '' && !search) return { ok: false, error: 'invalid input' }

  const gate = await openStaffDb()
  if (!gate.ok) return gate
  let query = gate.db.from('entity_registry').select('*').order('canonical_name') as any
  if (types.length) query = query.in('entity_type', types)
  if (statuses.length) query = query.in('confirmation_status', statuses)
  if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active)
  if (search) query = query.ilike('canonical_name', `%${search}%`)
  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, entities: (data ?? []) as EntityRegistry[] }
}

export async function updateStaffEntity(
  id: string,
  updates: Partial<Pick<EntityRegistry, 'display_name' | 'entity_type' | 'confirmation_status' | 'notes' | 'is_active'>>,
): Promise<{ ok: true } | Failure> {
  const entityId = cleanText(id, 80)
  if (!entityId) return { ok: false, error: 'invalid input' }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('display_name' in updates) {
    const displayName = optionalText(updates.display_name)
    if (displayName === undefined) return { ok: false, error: 'invalid input' }
    patch.display_name = displayName
  }
  if ('notes' in updates) {
    const notes = optionalText(updates.notes, 2000)
    if (notes === undefined) return { ok: false, error: 'invalid input' }
    patch.notes = notes
  }
  if ('entity_type' in updates) {
    if (!updates.entity_type || !ENTITY_TYPES.includes(updates.entity_type)) return { ok: false, error: 'invalid input' }
    patch.entity_type = updates.entity_type
  }
  if ('confirmation_status' in updates) {
    if (!updates.confirmation_status || !CONFIRMATION_STATUSES.includes(updates.confirmation_status)) {
      return { ok: false, error: 'invalid input' }
    }
    patch.confirmation_status = updates.confirmation_status
  }
  if ('is_active' in updates) {
    if (typeof updates.is_active !== 'boolean') return { ok: false, error: 'invalid input' }
    patch.is_active = updates.is_active
  }
  if (Object.keys(patch).length === 1) return { ok: false, error: 'invalid input' }

  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('entity_registry').update(patch).eq('id', entityId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function listStaffAliases(entityId: string): Promise<{ ok: true; aliases: EntityAlias[] } | Failure> {
  const id = cleanText(entityId, 80)
  if (!id) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db.from('entity_aliases').select('*').eq('entity_id', id).order('created_at')
  if (error) return { ok: false, error: error.message }
  return { ok: true, aliases: (data ?? []) as EntityAlias[] }
}

export async function addStaffAlias(
  entityId: string,
  aliasName: string,
  source: EntityAlias['source'],
): Promise<{ ok: true } | Failure> {
  const id = cleanText(entityId, 80)
  const name = cleanText(aliasName)
  if (!id || !name || !ALIAS_SOURCES.includes(source)) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('entity_aliases').insert({ entity_id: id, alias_name: name, source })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deactivateStaffAlias(aliasId: string): Promise<{ ok: true } | Failure> {
  const id = cleanText(aliasId, 80)
  if (!id) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('entity_aliases').update({ is_active: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function listStaffOwnership(
  entityId: string,
): Promise<{ ok: true; rows: PartnershipOwnership[] } | Failure> {
  const id = cleanText(entityId, 80)
  if (!id) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db
    .from('partnership_ownership')
    .select('*')
    .eq('entity_id', id)
    .order('effective_from')
  if (error) return { ok: false, error: error.message }
  const rows = ((data ?? []) as PartnershipOwnership[]).map(row => ({
    ...row,
    ownership_pct: asNumber(row.ownership_pct),
  }))
  return { ok: true, rows }
}

export async function insertStaffOwnership(row: Omit<PartnershipOwnership, 'id' | 'created_at'>): Promise<{ ok: true } | Failure> {
  const entityId = cleanText(row.entity_id, 80)
  const partnerName = cleanText(row.partner_name)
  const status = cleanText(row.confirmation_status, 40)
  const ownershipPct = nullableNumber(row.ownership_pct)
  const capital = nullableNumber(row.capital_contribution_eur)
  const profit = nullableNumber(row.profit_share_pct)
  const loss = nullableNumber(row.loss_share_pct)
  const from = optionalText(row.effective_from, 40)
  const to = optionalText(row.effective_to, 40)
  const settlement = optionalText(row.settlement_notes, 2000)
  const notes = optionalText(row.notes, 2000)
  if (
    !entityId || !partnerName || !status
    || ownershipPct == null
    || capital === undefined || profit === undefined || loss === undefined
    || from === undefined || to === undefined || settlement === undefined || notes === undefined
  ) {
    return { ok: false, error: 'invalid input' }
  }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db.from('partnership_ownership').insert({
    entity_id: entityId,
    partner_name: partnerName,
    ownership_pct: ownershipPct,
    capital_contribution_eur: capital,
    profit_share_pct: profit,
    loss_share_pct: loss,
    settlement_notes: settlement,
    effective_from: from,
    effective_to: to,
    confirmation_status: status,
    notes,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function closeStaffOwnership(id: string): Promise<{ ok: true } | Failure> {
  const rowId = cleanText(id, 80)
  if (!rowId) return { ok: false, error: 'invalid input' }
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { error } = await gate.db
    .from('partnership_ownership')
    .update({ effective_to: new Date().toISOString().split('T')[0] })
    .eq('id', rowId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function listStaffAccountingRules(): Promise<{ ok: true; rules: AccountingRule[] } | Failure> {
  const gate = await openStaffDb()
  if (!gate.ok) return gate
  const { data, error } = await gate.db.from('accounting_rules').select('*').order('entity_type')
  if (error) return { ok: false, error: error.message }
  return { ok: true, rules: (data ?? []) as AccountingRule[] }
}
