/**
 * @module lifecycle/timelineService
 * @description Server-side service: loads InvestmentTimelineDTO from Supabase.
 *
 * SECURITY:
 * - Uses createServiceClient() (service_role) - lifecycle schema has RLS deny-all.
 * - NEVER imports this on the client side. Server Component / Route Handler only.
 * - Does NOT trust URL params for authorization. Validates entity+property
 *   relationship exists in lifecycle.partner_entry before returning data.
 * - Returns null if no lifecycle record exists (not found, not an error).
 *
 * ERROR HANDLING:
 * - Steps 1-2: entity not found / unauthorized -> return null -> notFound() in page.
 * - Steps 3-4: schema/connectivity errors -> logged server-side -> thrown (becomes 500).
 *   A schema error must never silently appear as Unknown/empty data to the user.
 * - PGRST116 (no rows for .single()) -> valid empty result, not an error.
 *
 * DATA MAPPING:
 * - D1: v_partner_investment_statement is filtered by partner_name + property_name.
 *       (The view does not expose entity_id - authorization already confirmed in Step 2.)
 * - D2: capital_event.notes (DB column) is selected and mapped -> RawCapitalEventRow.description.
 *       (The DB column is `notes`; the projection interface field is `description`.)
 * - D3: verification_tasks is filtered by source_id (not record_id).
 *       Rows (not count) are fetched; humanLabel is computed per task before returning.
 *
 * IMMUTABILITY:
 * - This service is READ-ONLY. It never writes to any lifecycle table.
 * - All business facts are loaded as-is - no inference, no default-filling.
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
import type { InvestmentTimelineDTO, TimelineViewMode, VerificationTaskItem } from './timelineTypes'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface TimelineServiceOptions {
  /**
   * When true: include internal (non-partner-visible) events.
   * Only for JJ admin routes. Default: false (partner-facing).
   */
  includeInternal?: boolean

  /**
   * View mode for the assembled DTO.
   * Default: 'partner' (safe for all /owner/[owner]/[property]/timeline routes).
   * Set to 'admin' only for authorized JJ admin routes (not yet implemented).
   */
  viewMode?: TimelineViewMode
}

/** PostgREST code for "0 rows returned by .single()" - a valid empty result, not a bug. */
const PGRST116 = 'PGRST116'

// ---------------------------------------------------------------------------
// Human label builder (F3)
// ---------------------------------------------------------------------------

/**
 * Build a partner-safe human label for a verification task.
 *
 * Maps DB field names (missingField) to readable English.
 * Never exposes UUIDs, table names, or internal identifiers.
 * If relatedAmountEur is known, appends a formatted EUR amount for context.
 *
 * Examples:
 *   buildTaskHumanLabel('effective_date', 250000)  → "Payment date pending confirmation (€250,000)"
 *   buildTaskHumanLabel('effective_from', null)    → "Entry date pending confirmation"
 *   buildTaskHumanLabel('amount_eur', null)        → "Payment amount pending confirmation"
 */
function buildTaskHumanLabel(
  missingField: string,
  relatedAmountEur: number | null,
): string {
  const fieldLabels: Record<string, string> = {
    effective_date:            'Payment date',
    effective_date_confidence: 'Payment date',
    effective_from:            'Entry date',
    effective_from_confidence: 'Entry date',
    entry_date:                'Entry date',
    amount_eur:                'Payment amount',
  }
  const label = fieldLabels[missingField] ?? 'Information'

  if (relatedAmountEur !== null) {
    const fmt = new Intl.NumberFormat('en-IE', {
      style:                 'currency',
      currency:              'EUR',
      maximumFractionDigits: 0,
    }).format(relatedAmountEur)
    return `${label} pending confirmation (${fmt})`
  }
  return `${label} pending confirmation`
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

/**
 * Load the Investment Timeline DTO for one investor+property combination.
 *
 * Authorization flow:
 *   1. Resolve ownerName -> entity_id via lifecycle.entity_identity
 *   2. Confirm lifecycle.partner_entry exists for entity_id + propertyName
 *   3. Load summary from v_partner_investment_statement (by partner_name + property_name)
 *   4. Load raw event rows for projection
 *
 * Error contract:
 *   - Steps 1-2: any failure -> return null (caller calls notFound())
 *   - Steps 3-4: schema/connectivity error -> log server-side, throw (caller gets 500)
 *     PGRST116 in Step 3 is valid -> summaryRow = null, assembly continues
 *   - Verification task errors -> log, use [] (non-critical; evidence panel degrades gracefully)
 *
 * @param ownerName     Canonical investor name (decoded from URL param)
 * @param propertyName  Canonical property name (decoded from URL param)
 * @param options       Service options
 * @returns             InvestmentTimelineDTO or null when no lifecycle record exists
 */
export async function loadInvestmentTimeline(
  ownerName: string,
  propertyName: string,
  options: TimelineServiceOptions = {},
): Promise<InvestmentTimelineDTO | null> {
  const db = createServiceClient()

  // -- Step 1: resolve entity_id from canonical_name -------------------------
  const { data: entityRow, error: entityErr } = await db
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, entity_type')
    .eq('canonical_name', ownerName)
    .single()

  if (entityErr) {
    if (entityErr.code !== PGRST116) {
      console.error('[timelineService] entity_identity lookup error', {
        ownerName,
        code: entityErr.code,
        message: entityErr.message,
      })
    }
    // Entity not found or lookup failed -> not found (null -> notFound() in page)
    return null
  }
  if (!entityRow) return null

  const entityId  = entityRow.id           as string
  const ownerType = entityRow.entity_type  as string

  // -- Step 2: confirm partner_entry exists (authorization gate) -------------
  const { data: entryCheck, error: entryCheckErr } = await db
    .schema('lifecycle')
    .from('partner_entry')
    .select('id')
    .eq('entity_id', entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .limit(1)

  if (entryCheckErr) {
    console.error('[timelineService] partner_entry auth check error', {
      ownerName,
      propertyName,
      code: entryCheckErr.code,
      message: entryCheckErr.message,
    })
    // Treat authorization check failure as unauthorized (null -> notFound() in page)
    return null
  }
  if (!entryCheck || entryCheck.length === 0) return null

  // -- Step 3: load summary from partner-facing view -------------------------
  // D1 fix: v_partner_investment_statement exposes partner_name (text), not entity_id.
  // Authorization has already been confirmed in Step 2 - using canonical names here
  // is correct. Do NOT add entity_id to this partner-facing view for this purpose.
  const { data: summaryRow, error: summaryErr } = await db
    .schema('lifecycle')
    .from('v_partner_investment_statement')
    .select('*')
    .eq('partner_name',   ownerName)      // D1: partner_name - not entity_id
    .eq('property_name',  propertyName)
    .single()

  if (summaryErr && summaryErr.code !== PGRST116) {
    // Schema or connectivity error. Must not silently appear as "Unknown" to the user.
    // Log server-side diagnostic and propagate as 500.
    console.error('[timelineService] v_partner_investment_statement error', {
      ownerName,
      propertyName,
      code:    summaryErr.code,
      message: summaryErr.message,
      hint:    (summaryErr as any).hint ?? null,
    })
    throw new Error(
      `[timelineService] summary view query failed (${summaryErr.code})`
    )
  }
  // PGRST116 or no error -> summaryRow may be null (valid for new/incomplete entries)

  // -- Step 4: load raw rows for event projection ----------------------------

  // partner_entry rows (with business_source join)
  const { data: rawEntries, error: entriesErr } = await db
    .schema('lifecycle')
    .from('partner_entry')
    .select(`
      id, property_name, entity_id, event_type, event_nature,
      entry_date, entry_date_note, ownership_pct,
      agreed_entry_valuation_eur, required_entry_capital_eur,
      status, created_at,
      business_source:business_source_id (source_type)
    `)
    .eq('entity_id',     entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .order('created_at', { ascending: true })

  if (entriesErr) {
    console.error('[timelineService] partner_entry rows error', {
      ownerName,
      propertyName,
      code:    entriesErr.code,
      message: entriesErr.message,
    })
    throw new Error(
      `[timelineService] partner_entry query failed (${entriesErr.code})`
    )
  }

  // capital_event rows
  // D2 fix: select `notes` (the actual DB column). The projection interface uses
  // `description` - the mapping notes->description is done in Step 5 below.
  const { data: rawCapital, error: capitalErr } = await db
    .schema('lifecycle')
    .from('capital_event')
    .select(`
      id, property_name, entity_id, event_type, event_subtype, event_nature,
      direction, amount_eur, effective_date, effective_date_confidence,
      notes,
      payer_name, payee_name, status, created_at,
      business_source:business_source_id (source_type)
    `)
    .eq('entity_id',     entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .order('created_at', { ascending: true })

  if (capitalErr) {
    console.error('[timelineService] capital_event error', {
      ownerName,
      propertyName,
      code:    capitalErr.code,
      message: capitalErr.message,
    })
    throw new Error(
      `[timelineService] capital_event query failed (${capitalErr.code})`
    )
  }

  // ownership_period rows
  const { data: rawOwnership, error: ownershipErr } = await db
    .schema('lifecycle')
    .from('ownership_period')
    .select(`
      id, property_name, entity_id, event_type, event_nature,
      ownership_pct, effective_from, effective_from_confidence,
      effective_to, status, created_at,
      business_source:business_source_id (source_type)
    `)
    .eq('entity_id',     entityId)
    .eq('property_name', propertyName)
    .neq('status', 'void')
    .order('created_at', { ascending: true })

  if (ownershipErr) {
    console.error('[timelineService] ownership_period error', {
      ownerName,
      propertyName,
      code:    ownershipErr.code,
      message: ownershipErr.message,
    })
    throw new Error(
      `[timelineService] ownership_period query failed (${ownershipErr.code})`
    )
  }

  // -- Verification task rows  (F3: rows, not count) -------------------------
  // D3 fix: fetch full rows from verification_tasks so each task's missingField,
  // priority, source_table, source_id are available for humanLabel computation.
  // Only tasks linked to events in this owner+property timeline are returned.
  // Guard: skip query when allEventIds is empty (avoids PostgREST .in([]) edge cases).
  const allEventIds = [
    ...(rawEntries   ?? []).map(r => r.id),
    ...(rawCapital   ?? []).map(r => r.id),
    ...(rawOwnership ?? []).map(r => r.id),
  ]

  // Build amount lookup from already-fetched capital events (no extra DB round-trip).
  const capitalAmountMap = new Map<string, number>(
    (rawCapital ?? []).map(r => [r.id as string, (r as any).amount_eur as number]),
  )

  let taskItems: VerificationTaskItem[] = []
  if (allEventIds.length > 0) {
    const { data: taskRows, error: taskErr } = await db
      .schema('lifecycle')
      .from('verification_tasks')
      .select('id, priority, source_table, source_id, missing_field')
      .in('status',    ['pending', 'evidence_found'])
      .in('source_id', allEventIds)               // D3: source_id - not record_id

    if (taskErr) {
      // Non-critical: evidence panel degrades gracefully to empty. Do not throw.
      console.error('[timelineService] verification_tasks error', {
        code:    taskErr.code,
        message: taskErr.message,
      })
    } else {
      taskItems = (taskRows ?? []).map(t => {
        const relatedAmountEur = capitalAmountMap.get(t.source_id as string) ?? null
        return {
          taskId:          t.id as string,
          priority:        ((t.priority as string) ?? 'medium') as 'high' | 'medium' | 'low',
          sourceTable:     t.source_table as string,
          sourceId:        t.source_id as string,
          missingField:    t.missing_field as string,
          humanLabel:      buildTaskHumanLabel(t.missing_field as string, relatedAmountEur),
          relatedAmountEur,
        } satisfies VerificationTaskItem
      })
    }
  }

  // -- Step 5: normalise raw rows --------------------------------------------

  const partnerEntries: RawPartnerEntryRow[] = (rawEntries ?? []).map(r => ({
    ...r,
    business_source_type: (r.business_source as any)?.source_type ?? null,
  }))

  // D2: map capital_event.notes (DB) -> RawCapitalEventRow.description (projection interface)
  const capitalEvents: RawCapitalEventRow[] = (rawCapital ?? []).map(r => ({
    ...r,
    description:          (r as any).notes ?? null,
    business_source_type: (r.business_source as any)?.source_type ?? null,
  }))

  const ownershipPeriods: RawOwnershipPeriodRow[] = (rawOwnership ?? []).map(r => ({
    ...r,
    business_source_type: (r.business_source as any)?.source_type ?? null,
  }))

  // -- Step 6: project events ------------------------------------------------
  const events = projectTimeline({
    entityId,
    investorName:    ownerName,
    partnerEntries,
    capitalEvents,
    ownershipPeriods,
    includeInternal: options.includeInternal ?? false,
  })

  const evidence = computeEvidence(events, taskItems)

  // -- Step 7: assemble DTO --------------------------------------------------
  const s = summaryRow as any

  const viewMode: TimelineViewMode = options.viewMode ?? 'partner'

  const dto: InvestmentTimelineDTO = {
    investor: {
      entityId,
      name:      ownerName,
      ownerType,
    },
    property: {
      propertyName,
      lifecycleStatus: s?.entry_status ?? 'unknown',
    },
    viewMode,
    summary: {
      currentOwnershipPct:      s?.ownership_pct               ?? null,
      agreedEntryValuation:     s?.agreed_entry_valuation_eur  ?? null,
      requiredCapital:          s?.required_entry_capital_eur  ?? null,
      // P-ARCH-1: keep null if DB returns null - never coerce to 0
      capitalPaid:              s?.capital_paid_eur             ?? null,
      capitalRemaining:         s?.capital_remaining_eur        ?? null,
      totalDistributionsPaid:   s?.total_distributions_eur      ?? 0,
      currentSettlementBalance: null, // M9-A: Settlement Engine is M9-C scope
      currency:                 'EUR',
    },
    events,
    evidence,
    generatedAt: new Date().toISOString(),
  }

  return dto
}
