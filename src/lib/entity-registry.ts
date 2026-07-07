// ============================================================
// JJ PROPERTY 10 — Entity Registry Library
// File: src/lib/entity-registry.ts
//
// All types + Supabase query functions for Phase 2.
// No UI logic. Import from '@/lib/entity-registry'.
// ============================================================

import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType =
  | 'client_property'
  | 'partnership_property'
  | 'jj_property'
  | 'jj_internal'
  | 'person'
  | 'transfer_account'
  | 'special_case'

export type ConfirmationStatus = 'confirmed' | 'likely' | 'needs_review' | 'special_case'

export interface EntityRegistry {
  id: string
  canonical_name: string
  display_name: string | null
  entity_type: EntityType
  confirmation_status: ConfirmationStatus
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EntityAlias {
  id: string
  entity_id: string
  alias_name: string
  source: 'case_variant' | 'typo' | 'historical' | 'manual'
  is_active: boolean
  created_at: string
}

export interface PartnershipOwnership {
  id: string
  entity_id: string
  partner_name: string
  ownership_pct: number
  capital_contribution_eur: number | null
  profit_share_pct: number | null
  loss_share_pct: number | null
  settlement_notes: string | null
  effective_from: string | null
  effective_to: string | null
  confirmation_status: string
  notes: string | null
  created_at: string
}

export interface AccountingRule {
  entity_type: EntityType
  include_in_client_report: boolean
  include_in_partnership_report: boolean
  include_in_jj_pl: boolean
  include_in_cashflow: boolean
  label: string
  notes: string | null
}

export interface UnmappedQueueItem {
  property_name: string
  tx_count: number
  first_date: string
  last_date: string
  total_eur: number
  categories: string
}

export interface NetCashPosition {
  entity_id: string
  canonical_name: string
  entity_type: EntityType
  party: string
  total_paid: number
  total_received: number
  net_position: number
}

export interface OwnershipAllocation {
  entity_id: string
  canonical_name: string
  entity_type: EntityType
  partner_name: string
  ownership_pct: number
  expected_cost_share: number
  expected_income_share: number
  expected_net_share: number
}

export interface SettlementResult {
  entity_id: string
  canonical_name: string
  entity_type: EntityType
  partner_name: string
  ownership_pct: number
  actual_paid: number
  actual_received: number
  actual_net: number
  expected_net_share: number
  variance_eur: number
  settlement_status: 'settled' | 'overpaid' | 'underpaid'
}

export interface AnastasiaReimbursement {
  entity_id: string
  canonical_name: string
  total_paid_by_anastasia: number
  identified_reimbursements: number
  net_owed_to_anastasia: number
}

export interface EntityTransaction {
  transaction_id: string
  date: string
  raw_property_name: string
  canonical_name: string
  category: string
  subcategory: string
  description: string | null
  payer: string
  payee: string
  amount_eur: number
  tx_notes: string | null
}

export interface Contact {
  id: string
  name: string
  type: string | null
}

export interface ContactLink {
  id: string
  contact_id: string
  property_name: string
  relationship_role: string | null
  confirmation_status: string | null
  notes: string | null
  is_deleted: boolean | null
  contact?: Contact
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  client_property:      'Client Property',
  partnership_property: 'Partnership Property',
  jj_property:          'JJ-Owned Property',
  jj_internal:          'JJ Internal',
  person:               'Person / Employee',
  transfer_account:     'Transfer Account',
  special_case:         'Special Case',
}

export const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  client_property:      'bg-blue-100 text-blue-800',
  partnership_property: 'bg-purple-100 text-purple-800',
  jj_property:          'bg-green-100 text-green-800',
  jj_internal:          'bg-orange-100 text-orange-800',
  person:               'bg-pink-100 text-pink-800',
  transfer_account:     'bg-gray-100 text-gray-600',
  special_case:         'bg-yellow-100 text-yellow-800',
}

export const STATUS_LABELS: Record<ConfirmationStatus, string> = {
  confirmed:    'Confirmed',
  likely:       'Likely',
  needs_review: 'Needs Review',
  special_case: 'Special Case',
}

export const STATUS_COLORS: Record<ConfirmationStatus, string> = {
  confirmed:    'bg-green-100 text-green-800',
  likely:       'bg-blue-100 text-blue-800',
  needs_review: 'bg-yellow-100 text-yellow-800',
  special_case: 'bg-red-100 text-red-800',
}

export const EUR = (v: number | string | null | undefined): string => {
  const n = parseFloat(String(v ?? 0))
  return new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(isNaN(n) ? 0 : n)
}

const parseNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0))
  return isNaN(n) ? 0 : n
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export async function getEntity(id: string): Promise<EntityRegistry | null> {
  const { data, error } = await supabase
    .from('entity_registry')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { if (error.code === 'PGRST116') return null; throw error }
  return data
}

export async function listEntities(filters?: {
  entity_type?: EntityType[]
  confirmation_status?: ConfirmationStatus[]
  is_active?: boolean
  search?: string
}): Promise<EntityRegistry[]> {
  let q = supabase.from('entity_registry').select('*').order('canonical_name')
  if (filters?.entity_type?.length)          q = q.in('entity_type', filters.entity_type)
  if (filters?.confirmation_status?.length)  q = q.in('confirmation_status', filters.confirmation_status)
  if (filters?.is_active !== undefined)      q = q.eq('is_active', filters.is_active)
  if (filters?.search)                       q = q.ilike('canonical_name', `%${filters.search}%`)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function updateEntity(
  id: string,
  updates: Partial<Omit<EntityRegistry, 'id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('entity_registry')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── Aliases ──────────────────────────────────────────────────────────────────

export async function getAliases(entityId: string): Promise<EntityAlias[]> {
  const { data, error } = await supabase
    .from('entity_aliases')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function addAlias(
  entityId: string,
  aliasName: string,
  source: EntityAlias['source']
): Promise<void> {
  const { error } = await supabase
    .from('entity_aliases')
    .insert({ entity_id: entityId, alias_name: aliasName, source })
  if (error) throw error
}

export async function deactivateAlias(aliasId: string): Promise<void> {
  const { error } = await supabase
    .from('entity_aliases')
    .update({ is_active: false })
    .eq('id', aliasId)
  if (error) throw error
}

// ─── Ownership ────────────────────────────────────────────────────────────────

export async function getOwnership(entityId: string): Promise<PartnershipOwnership[]> {
  const { data, error } = await supabase
    .from('partnership_ownership')
    .select('*')
    .eq('entity_id', entityId)
    .order('effective_from')
  if (error) throw error
  return (data ?? []).map(r => ({ ...r, ownership_pct: parseNum(r.ownership_pct) }))
}

export async function insertOwnershipRow(row: Omit<PartnershipOwnership, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('partnership_ownership').insert(row)
  if (error) throw error
}

export async function closeOwnershipRow(id: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_ownership')
    .update({ effective_to: new Date().toISOString().split('T')[0] })
    .eq('id', id)
  if (error) throw error
}

// ─── Financial views ──────────────────────────────────────────────────────────

export async function getNetCashPosition(entityId: string): Promise<NetCashPosition[]> {
  const { data, error } = await supabase
    .from('v_entity_net_cash_position')
    .select('*')
    .eq('entity_id', entityId)
    .order('party')
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    total_paid:     parseNum(r.total_paid),
    total_received: parseNum(r.total_received),
    net_position:   parseNum(r.net_position),
  }))
}

export async function getOwnershipAllocation(entityId: string): Promise<OwnershipAllocation[]> {
  const { data, error } = await supabase
    .from('v_entity_ownership_allocation')
    .select('*')
    .eq('entity_id', entityId)
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    ownership_pct:        parseNum(r.ownership_pct),
    expected_cost_share:  parseNum(r.expected_cost_share),
    expected_income_share: parseNum(r.expected_income_share),
    expected_net_share:   parseNum(r.expected_net_share),
  }))
}

export async function getSettlement(entityId: string): Promise<SettlementResult[]> {
  const { data, error } = await supabase
    .from('v_entity_settlement')
    .select('*')
    .eq('entity_id', entityId)
    .order('partner_name')
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    ownership_pct:    parseNum(r.ownership_pct),
    actual_paid:      parseNum(r.actual_paid),
    actual_received:  parseNum(r.actual_received),
    actual_net:       parseNum(r.actual_net),
    expected_net_share: parseNum(r.expected_net_share),
    variance_eur:     parseNum(r.variance_eur),
  }))
}

export async function getAnastasiaReimbursement(
  entityId: string
): Promise<AnastasiaReimbursement | null> {
  const { data, error } = await supabase
    .from('v_entity_anastasia_reimbursement')
    .select('*')
    .eq('entity_id', entityId)
    .single()
  if (error) { if (error.code === 'PGRST116') return null; throw error }
  if (!data) return null
  return {
    ...data,
    total_paid_by_anastasia: parseNum(data.total_paid_by_anastasia),
    identified_reimbursements: parseNum(data.identified_reimbursements),
    net_owed_to_anastasia: parseNum(data.net_owed_to_anastasia),
  }
}

// ─── Unmapped queue ───────────────────────────────────────────────────────────

export async function getUnmappedQueue(): Promise<UnmappedQueueItem[]> {
  const { data, error } = await supabase
    .from('v_unmapped_queue')
    .select('*')
    .order('tx_count', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    tx_count:  parseInt(String(r.tx_count), 10),
    total_eur: parseNum(r.total_eur),
  }))
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getEntityTransactions(
  entityId: string,
  limit = 50
): Promise<EntityTransaction[]> {
  const { data, error } = await supabase
    .from('v_entity_resolved')
    .select('*')
    .eq('entity_id', entityId)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(r => ({ ...r, amount_eur: parseNum(r.amount_eur) }))
}

export async function getEntityTransactionCount(entityId: string): Promise<number> {
  const { count, error } = await supabase
    .from('v_entity_resolved')
    .select('*', { count: 'exact', head: true })
    .eq('entity_id', entityId)
  if (error) throw error
  return count ?? 0
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function getContactLinks(propertyName: string): Promise<ContactLink[]> {
  const { data, error } = await supabase
    .from('contact_properties')
    .select('*, contact:contacts(id, name, type)')
    .eq('property_name', propertyName)
  if (error) throw error
  return (data ?? []).filter((r: ContactLink) => r.is_deleted !== true)
}

export async function searchContacts(query: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, type')
    .ilike('name', `%${query}%`)
    .limit(10)
  if (error) throw error
  return (data ?? []).filter((c: Contact & { is_deleted?: boolean }) => c.is_deleted !== true)
}

export async function addContactLink(
  contactId: string,
  propertyName: string,
  role: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('contact_properties')
    .insert({
      contact_id: contactId,
      property_name: propertyName,
      relationship_role: role,
      confirmation_status: status,
    })
  if (error) throw error
}

export async function removeContactLink(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('contact_properties')
    .update({ is_deleted: true })
    .eq('id', linkId)
  if (error) throw error
}

export async function getAccountingRules(): Promise<AccountingRule[]> {
  const { data, error } = await supabase
    .from('accounting_rules')
    .select('*')
    .order('entity_type')
  if (error) throw error
  return data ?? []
}

// ─── Partnership Capital ──────────────────────────────────────────────────────
//
// Tracks capital contributions for outside partners in partnership properties.
// Entry valuation may exceed JJ original cost — the difference is JJ's deal
// spread / entry premium for finding and bringing the deal.
//
// Formula:  partner_required_capital = partner_entry_valuation × ownership_percent / 100
// Computed: remaining_capital_due    = partner_required_capital − amount_paid_by_partner
// Computed: jj_deal_spread           = partner_entry_valuation − jj_original_acquisition_cost

export interface PartnershipCapital {
  id: string
  property_name: string
  partner_name: string
  ownership_percent: number
  entry_date: string | null
  jj_original_acquisition_cost: number | null
  partner_entry_valuation: number | null
  /** Computed by v_partnership_capital: entry_val × pct / 100 */
  partner_required_capital: number | null
  amount_paid_by_partner: number
  /** Computed by v_partnership_capital: required − paid */
  remaining_capital_due: number | null
  /** Computed by v_partnership_capital: entry_val − jj_original_cost */
  jj_deal_spread: number | null
  /** Computed: (partner_entry_valuation − jj_original_acquisition_cost) × ownership_percent / 100 */
  partner_premium_to_jj: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

const parseNumOrNull = (v: unknown): number | null => {
  if (v == null) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

export async function getPartnershipCapital(
  propertyName: string
): Promise<PartnershipCapital[]> {
  const { data, error } = await supabase
    .from('v_partnership_capital')
    .select('*')
    .eq('property_name', propertyName)
    .order('partner_name')
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    ownership_percent:            parseNum(r.ownership_percent),
    jj_original_acquisition_cost: parseNumOrNull(r.jj_original_acquisition_cost),
    partner_entry_valuation:      parseNumOrNull(r.partner_entry_valuation),
    partner_required_capital:     parseNumOrNull(r.partner_required_capital),
    amount_paid_by_partner:       parseNum(r.amount_paid_by_partner),
    remaining_capital_due:        parseNumOrNull(r.remaining_capital_due),
    jj_deal_spread:               parseNumOrNull(r.jj_deal_spread),
    partner_premium_to_jj:        parseNumOrNull(r.partner_premium_to_jj),
  }))
}

// ─── Partnership Capital Allocation (preview view) ───────────────────────────

export interface PartnerCapitalAllocation {
  property_name: string
  partner_name: string
  ownership_percent: number
  jj_original_acquisition_cost: number
  partner_entry_valuation: number
  original_cost_share: number
  partner_premium_to_jj: number
  total_required_from_partner: number
  actual_partner_payments: number
  capital_covered: number
  premium_covered: number
  remaining_capital_due: number
  remaining_premium_due: number
  total_remaining_due: number
  overpaid_credit: number
  notes: string | null
}

export async function getPartnerCapitalAllocation(
  propertyName: string
): Promise<PartnerCapitalAllocation[]> {
  const { data, error } = await supabase
    .from('v_partnership_partner_capital_allocation')
    .select('*')
    .eq('property_name', propertyName)
    .order('partner_name')
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    ownership_percent:             parseNum(r.ownership_percent),
    jj_original_acquisition_cost:  parseNum(r.jj_original_acquisition_cost),
    partner_entry_valuation:       parseNum(r.partner_entry_valuation),
    original_cost_share:           parseNum(r.original_cost_share),
    partner_premium_to_jj:         parseNum(r.partner_premium_to_jj),
    total_required_from_partner:   parseNum(r.total_required_from_partner),
    actual_partner_payments:       parseNum(r.actual_partner_payments),
    capital_covered:               parseNum(r.capital_covered),
    premium_covered:               parseNum(r.premium_covered),
    remaining_capital_due:         parseNum(r.remaining_capital_due),
    remaining_premium_due:         parseNum(r.remaining_premium_due),
    total_remaining_due:           parseNum(r.total_remaining_due),
    overpaid_credit:               parseNum(r.overpaid_credit),
  }))
}

// ─── Partnership Expense Markup Allocation (preview view) ────────────────────

export interface PartnershipExpenseMarkup {
  transaction_id: string
  date: string
  property_name: string
  category: string
  subcategory: string
  description: string | null
  real_amount: number
  client_charge_market_price: number
  partner_name: string
  partner_ownership_percent: number
  external_partner_charge: number
  jj_actual_cost_balance: number
  jj_markup_profit_component: number
  notes: string | null
}

export async function getPartnershipExpenseMarkup(
  propertyName: string,
  limit = 50
): Promise<PartnershipExpenseMarkup[]> {
  const { data, error } = await supabase
    .from('v_partnership_expense_markup_allocation')
    .select('*')
    .eq('property_name', propertyName)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(r => ({
    ...r,
    real_amount:                parseNum(r.real_amount),
    client_charge_market_price: parseNum(r.client_charge_market_price),
    partner_ownership_percent:  parseNum(r.partner_ownership_percent),
    external_partner_charge:    parseNum(r.external_partner_charge),
    jj_actual_cost_balance:     parseNum(r.jj_actual_cost_balance),
    jj_markup_profit_component: parseNum(r.jj_markup_profit_component),
  }))
}

// ─── JJ Internal Settlement (Rule 2) ─────────────────────────────────────────

export interface JJInternalSettlement {
  property_name: string
  yossi_paid: number
  jacob_paid: number
  jj_company_paid: number
  total_jj_invested: number
  expected_per_partner: number
  yossi_effective: number
  jacob_effective: number
  yossi_balance: number
  jacob_balance: number
  settlement_direction: string
  settlement_amount: number
}

export async function getJJInternalSettlement(
  propertyName: string
): Promise<JJInternalSettlement | null> {
  const { data, error } = await supabase
    .from('v_jj_internal_partnership_settlement')
    .select('*')
    .eq('property_name', propertyName)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null // no rows
    throw error
  }
  if (!data) return null
  return {
    ...data,
    yossi_paid:          parseNum(data.yossi_paid),
    jacob_paid:          parseNum(data.jacob_paid),
    jj_company_paid:     parseNum(data.jj_company_paid),
    total_jj_invested:   parseNum(data.total_jj_invested),
    expected_per_partner: parseNum(data.expected_per_partner),
    yossi_effective:     parseNum(data.yossi_effective),
    jacob_effective:     parseNum(data.jacob_effective),
    yossi_balance:       parseNum(data.yossi_balance),
    jacob_balance:       parseNum(data.jacob_balance),
    settlement_amount:   parseNum(data.settlement_amount),
  }
}

// ─── JJ Property Net Position (Rules 3 + 5) ──────────────────────────────────

export interface JJPropertyNetPosition {
  property_name: string
  total_jj_invested: number
  yossi_paid: number
  jacob_paid: number
  jj_company_paid: number
  total_partner_premium_to_jj: number
  total_partner_payments_received: number
  total_partner_overpaid_credits: number
  total_partner_charged_markups: number
  total_partner_cost_recovery: number
  total_jj_markup_profit: number
  jj_net_position: number
}

export async function getJJPropertyNetPosition(
  propertyName: string
): Promise<JJPropertyNetPosition | null> {
  const { data, error } = await supabase
    .from('v_jj_property_net_position')
    .select('*')
    .eq('property_name', propertyName)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  if (!data) return null
  return {
    ...data,
    total_jj_invested:               parseNum(data.total_jj_invested),
    yossi_paid:                      parseNum(data.yossi_paid),
    jacob_paid:                      parseNum(data.jacob_paid),
    jj_company_paid:                 parseNum(data.jj_company_paid),
    total_partner_premium_to_jj:     parseNum(data.total_partner_premium_to_jj),
    total_partner_payments_received: parseNum(data.total_partner_payments_received),
    total_partner_overpaid_credits:  parseNum(data.total_partner_overpaid_credits),
    total_partner_charged_markups:   parseNum(data.total_partner_charged_markups),
    total_partner_cost_recovery:     parseNum(data.total_partner_cost_recovery),
    total_jj_markup_profit:          parseNum(data.total_jj_markup_profit),
    jj_net_position:                 parseNum(data.jj_net_position),
  }
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
}): Promise<void> {
  const { error } = await supabase
    .from('partnership_capital')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'property_name,partner_name' }
    )
  if (error) throw error
}
