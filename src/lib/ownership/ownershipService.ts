/**
 * JJ Property 10 — Ownership Engine: Lookup Layer
 * Phase 2-A — 2026-07-12
 *
 * Reads from:
 *   entity_registry      → canonical property identity + entityType label
 *   partnership_ownership → ownership percentages, effective dates, confirmation
 *
 * NEVER reads from property_owners (contaminated table, superseded by partnership_ownership).
 *
 * Financial routing contract:
 *   partnership_ownership rows exist (confirmed + date-effective) → apply ownership pcts
 *   no such rows exist → 100% passthrough
 *   entity_type → presentation label only, never used for financial routing
 *
 * Design for testability:
 *   `resolveOwnership` is pure — accepts raw DB rows, returns PropertyOwnershipRecord.
 *   `fetchOwnershipForProperty` is the async DB wrapper — calls resolveOwnership.
 *   Unit tests target resolveOwnership directly; no DB mock required.
 */

import { createClient } from '@supabase/supabase-js'
import type {
  EntityType,
  OwnershipStructureRow,
  PropertyOwnershipRecord,
} from './types'

// ─── Supabase client ──────────────────────────────────────────────────────────
// Uses the same env vars as the rest of the app.
// Server-side only — never called from the browser.

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

// ─── Raw DB row shapes (private to this module) ───────────────────────────────

interface RawEntityRow {
  id: string
  canonical_name: string
  entity_type: string
}

interface RawOwnershipRow {
  partner_name: string
  ownership_pct: string | number
  effective_from: string
  effective_to: string | null
  confirmation_status: string
}

// ─── Pure logic (exported for unit tests) ────────────────────────────────────

/**
 * Resolve an ownership record from raw DB rows.
 *
 * Pure function — deterministic, no DB calls, fully unit-testable.
 *
 * Rules applied:
 *   1. Filter: confirmation_status = 'confirmed' only
 *   2. Filter: effective_from ≤ referenceDate
 *   3. Filter: effective_to IS NULL  OR  effective_to ≥ referenceDate
 *   4. If filtered set is empty → hasOwnershipRecords = false, ownershipPct = 100
 *   5. Match selectedOwner by name (case-insensitive)
 *   6. If no match found → ownershipPct = 0 (partner not in this property)
 *
 * @param entityRow     - Row from entity_registry for the property
 * @param ownershipRows - All rows from partnership_ownership for this entity (unfiltered)
 * @param selectedOwner - Partner name to resolve (e.g. "Avi", "JJ", "Oren")
 * @param referenceDate - ISO date string for effective date filtering (e.g. "2026-07-12")
 */
export function resolveOwnership(
  entityRow: RawEntityRow,
  ownershipRows: RawOwnershipRow[],
  selectedOwner: string,
  referenceDate: string,
): PropertyOwnershipRecord {
  const propertyName = entityRow.canonical_name
  const entityId = entityRow.id
  const entityType = entityRow.entity_type as EntityType

  // Step 1–3: Filter to confirmed, date-effective rows only
  const effectiveRows = ownershipRows.filter(row => {
    if (row.confirmation_status !== 'confirmed') return false
    if (row.effective_from > referenceDate) return false
    if (row.effective_to !== null && row.effective_to < referenceDate) return false
    return true
  })

  const allPartners: OwnershipStructureRow[] = effectiveRows.map(row => ({
    partnerName: row.partner_name,
    ownershipPct: Number(row.ownership_pct),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  }))

  const hasOwnershipRecords = allPartners.length > 0

  // Step 5: Find the selected owner's row (case-insensitive)
  const selectedPartner =
    allPartners.find(
      r => r.partnerName.toLowerCase() === selectedOwner.toLowerCase(),
    ) ?? null

  // Step 4 / 6: Resolve ownershipPct
  const ownershipPct = hasOwnershipRecords
    ? (selectedPartner?.ownershipPct ?? 0)
    : 100

  return {
    propertyName,
    entityId,
    entityType,
    hasOwnershipRecords,
    allPartners,
    selectedPartner,
    ownershipPct,
  }
}

// ─── DB fetch ─────────────────────────────────────────────────────────────────

/**
 * Fetch ownership data for a property from Supabase.
 *
 * Queries entity_registry + partnership_ownership only.
 * Never reads property_owners.
 *
 * On any DB error or entity-not-found: returns a safe 100% passthrough record
 * so the report renders even without ownership data (graceful degradation).
 *
 * @param propertyName  - canonical_name to look up in entity_registry
 * @param selectedOwner - partner name to resolve
 * @param referenceDate - ISO date for effective date filtering (defaults to today)
 */
export async function fetchOwnershipForProperty(
  propertyName: string,
  selectedOwner: string,
  referenceDate?: string,
): Promise<PropertyOwnershipRecord> {
  const refDate = referenceDate ?? new Date().toISOString().slice(0, 10)
  const supabase = getSupabaseClient()

  // ── 1. Look up entity in entity_registry ──────────────────────────────────
  const { data: entityData, error: entityError } = await supabase
    .from('entity_registry')
    .select('id, canonical_name, entity_type')
    .eq('canonical_name', propertyName)
    .eq('is_active', true)
    .maybeSingle()

  if (entityError || !entityData) {
    // Property not in entity_registry → 100% passthrough (safe default)
    return {
      propertyName,
      entityId: '',
      entityType: 'client_property',
      hasOwnershipRecords: false,
      allPartners: [],
      selectedPartner: null,
      ownershipPct: 100,
    }
  }

  // ── 2. Fetch all partnership_ownership rows for this entity ───────────────
  const { data: ownershipData, error: ownershipError } = await supabase
    .from('partnership_ownership')
    .select('partner_name, ownership_pct, effective_from, effective_to, confirmation_status')
    .eq('entity_id', entityData.id)

  if (ownershipError) {
    // DB error → safe 100% passthrough
    console.error(
      '[ownershipService] partnership_ownership fetch error:',
      ownershipError.message,
    )
    return {
      propertyName,
      entityId: entityData.id,
      entityType: entityData.entity_type as EntityType,
      hasOwnershipRecords: false,
      allPartners: [],
      selectedPartner: null,
      ownershipPct: 100,
    }
  }

  // ── 3. Resolve with pure function ─────────────────────────────────────────
  return resolveOwnership(
    entityData as RawEntityRow,
    (ownershipData ?? []) as RawOwnershipRow[],
    selectedOwner,
    refDate,
  )
}
