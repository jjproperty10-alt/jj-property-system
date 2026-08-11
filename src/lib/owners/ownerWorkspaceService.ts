/**
 * Owner Workspace Service — PR #3: JJ Workspace Navigation
 *
 * Adapter boundary between Supabase DB and Owner Workspace DTOs.
 *
 * Rules:
 * - Server-only: must never be imported into Client Components
 * - Falls back to empty DTOs gracefully when schemas are absent
 * - Never computes owner-due or financial totals — those belong to RC3 engine
 * - Partner Capital Rule: payer/payee identity preserved in all reads
 * - Placeholder/demo values must come from ownerWorkspaceFixtures.ts
 *
 * G1B: Identity resolution moved from payer/payee scanning to
 * canonical lifecycle schema (entity_identity + management_relationship).
 * After G1B, no component may scan transactions to discover owners.
 *
 * G3-A: Financial and Maintenance data now sourced via service/adapter layers:
 * - getOwnerFinancial → ownerFinancialService → ownerFinancialAdapter → RC3
 * - getOwnerMaintenance → ownerMaintenanceService → ownerMaintenanceAdapter → RC3
 * Neither function reads public.transactions directly (G3-1, G3-3, G3-5 resolved).
 *
 * G3-B: Reservations and Portfolio Hostaway Alignment (2026-07-25):
 * - getOwnerReservations → ownerReservationService → ownerReservationAdapter → Hostaway Audit
 * - getHostawayPortfolio → ownerPortfolioAdapter → Hostaway Audit
 * Neither function reads pms.* schemas directly (G3-2 resolved).
 * Guest masking applied to historical reservations (G3-19).
 *
 * @see ownerWorkspaceFixtures.ts — explicit fixture boundary
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import {
  FIXTURE_STATEMENT_STATUS,
  FIXTURE_OWNER_BALANCE_EUR,
  FIXTURE_BALANCE_DIRECTION,
  FIXTURE_OPEN_CORRECTIONS,
  FIXTURE_UPCOMING_COUNT,
  FIXTURE_PRIORITY_GROUP,
} from './ownerWorkspaceFixtures'
import {
  buildOwnerIdentity,
  computeConfigHealth,
  deduplicatePropertyNames,
} from './ownerWorkspaceUtils'
import {
  getAllVerifiedOwners,
  resolveBySlug,
} from '../identity'
import type { ResolvedManagedIdentityDTO } from '../identity'
import { getFinancial } from './ownerFinancialService'
import { getMaintenanceItems } from './ownerMaintenanceService'
import { getReservations } from './ownerReservationService'
import { getPortfolio } from './ownerPortfolioAdapter'
import type {
  OwnersRoomDTO,
  OwnerRoomItemDTO,
  OwnerWorkspaceDTO,
  OwnerWorkspaceResolutionResult,
  OwnerOverviewDTO,
  OwnerFinancialDTO,
  OwnerReservationSummaryDTO,
  OwnerDocumentDTO,
  OwnerMaintenanceItemDTO,
  OwnerRelationshipEventDTO,
  OwnerAuditDTO,
  UpcomingEventDTO,
  TimelineEventDTO,
  HostawayPortfolioSummaryDTO,
  OwnerServiceEngagementsDTO,
  EntityPropertyOption,
} from './ownerWorkspaceTypes'

// ─────────────────────────────────────────────────────────────
// Owners Room
// ─────────────────────────────────────────────────────────────

/**
 * Fetch the Owners Room listing.
 *
 * Data sources (G1B):
 * - Owner names / properties: `lifecycle.entity_identity` + `lifecycle.management_relationship`
 *   (canonical identity resolution — only verified relationships shown)
 * - Statement status: `statements.statement_series` (if populated)
 *
 * Falls back gracefully when statements schema is empty.
 * If lifecycle schema is unavailable, returns empty list (fail-closed).
 */
export async function getOwnersRoom(): Promise<OwnersRoomDTO> {
  // G1B: Identity resolution from lifecycle schema (canonical source).
  // Only verified relationships appear in the Owner Room.
  // Pending relationships are available separately but not listed as owners.
  const { owners, draftOwners } = await getAllVerifiedOwners()

  // Fetch statement_series for workflow status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let seriesData: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _sr = await (sb as any).schema('statements').from('statement_series').select('*').limit(100)
    seriesData = _sr.data
  } catch {
    seriesData = null
  }

  // Build room items from resolved identities (verified + draft)
  const items: OwnerRoomItemDTO[] = buildRoomItemsFromIdentities(owners, seriesData ?? [])

  // PR #4: Add draft owners from jj_relationships — separate semantics, isDraft=true
  for (const draft of (draftOwners ?? [])) {
    const identity = buildOwnerIdentity(
      draft.identity.entityId,
      draft.identity.displayName,
      [],
      draft.identity.preferredLanguage,
      draft.identity.country,
    )
    items.push({
      identity,
      statementStatus: FIXTURE_STATEMENT_STATUS,
      balanceDirection: FIXTURE_BALANCE_DIRECTION,
      balanceEur: FIXTURE_OWNER_BALANCE_EUR,
      lastStatementSentAt: null,
      nextActionSummary: null,
      openCorrectionCount: 0,
      upcomingCount: 0,
      priorityGroup: 'rest',
      configHealth: { state: 'incomplete', missingCount: 2, label: 'Missing: relationship verification, property association' },
      associatedPropertyCount: 0,
      isDraft: true,
    })
  }

  return {
    items,
    summary: {
      totalOwners: items.length,
      readyToSend: items.filter(i => i.statementStatus === 'draft').length,
      actionRequired: items.filter(i => i.statementStatus === 'action_required').length,
      openCorrections: items.reduce((sum, i) => sum + i.openCorrectionCount, 0),
    },
  }
}

/**
 * Build room items from canonical resolved identities.
 * G1B: replaces buildPropertyMap + buildRoomItems (payer/payee scanning).
 * Identity comes from lifecycle schema, not from transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRoomItemsFromIdentities(owners: readonly ResolvedManagedIdentityDTO[], _seriesData: any[]): OwnerRoomItemDTO[] {
  const items: OwnerRoomItemDTO[] = []

  for (const owner of owners) {
    const name = owner.identity.displayName
    const properties = owner.managedProperties.map(r => r.propertyName).sort()
    const identity = buildOwnerIdentity(owner.identity.entityId, name, properties, owner.identity.preferredLanguage, owner.identity.country)

    const configHealth = computeConfigHealth(owner.identity, owner.managedProperties)
    const dedupedProperties = deduplicatePropertyNames(owner.managedProperties)

    items.push({
      identity,
      statementStatus: FIXTURE_STATEMENT_STATUS,
      balanceDirection: FIXTURE_BALANCE_DIRECTION,
      balanceEur: FIXTURE_OWNER_BALANCE_EUR,
      lastStatementSentAt: null,
      nextActionSummary: null,
      openCorrectionCount: FIXTURE_OPEN_CORRECTIONS,
      upcomingCount: FIXTURE_UPCOMING_COUNT,
      priorityGroup: FIXTURE_PRIORITY_GROUP,
      configHealth,
      associatedPropertyCount: dedupedProperties.length,
      isDraft: false,
    })
  }

  return items.sort((a, b) => {
    const order = { today: 0, this_week: 1, rest: 2 }
    return order[a.priorityGroup] - order[b.priorityGroup]
  })
}

// ─────────────────────────────────────────────────────────────
// Owner Workspace — shell
// ─────────────────────────────────────────────────────────────

/**
 * Resolve an owner workspace with full outcome preservation.
 * G1B: canonical resolver with typed discriminated union result.
 *
 * New consumers should use this function to get explicit failure reasons.
 */
export async function resolveOwnerWorkspace(slug: string): Promise<OwnerWorkspaceResolutionResult> {
  const result = await resolveBySlug(slug)

  switch (result.status) {
    case 'not_found':
      return { status: 'not_found', slug: result.slug }
    case 'ambiguous':
      return { status: 'ambiguous', slug: result.slug, candidates: result.candidates }
    case 'relationship_missing':
      return { status: 'relationship_missing', entityId: result.entityId, displayName: result.displayName }
    case 'source_unavailable':
      return { status: 'source_unavailable', error: result.error }
    case 'resolved':
      break
  }

  const { data: resolved } = result
  const properties = resolved.managedProperties.map(r => r.propertyName).sort()
  const identity = buildOwnerIdentity(
    resolved.identity.entityId,
    resolved.identity.displayName,
    properties,
    resolved.identity.preferredLanguage,
    resolved.identity.country,
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return {
    status: 'resolved',
    workspace: {
      identity,
      currentPeriod: {
        label: monthLabel,
        startDate,
        endDate,
      },
      statementStatus: FIXTURE_STATEMENT_STATUS,
      openCorrectionCount: FIXTURE_OPEN_CORRECTIONS,
    },
  }
}

/**
 * Legacy wrapper — returns null for any non-resolved outcome.
 * Preserved for backward compatibility with existing tab functions
 * (getOwnerFinancial, getOwnerMaintenance) that call this and check for null.
 *
 * New consumers should use resolveOwnerWorkspace() instead.
 */
export async function getOwnerWorkspace(slug: string): Promise<OwnerWorkspaceDTO | null> {
  const result = await resolveOwnerWorkspace(slug)
  return result.status === 'resolved' ? result.workspace : null
}

// ─────────────────────────────────────────────────────────────
// Tab 1 — Overview
// ─────────────────────────────────────────────────────────────

export async function getOwnerOverview(slug: string): Promise<OwnerOverviewDTO> {
  const upcoming = await getUpcomingEvents(slug)

  return {
    financial: {
      balanceDirection: 'jj_owes_owner',
      balanceEur: null,
      pendingEur: null,
      lastPaymentAt: null,
      nextPaymentAt: null,
    },
    openItems: [],
    nextAction: null,
    upcomingPreview: upcoming.slice(0, 3),
    contractRenewalAlert: null,
    recentActivity: [],
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 2 — Financial
// ─────────────────────────────────────────────────────────────

/**
 * Fetch owner financial data from RC3 engine via service/adapter layer.
 *
 * G3-A: Replaces direct sb.rpc('get_owner_financial_summary', ...) call
 * (non-existent RPC — G3-1 violation resolved).
 *
 * Architecture: getOwnerFinancial → ownerFinancialService → ownerFinancialAdapter → fetchRC3Report
 * Workspace resolves owner properties via getOwnerWorkspace (identity resolver).
 * Service call is wrapped in try/catch — returns empty DTO on failure.
 */
export async function getOwnerFinancial(
  slug: string,
  startDate?: string,
  endDate?: string
): Promise<OwnerFinancialDTO> {
  const workspace = await getOwnerWorkspace(slug)
  if (!workspace) {
    return {
      position: {
        incomeEur: null,
        expensesEur: null,
        netEur: null,
        paidToOwnerEur: null,
        pendingEur: null,
        closingBalanceEur: null,
      },
      overallNet: null,
      sections: [],
      timeline: [],
    }
  }

  try {
    return await getFinancial({
      properties: workspace.identity.properties,
      fromDate: startDate,
      toDate: endDate,
    })
  } catch (err) {
    console.error(
      '[ownerWorkspaceService] getOwnerFinancial: service failed',
      err instanceof Error ? err.message : String(err),
    )
    return {
      position: {
        incomeEur: null,
        expensesEur: null,
        netEur: null,
        paidToOwnerEur: null,
        pendingEur: null,
        closingBalanceEur: null,
      },
      overallNet: null,
      sections: [],
      timeline: [],
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 3 — Reservations
// ─────────────────────────────────────────────────────────────

/**
 * Fetch reservation summary for owner's properties from Hostaway Audit.
 *
 * G3-B: Replaces direct pms.raw_reservations read (G3-2 violation resolved).
 * Also removes local revenue arithmetic (G3-5 resolved) and unmasked guest
 * names in historical reservations (G3-19 resolved).
 *
 * Architecture: getOwnerReservations → ownerReservationService → ownerReservationAdapter → Hostaway Audit
 * Property resolution: getOwnerWorkspace (identity resolver, PR #75 guard preserved).
 * Service call is wrapped in try/catch — returns empty DTO on failure.
 */
export async function getOwnerReservations(
  slug: string,
  startDate: string,
  endDate: string
): Promise<OwnerReservationSummaryDTO> {
  const workspace = await getOwnerWorkspace(slug)
  if (!workspace) {
    return {
      period: { startDate, endDate },
      portfolio: {
        totalReservations: 0,
        occupancyPct:      null,
        revenueEur:        null,
        adr:               null,
        revPar:            null,
        cancellations:     0,
      },
      channelMix:   [],
      reservations: [],
    }
  }

  return getReservations({
    properties: workspace.identity.properties,
    startDate,
    endDate,
  })
}

// ─────────────────────────────────────────────────────────────
// Tab 4 — Documents
// ─────────────────────────────────────────────────────────────

export async function getOwnerDocuments(slug: string): Promise<OwnerDocumentDTO[]> {
  // Placeholder: documents module not yet implemented.
  // Returns empty list — EmptyState component will handle display.
  void slug
  return []
}

// ─────────────────────────────────────────────────────────────
// Tab 5 — Maintenance
// ─────────────────────────────────────────────────────────────

/**
 * Fetch maintenance items for an owner's properties.
 *
 * G3-A: Replaces direct public.transactions read (G3-3 violation resolved).
 * Also removes hardcoded `status: 'completed' as const` (G3-5 violation resolved).
 * Data now sourced from RC3 renovation account via service/adapter layer.
 *
 * Architecture: getOwnerMaintenance → ownerMaintenanceService → ownerMaintenanceAdapter → fetchRC3Report
 * Property resolution: getOwnerWorkspace (identity resolver, PR #75 guard preserved).
 * Service call is wrapped in try/catch — returns [] on failure.
 */
export async function getOwnerMaintenance(slug: string): Promise<OwnerMaintenanceItemDTO[]> {
  // Property resolution: getOwnerWorkspace preserves PR #75 SSR guard.
  // Returns null when identity resolver fails → function returns [] safely.
  const workspace = await getOwnerWorkspace(slug)
  if (!workspace) return []

  try {
    return await getMaintenanceItems({
      properties: workspace.identity.properties,
    })
  } catch (err) {
    console.error(
      '[ownerWorkspaceService] getOwnerMaintenance: service failed',
      err instanceof Error ? err.message : String(err),
    )
    return []
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 6 — Relationship
// ─────────────────────────────────────────────────────────────

export async function getOwnerRelationship(slug: string): Promise<OwnerRelationshipEventDTO[]> {
  // Source: statements.statement_events filtered by owner.
  // Placeholder until communication module is implemented.
  void slug
  return []
}

// ─────────────────────────────────────────────────────────────
// Tab 7 — Audit
// ─────────────────────────────────────────────────────────────

/**
 * Resolve audit data for an owner slug.
 *
 * Returns AuditResolutionResult — a discriminated union. The caller
 * MUST switch on .status before accessing .data.
 *
 * Delegates to ownerAuditAdapter which:
 *   - Resolves identity via G1 identityResolverService
 *   - Bridges to registry.parties via resolve_party_id RPC
 *   - Scopes snapshot queries by owner_party_id (fixes Bug #2)
 *   - Queries evidence by canonical_name (fixes Bug #1)
 *   - Returns explicit failure status on every error (fixes Bug #3)
 *
 * Gate A–E investigation (2 Aug 2026).
 */
export { resolveOwnerAudit as getOwnerAudit } from './ownerAuditAdapter'

// ─────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────

export async function getOwnerTimeline(slug: string): Promise<TimelineEventDTO[]> {
  const upcoming = await getUpcomingEvents(slug)

  // Derive past events from statement events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let events: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('statements').from('statement_events').select('*').limit(50)
    events = _r.data
  } catch {
    events = null
  }

  const today = new Date().toISOString().slice(0, 10)

  const pastItems: TimelineEventDTO[] = (events ?? []).map((e: Record<string, unknown>) => ({
    id: String(e.id),
    zone: 'past' as const,
    dotShape: 'filled' as const,
    dotLabel: 'Confirmed event',
    title: String(e.event_type ?? 'Event'),
    date: e.occurred_at ? String(e.occurred_at).slice(0, 10) : null,
    dateConfidence: 'confirmed' as const,
    propertyName: null,
    type: String(e.event_type ?? ''),
    assignedTo: null,
    source: null,
    lastVerifiedAt: null,
    evidenceRef: null,
  }))

  const upcomingItems: TimelineEventDTO[] = upcoming.map(u => {
    const isOverdue = u.dueDate < today && u.status !== 'confirmed'
    return {
      id: u.id,
      zone: isOverdue ? 'now' as const : 'upcoming' as const,
      dotShape: 'open' as const,
      dotLabel: isOverdue ? 'Overdue action' : 'Pending',
      title: u.title,
      date: u.dueDate,
      dateConfidence: 'confirmed' as const,
      propertyName: u.propertyName,
      type: u.source,
      assignedTo: u.assignedTo,
      source: u.source,
      lastVerifiedAt: u.lastVerifiedAt,
      evidenceRef: null,
    }
  })

  return [...upcomingItems, ...pastItems]
}

// ─────────────────────────────────────────────────────────────
// Upcoming Events
// ─────────────────────────────────────────────────────────────

export async function getUpcomingEvents(slug: string): Promise<UpcomingEventDTO[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('statements').from('upcoming_events').select('*').limit(20)
    data = _r.data
  } catch {
    data = null
  }

  if (!data) return []

  return (data as Record<string, unknown>[]).map(row => ({
    id: String(row.id),
    ownerPartyId: String(row.owner_party_id ?? slug),
    propertyName: row.property_name ? String(row.property_name) : null,
    title: String(row.title ?? ''),
    dueDate: String(row.due_date ?? ''),
    source: String(row.source ?? 'task') as UpcomingEventDTO['source'],
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    status: String(row.status ?? 'pending') as UpcomingEventDTO['status'],
    lastVerifiedAt: String(row.last_verified_at ?? new Date().toISOString()),
  }))
}

// ─────────────────────────────────────────────────────────────
// Hostaway Portfolio
// ─────────────────────────────────────────────────────────────

/**
 * Fetch Hostaway portfolio summary from approved property mappings.
 *
 * G3-B: Replaces direct pms.raw_properties + pms.pms_property_mappings reads
 * (G3-2 violation resolved). Data now sourced via ownerPortfolioAdapter → Hostaway Audit.
 *
 * Architecture: getHostawayPortfolio → ownerPortfolioAdapter → listAuditableProperties()
 * Financial aggregates are null in V1 — per-property audit runs required (RC2 scope).
 */
export async function getHostawayPortfolio(
  startDate: string,
  endDate: string
): Promise<HostawayPortfolioSummaryDTO> {
  return getPortfolio({ startDate, endDate })
}

// -------------------------------------------------------------
// Service Engagements (P2 PR #2 -- Read Layer)
// -------------------------------------------------------------

/**
 * Fetch service engagements for an owner.
 *
 * P2 PR #2: Read-only layer connecting lifecycle.service_engagements
 * to Owner Workspace via G3 adapter pattern.
 *
 * Architecture: getOwnerServiceEngagements -> ownerServiceEngagementAdapter
 *               -> lifecycle.get_entity_service_engagements RPC
 *
 * Returns empty OwnerServiceEngagementsDTO when:
 * - Owner slug cannot be resolved (fail-closed)
 * - No engagements exist (normal -- table starts empty)
 * - RPC fails (adapter fail-closed)
 */
export async function getOwnerServiceEngagements(
  slug: string,
): Promise<OwnerServiceEngagementsDTO> {
  const empty: OwnerServiceEngagementsDTO = {
    entityId: '',
    properties: [],
    totalEngagements: 0,
  }

  // Resolve slug -> entity identity (reuse G1 canonical service)
  const identity = await resolveBySlug(slug)
  if (identity.status !== 'resolved') return empty

  const entityId = identity.data.identity.entityId

  // Delegate to adapter
  const { fetchEntityServiceEngagements } = await import('./ownerServiceEngagementAdapter')
  return fetchEntityServiceEngagements(entityId)
}

/**
 * Fetch properties associated with an owner entity.
 *
 * P2 PR #4: Provides property options for the "Add Service" form dropdown.
 * Uses entity_property_associations → property_definitions.
 *
 * Returns empty array when:
 * - Owner slug cannot be resolved
 * - No property associations exist (normal for new entities)
 */
export async function getOwnerEntityProperties(
  slug: string,
): Promise<readonly EntityPropertyOption[]> {
  const identity = await resolveBySlug(slug)
  if (identity.status !== 'resolved') return []

  const entityId = identity.data.identity.entityId

  const { fetchEntityProperties } = await import('./ownerServiceEngagementAdapter')
  return fetchEntityProperties(entityId)
}
