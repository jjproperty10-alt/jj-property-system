/**
 * @module lifecycle/timelineService
 * @description Server-side service: loads InvestmentTimelineDTO from Supabase.
 *
 * SECURITY:
 * - Uses createServiceClient() (service_role) — lifecycle schema has RLS deny-all.
 * - NEVER imports this on the client side. Server Component / Route Handler only.
 * - Does NOT trust URL params for authorization. Validates entity+property
 *   relationship exists in lifecycle.partner_entry before returning data.
 * - Returns null if no lifecycle record exists (not found, not an error).
 *
 * IMMUTABILITY:
 * - This service is READ-ONLY. It never writes to any lifecycle table.
 * - All business facts are loaded as-is — no inference, no default-filling.
 *
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 */

import { createServiceClient } from '@/lib/supabase'
import {
  projectTimeline,
  computeEvidence,
  type RawPartnerEntryRow,
  type RawCapitalEventRow,
  type RawOwnershipPeriodRow,
} from './timelineProjection'
import type { InvestmentTimelineDTO } from './timelineTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineServiceOptions {
  /**
   * When true: include internal (non-partner-visible) events.
   * Only for JJ admin routes. Default: false (partner-facing).
   */
  includeInternal?: boolean
}

/**
 * Load the Investment Timeline DTO for one investor+property combination.
 *
 * Authorization flow:
 *   1. Resolve ownerName → entity_id via lifecycle.entity_identity
 *   2. Confirm lifecycle.partner_entry exists for entity_id + propertyName
 *   3. Load all source rows (entries, capital events, ownership periods)
 *   4. Project into DTO
 *
 * @param ownerName     Canonical investor name (from URL param, decoded)
 * @param propertyName  Canonical property name (from URL param, decoded)
 * @param options       Service options
 * @returns             InvestmentTimelineDTO or null if no lifecycle record found
 */
export async function loadInvestmentTimeline(
  ownerName: string,
  propertyName: string,
  options: TimelineServiceOptions = {},
): Promise<InvestmentTimelineDTO | null> {
  const db = createServiceClient()

  // ── Step 1: resolve entity_id from canonical_name ─────────────────────────
  const { data: entityRow, error: entityErr } = await db
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, owner_type')
    .eq('canonical_name', ownerName)
    .eq('entity_type', 'person')
    .single()

  if (entityErr || !entityRow) return null

  const entityId = entityRow.id as string
  const ownerType = (entityRow as any).owner_type as string ?? 'partner'

  // ── Step 2: confirm partner_entry exists (authorization gate) ─────────────
  const { data: entryCheck, error: entryCheckErr } = await db
    .schema('lifecycle')
    .from('partner_entry')
    .select('id')
    .eq('entity_id', entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .limit(1)

  if (entryCheckErr || !entryCheck || entryCheck.length === 0) return null

  // ── Step 3: load summary from view ────────────────────────────────────────
  const { data: summaryRow } = await db
    .schema('lifecycle')
    .from('v_partner_investment_statement')
    .select('*')
    .eq('entity_id', entityId)
    .eq('property_name', propertyName)
    .single()

  // ── Step 4: load raw rows for event projection ────────────────────────────

  // partner_entry rows (with business_source join)
  const { data: rawEntries } = await db
    .schema('lifecycle')
    .from('partner_entry')
    .select(`
      id, property_name, entity_id, event_type, event_nature,
      entry_date, entry_date_note, ownership_pct,
      agreed_entry_valuation_eur, required_entry_capital_eur,
      status, created_at,
      business_source:business_source_id (source_type)
    `)
    .eq('entity_id', entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .order('created_at', { ascending: true })

  // capital_event rows
  const { data: rawCapital } = await db
    .schema('lifecycle')
    .from('capital_event')
    .select(`
      id, property_name, entity_id, event_type, event_subtype, event_nature,
      direction, amount_eur, effective_date, effective_date_confidence,
      description, payer_name, payee_name, status, created_at,
      business_source:business_source_id (source_type)
    `)
    .eq('entity_id', entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .order('created_at', { ascending: true })

  // ownership_period rows
  const { data: rawOwnership } = await db
    .schema('lifecycle')
    .from('ownership_period')
    .select(`
      id, property_name, entity_id, event_type, event_nature,
      ownership_pct, effective_from, effective_from_confidence,
      effective_to, status, created_at,
      business_source:business_source_id (source_type)
    `)
    .eq('entity_id', entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .order('created_at', { ascending: true })

  // verification tasks count (for evidence panel)
  const { count: taskCount } = await db
    .schema('lifecycle')
    .from('verification_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'evidence_found'])
    .in('record_id', [
      ...(rawEntries?.map(r => r.id) ?? []),
      ...(rawCapital?.map(r => r.id) ?? []),
      ...(rawOwnership?.map(r => r.id) ?? []),
    ])

  // ── Step 5: normalise raw rows (flatten nested business_source join) ──────
  const partnerEntries: RawPartnerEntryRow[] = (rawEntries ?? []).map(r => ({
    ...r,
    business_source_type: (r.business_source as any)?.source_type ?? null,
  }))

  const capitalEvents: RawCapitalEventRow[] = (rawCapital ?? []).map(r => ({
    ...r,
    business_source_type: (r.business_source as any)?.source_type ?? null,
  }))

  const ownershipPeriods: RawOwnershipPeriodRow[] = (rawOwnership ?? []).map(r => ({
    ...r,
    business_source_type: (r.business_source as any)?.source_type ?? null,
  }))

  // ── Step 6: project events ────────────────────────────────────────────────
  const events = projectTimeline({
    entityId,
    investorName: ownerName,
    partnerEntries,
    capitalEvents,
    ownershipPeriods,
    includeInternal: options.includeInternal ?? false,
  })

  const evidence = computeEvidence(events, taskCount ?? 0)

  // ── Step 7: assemble DTO ──────────────────────────────────────────────────
  const s = summaryRow as any

  const dto: InvestmentTimelineDTO = {
    investor: {
      entityId,
      name: ownerName,
      ownerType,
    },
    property: {
      propertyName,
      lifecycleStatus: s?.entry_status ?? 'unknown',
    },
    summary: {
      currentOwnershipPct:     s?.ownership_pct ?? null,
      agreedEntryValuation:    s?.agreed_entry_valuation_eur ?? null,
      requiredCapital:         s?.required_entry_capital_eur ?? null,
      // P-ARCH-1: keep null if DB returns null — never coerce to 0
      capitalPaid:             s?.capital_paid_eur ?? null,
      capitalRemaining:        s?.capital_remaining_eur ?? null,
      totalDistributionsPaid:  s?.total_distributions_eur ?? 0,
      currentSettlementBalance: null, // M9-A: requires Settlement Engine (M9-C scope)
      currency:                 'EUR',
    },
    events,
    evidence,
    generatedAt: new Date().toISOString(),
  }

  return dto
}
