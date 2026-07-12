// test
/**
 * JJ Property 10 — Phase 2-B Orchestrator
 * 2026-07-13
 *
 * Server-only module. Connects Phase 2-A engines to the /owner route layer.
 *
 * Architecture rule (Phase 2-B, approved by Yossi):
 *   /owner/* and /client-report-rc3 both consume the same ReportingOutput.
 *   No calculation is duplicated between routes.
 *
 * Batch-first design:
 *   - One query to partnership_ownership (all rows for owner)
 *   - One query to entity_registry (all entities, batched by entity_id)
 *   - N parallel calls to fetchRC3Report (one per property)
 *   Avoids the N+1 query pattern.
 *
 * Exports:
 *   getOwnerPortfolio(ownerName, config)           → ReportingOutput (full portfolio)
 *   getOwnerProperty(ownerName, propertyName, cfg) → PropertyFetchResult | null
 *   assemblePortfolio(...)                         → ReportingOutput (pure, for unit tests)
 */

import { createServiceClient } from '@/lib/supabase'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import { resolveOwnership } from '@/lib/ownership/ownershipService'
import { buildPropertySettlement } from '@/lib/ownership/settlementEngine'
import { buildPortfolio } from '@/lib/ownership/portfolioEngine'
import { buildReportingOutput } from '@/lib/ownership/reportingEngine'
import type {
  OwnerIdentity,
  PropertySettlementDTO,
  ReportingOutput,
} from '@/lib/ownership/types'
import type { RC3PropertyReport } from '@/lib/report/types'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface ReportingConfig {
  /** ISO date e.g. "2024-01-01" — undefined means all time */
  periodFrom?: string
  periodTo?: string
  /** For effective-date filtering in partnership_ownership — defaults to today */
  referenceDate?: string
}

// ─── Raw DB row shapes (local, structurally compatible with ownershipService internals) ──

interface RawEntityRow {
  id: string
  canonical_name: string
  entity_type: string
}

interface RawOwnershipRow {
  entity_id: string
  partner_name: string
  ownership_pct: string | number
  effective_from: string
  effective_to: string | null
  confirmation_status: string
}

// ─── Pure assembly (exported for unit tests) ───────────────────────────────────

/**
 * Pure function: assemble a ReportingOutput from pre-fetched raw data.
 *
 * No DB calls — all data provided by caller.
 * Exported so unit tests verify assembly logic without DB mocks.
 *
 * @param entityRows        Active entities from entity_registry
 * @param allOwnershipRows  All partnership_ownership rows for this owner (any entity)
 * @param reports           Map from canonical_name → RC3PropertyReport
 * @param ownerName         The owner whose share to resolve (case-insensitive)
 * @param referenceDate     ISO date for effective-date filtering
 * @param period            Reporting period (from / to)
 */
export function assemblePortfolio(
  entityRows: RawEntityRow[],
  allOwnershipRows: RawOwnershipRow[],
  reports: Map<string, RC3PropertyReport>,
  ownerName: string,
  referenceDate: string,
  period: { from: string | null; to: string | null },
): ReportingOutput {
  const owner: OwnerIdentity = {
    name: ownerName,
    ownerType: 'external_investor',
  }

  const settlements: PropertySettlementDTO[] = []

  for (const entity of entityRows) {
    const report = reports.get(entity.canonical_name)
    if (!report) continue // no RC3 data — property has no transactions

    // Filter ownership rows to this entity, strip the entity_id (ownershipService doesn't need it)
    const ownershipRowsForEntity = allOwnershipRows
      .filter(r => r.entity_id === entity.id)
      .map(r => ({
        partner_name: r.partner_name,
        ownership_pct: r.ownership_pct,
        effective_from: r.effective_from,
        effective_to: r.effective_to,
        confirmation_status: r.confirmation_status,
      }))

    const ownership = resolveOwnership(
      { id: entity.id, canonical_name: entity.canonical_name, entity_type: entity.entity_type },
      ownershipRowsForEntity,
      ownerName,
      referenceDate,
    )

    settlements.push(buildPropertySettlement(report, ownership))
  }

  const portfolio = buildPortfolio(settlements, owner, period)
  return buildReportingOutput(portfolio)
}

// ─── DB batch helper ──────────────────────────────────────────────────────────

async function fetchOwnerEntityRows(
  ownerName: string,
): Promise<{ entities: RawEntityRow[]; ownershipRows: RawOwnershipRow[] }> {
  const supabase = createServiceClient()

  // Step 1: All partnership_ownership rows for this owner (case-insensitive match)
  const { data: ownershipData, error: ownershipError } = await supabase
    .from('partnership_ownership')
    .select(
      'entity_id, partner_name, ownership_pct, effective_from, effective_to, confirmation_status',
    )
    .ilike('partner_name', ownerName)

  if (ownershipError) {
    console.error('[orchestrator] partnership_ownership error:', ownershipError.message)
    throw new Error(`Failed to fetch ownership data: ${ownershipError.message}`)
  }

  const rows = (ownershipData ?? []) as RawOwnershipRow[]
  const entityIds = [...new Set(rows.map(r => r.entity_id))]

  if (entityIds.length === 0) {
    return { entities: [], ownershipRows: [] }
  }

  // Step 2: Batch entity_registry lookup (one round-trip, not N)
  const { data: entityData, error: entityError } = await supabase
    .from('entity_registry')
    .select('id, canonical_name, entity_type')
    .in('id', entityIds)
    .eq('is_active', true)

  if (entityError) {
    console.error('[orchestrator] entity_registry error:', entityError.message)
    throw new Error(`Failed to fetch entity data: ${entityError.message}`)
  }

  return {
    entities: (entityData ?? []) as RawEntityRow[],
    ownershipRows: rows,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the complete portfolio for one owner.
 *
 * Returns a channel-neutral ReportingOutput consumed by:
 *   /owner/[owner]  (Portfolio Dashboard)
 *   future: PDF renderer, API endpoint, Email template
 *
 * Batch design: 2 DB round-trips + N parallel RC3 report fetches.
 */
export async function getOwnerPortfolio(
  ownerName: string,
  config: ReportingConfig = {},
): Promise<ReportingOutput> {
  const referenceDate =
    config.referenceDate ?? new Date().toISOString().slice(0, 10)
  const period = {
    from: config.periodFrom ?? null,
    to: config.periodTo ?? null,
  }

  const { entities, ownershipRows } = await fetchOwnerEntityRows(ownerName)

  if (entities.length === 0) {
    // Owner has no partnership_ownership records — return empty portfolio
    const owner: OwnerIdentity = { name: ownerName, ownerType: 'external_investor' }
    const portfolio = buildPortfolio([], owner, period)
    return buildReportingOutput(portfolio)
  }

  // Fetch RC3 reports for all entities in parallel
  const reportEntries = await Promise.all(
    entities.map(async entity => {
      try {
        const report = await fetchRC3Report({
          reportingName: entity.canonical_name,
          fromDate: config.periodFrom,
          toDate: config.periodTo,
        })
        return [entity.canonical_name, report] as const
      } catch (err) {
        console.warn(
          `[orchestrator] fetchRC3Report failed for "${entity.canonical_name}":`,
          err,
        )
        return null
      }
    }),
  )

  const reports = new Map<string, RC3PropertyReport>(
    reportEntries.filter((e): e is NonNullable<typeof e> => e !== null),
  )

  return assemblePortfolio(entities, ownershipRows, reports, ownerName, referenceDate, period)
}

// ─── Single-property fetch ────────────────────────────────────────────────────

/** Result type returned by getOwnerProperty */
export interface PropertyFetchResult {
  settlement: PropertySettlementDTO
  owner: OwnerIdentity
  period: { from: string | null; to: string | null }
}

/**
 * Fetch ownership + RC3 data for a single property.
 *
 * Used by /owner/[owner]/[property] to avoid fetching all properties.
 * Returns null if the property is not found in entity_registry, or has no RC3 data.
 */
export async function getOwnerProperty(
  ownerName: string,
  propertyName: string,
  config: ReportingConfig = {},
): Promise<PropertyFetchResult | null> {
  const referenceDate =
    config.referenceDate ?? new Date().toISOString().slice(0, 10)
  const period = {
    from: config.periodFrom ?? null,
    to: config.periodTo ?? null,
  }

  const supabase = createServiceClient()

  // Targeted entity lookup
  const { data: entityData, error: entityError } = await supabase
    .from('entity_registry')
    .select('id, canonical_name, entity_type')
    .eq('canonical_name', propertyName)
    .eq('is_active', true)
    .maybeSingle()

  if (entityError || !entityData) return null
  const entity = entityData as RawEntityRow

  // Targeted ownership lookup for this entity
  const { data: ownershipData, error: ownershipError } = await supabase
    .from('partnership_ownership')
    .select(
      'entity_id, partner_name, ownership_pct, effective_from, effective_to, confirmation_status',
    )
    .eq('entity_id', entity.id)

  if (ownershipError) return null
  const rows = (ownershipData ?? []) as RawOwnershipRow[]

  // Fetch RC3 report
  let report: RC3PropertyReport
  try {
    report = await fetchRC3Report({
      reportingName: propertyName,
      fromDate: config.periodFrom,
      toDate: config.periodTo,
    })
  } catch {
    return null
  }

  const ownership = resolveOwnership(
    { id: entity.id, canonical_name: entity.canonical_name, entity_type: entity.entity_type },
    rows.map(r => ({
      partner_name: r.partner_name,
      ownership_pct: r.ownership_pct,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      confirmation_status: r.confirmation_status,
    })),
    ownerName,
    referenceDate,
  )

  const settlement = buildPropertySettlement(report, ownership)
  const owner: OwnerIdentity = { name: ownerName, ownerType: 'external_investor' }

  return { settlement, owner, period }
  }
