'use server'

import type { Contact, ContactLink } from '@/lib/entity-registry'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'

/**
 * Staff-gated access to the tables whose draft RLS no longer allows the
 * anon-key browser singleton. authenticateStatementUser() must succeed
 * before createServiceClient() is opened. There is no requireStaffCompanyPermission
 * helper in this repo; this is the existing staff check.
 */

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

async function openStaffDb(): Promise<{ ok: true; db: ReturnType<typeof createServiceClient> } | Failure> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'not authorized' }
  return { ok: true, db: createServiceClient() }
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

  const gate = await openStaffDb()
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
