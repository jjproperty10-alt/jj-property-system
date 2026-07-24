/**
 * Owner Workspace Service — PR #3: JJ Workspace Navigation
 *
 * Adapter boundary between Supabase DB and Owner Workspace DTOs.
 *
 * Rules:
 * - Server-only: must never be imported into Client Components
 * - Reads `public.transactions` directly (RC3 view wiring is a future PR)
 * - Falls back to empty DTOs gracefully when schemas are absent
 * - Never computes owner-due or financial totals — those belong to RC3 engine
 * - Partner Capital Rule: payer/payee identity preserved in all reads
 * - Placeholder/demo values must come from ownerWorkspaceFixtures.ts
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
  FIXTURE_CLOSING_BALANCE_EUR,
} from './ownerWorkspaceFixtures'
import {
  nameToSlug,
  buildOwnerIdentity,
  isSystemActor,
} from './ownerWorkspaceUtils'
import type {
  OwnersRoomDTO,
  OwnerRoomItemDTO,
  OwnerIdentityDTO,
  OwnerWorkspaceDTO,
  OwnerOverviewDTO,
  OwnerFinancialDTO,
  OwnerReservationSummaryDTO,
  OwnerDocumentDTO,
  OwnerMaintenanceDTO,
  OwnerRelationshipEventDTO,
  OwnerAuditDTO,
  UpcomingEventDTO,
  TimelineEventDTO,
  HostawayPortfolioSummaryDTO,
  StatementStatus,
} from './ownerWorkspaceTypes'

// nameToSlug, buildOwnerIdentity, isSystemActor imported from ownerWorkspaceUtils
// (pure utilities — no server-only boundary, safe for client and test contexts)

// ─────────────────────────────────────────────────────────────
// Owners Room
// ─────────────────────────────────────────────────────────────

/**
 * Fetch the Owners Room listing.
 *
 * Data sources:
 * - Owner names / properties: `public.transactions` (distinct property_name, payer/payee)
 * - Statement status: `statements.statement_series` (if populated)
 * - Upcoming events: `statements.upcoming_events`
 *
 * Falls back gracefully when statements schema is empty.
 */
export async function getOwnersRoom(): Promise<OwnersRoomDTO> {
  // Derive owner list from transactions — unique payer values that represent real owners.
  // Known owner names from historical data (payer column in public.transactions).
  const KNOWN_OWNERS = [
    'Avi Cohen',
    'Tamir Levi',
    'Liron',
    'Alon',
    'Oshrit',
    'Oren',
    'Uriel',
    'Neer',
    'Efi',
  ]

  // Fetch distinct property_name values per known payer groups.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txData: any[] | null = null
  try {
    const sb = createServiceClient()
    const { data } = await sb
      .from('transactions')
      .select('property_name, payer, payee, review_status')
      .eq('review_status', 'active')
      .not('property_name', 'is', null)
    txData = data
  } catch (err) {
    console.error('[ownerWorkspaceService] getOwnersRoom: transactions.select failed', err instanceof Error ? err.message : String(err))
  }

  // Build property maps by scanning payer/payee
  const propertyMap = buildPropertyMap(txData ?? [])

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

  // Build room items
  const items: OwnerRoomItemDTO[] = buildRoomItems(propertyMap, seriesData ?? [])

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPropertyMap(rows: any[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()

  // Group by property to find primary owner via Owner → payer pattern
  for (const row of rows) {
    const prop = row.property_name as string
    if (!prop) continue

    // Payer = Owner means they paid something related to the property
    const payer = row.payer as string
    if (payer && payer !== 'JJ' && payer !== 'Airbnb' && payer !== 'Anastasia' && payer !== 'Tenant' && payer !== 'Client') {
      if (!map.has(payer)) map.set(payer, new Set())
      map.get(payer)!.add(prop)
    }

    // Payee = Owner means JJ paid them (BPO)
    const payee = row.payee as string
    if (payee && payee !== 'JJ' && payee !== 'Airbnb' && payee !== 'Anastasia' && payee !== 'Tenant' && payee !== 'Client' && payee !== 'Yossi' && payee !== 'Jacob') {
      if (!map.has(payee)) map.set(payee, new Set())
      map.get(payee)!.add(prop)
    }
  }

  return map
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRoomItems(propertyMap: Map<string, Set<string>>, _seriesData: any[]): OwnerRoomItemDTO[] {
  const items: OwnerRoomItemDTO[] = []

  for (const [name, props] of Array.from(propertyMap.entries())) {
    const properties = Array.from(props as Set<string>).sort()
    const slug = nameToSlug(name)
    const identity = buildOwnerIdentity(slug, name, properties)

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

export async function getOwnerWorkspace(slug: string): Promise<OwnerWorkspaceDTO | null> {
  // Resolve identity by slug: scan distinct payers/payees from transactions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txData: any[] | null = null
  try {
    const sb = createServiceClient()
    const { data } = await sb
      .from('transactions')
      .select('payer, payee, property_name, review_status')
      .eq('review_status', 'active')
      .not('property_name', 'is', null)
    txData = data
  } catch (err) {
    console.error('[ownerWorkspaceService] getOwnerWorkspace: transactions.select failed', err instanceof Error ? err.message : String(err))
    return null
  }

  if (!txData) return null

  // Find the matching owner by slug
  const names = new Set<string>()
  for (const row of txData) {
    if (row.payer && !isSystemActor(row.payer)) names.add(row.payer)
    if (row.payee && !isSystemActor(row.payee)) names.add(row.payee)
  }

  const matchedName = Array.from(names).find(n => nameToSlug(n) === slug)
  if (!matchedName) return null

  const properties = Array.from(
    new Set(
      txData
        .filter(r => r.payer === matchedName || r.payee === matchedName)
        .map(r => r.property_name)
        .filter(Boolean)
    )
  ).sort() as string[]

  const identity = buildOwnerIdentity(slug, matchedName, properties)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return {
    identity,
    currentPeriod: {
      label: monthLabel,
      startDate,
      endDate,
    },
    statementStatus: FIXTURE_STATEMENT_STATUS,
    openCorrectionCount: FIXTURE_OPEN_CORRECTIONS,
  }
}

// isSystemActor imported from ownerWorkspaceUtils

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
 * Fetch owner financial data from RC3 views.
 * RC3 views are named `v_rc3_*` in the public schema.
 * Falls back to empty DTO if views don't exist yet.
 */
export async function getOwnerFinancial(
  slug: string,
  startDate: string,
  endDate: string
): Promise<OwnerFinancialDTO> {
  // RC3 views: attempt to read owner-scoped financial summary
  // The view name and exact columns depend on RC3 engine state.
  // Using a safe catch pattern to return empty DTO if not yet available.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rc3Data: any = null
  try {
    const sb = createServiceClient()
    const _r = await sb.rpc('get_owner_financial_summary', {
      p_owner_slug: slug,
      p_start_date: startDate,
      p_end_date: endDate,
    })
    rc3Data = _r.data
  } catch {
    rc3Data = null
  }

  if (rc3Data) {
    // When RC3 RPC is available, map its output to OwnerFinancialDTO
    return mapRc3ToOwnerFinancial(rc3Data)
  }

  // Fallback: read active transactions for owner's properties directly
  // This is a degraded mode — values are informational, not engine-authoritative.
  return {
    position: {
      incomeEur: null,
      expensesEur: null,
      netEur: null,
      paidToOwnerEur: null,
      pendingEur: null,
      closingBalanceEur: null,
    },
    sections: [],
    timeline: [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRc3ToOwnerFinancial(data: any): OwnerFinancialDTO {
  return {
    position: {
      incomeEur: data.income_eur ?? null,
      expensesEur: data.expenses_eur ?? null,
      netEur: data.net_eur ?? null,
      paidToOwnerEur: data.paid_to_owner_eur ?? null,
      pendingEur: data.pending_eur ?? null,
      closingBalanceEur: FIXTURE_CLOSING_BALANCE_EUR, // RC2 scope — explicit fixture
    },
    sections: [],
    timeline: [],
  }
}

// ─────────────────────────────────────────────────────────────
// Tab 3 — Reservations
// ─────────────────────────────────────────────────────────────

export async function getOwnerReservations(
  slug: string,
  startDate: string,
  endDate: string
): Promise<OwnerReservationSummaryDTO> {
  // Source: pms.raw_reservations — joined to property mappings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resData: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('pms').from('raw_reservations')
      .select('*')
      .gte('arrivalDate', startDate)
      .lte('departureDate', endDate)
      .limit(200)
    resData = _r.data
  } catch {
    resData = null
  }

  if (!resData || resData.length === 0) {
    return emptyReservationSummary(startDate, endDate)
  }

  return mapReservations(resData, startDate, endDate)
}

function emptyReservationSummary(startDate: string, endDate: string): OwnerReservationSummaryDTO {
  return {
    period: { startDate, endDate },
    portfolio: {
      totalReservations: 0,
      occupancyPct: null,
      revenueEur: null,
      adr: null,
      revPar: null,
      cancellations: 0,
    },
    channelMix: [],
    reservations: [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReservations(rows: any[], startDate: string, endDate: string): OwnerReservationSummaryDTO {
  const reservations = rows.map(r => ({
    id: String(r.id ?? r.reservation_id ?? Math.random()),
    guestName: r.guestName ?? r.guest_name ?? null,
    propertyName: r.propertyName ?? r.property_name ?? 'Unknown',
    channel: r.channelName ?? r.channel ?? 'Unknown',
    checkIn: r.arrivalDate ?? r.arrival_date ?? '',
    checkOut: r.departureDate ?? r.departure_date ?? '',
    nights: Number(r.nightsCount ?? r.nights ?? 0),
    revenueEur: r.totalPrice != null ? String(r.totalPrice) : null,
    status: mapReservationStatus(r.status),
    source: 'hostaway' as const,
    evidenceRef: null,
  }))

  const totalRevenue = reservations.reduce((s, r) => s + (r.revenueEur ? parseFloat(r.revenueEur) : 0), 0)

  return {
    period: { startDate, endDate },
    portfolio: {
      totalReservations: reservations.length,
      occupancyPct: null,
      revenueEur: totalRevenue > 0 ? String(totalRevenue.toFixed(2)) : null,
      adr: null,
      revPar: null,
      cancellations: reservations.filter(r => r.status === 'cancelled').length,
    },
    channelMix: buildChannelMix(reservations),
    reservations,
  }
}

function mapReservationStatus(raw: string): 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show' {
  const map: Record<string, 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'> = {
    confirmed: 'confirmed',
    checked_in: 'checked_in',
    checked_out: 'checked_out',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    no_show: 'no_show',
  }
  return map[String(raw).toLowerCase()] ?? 'confirmed'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildChannelMix(reservations: any[]) {
  const byChannel = new Map<string, { count: number; revenue: number }>()
  for (const r of reservations) {
    const ch = r.channel || 'Unknown'
    const existing = byChannel.get(ch) ?? { count: 0, revenue: 0 }
    byChannel.set(ch, {
      count: existing.count + 1,
      revenue: existing.revenue + (r.revenueEur ? parseFloat(r.revenueEur) : 0),
    })
  }
  const total = reservations.length || 1
  return Array.from(byChannel.entries()).map(([channel, { count, revenue }]) => ({
    channel,
    count,
    revenueEur: revenue > 0 ? String(revenue.toFixed(2)) : null,
    pct: Math.round((count / total) * 100),
  }))
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

export async function getOwnerMaintenance(slug: string): Promise<OwnerMaintenanceDTO[]> {
  // Source: public.transactions with category=Renovation / subcategory=Maintenance
  // Returns maintenance items for properties owned by this slug.

  // Find owner's properties first
  const workspace = await getOwnerWorkspace(slug)
  if (!workspace) return []

  try {
    const sb = createServiceClient()
    const { data } = await sb
      .from('transactions')
      .select('id, date, description, property_name, amount_eur, subcategory, notes')
      .eq('review_status', 'active')
      .eq('category', 'Renovation')
      .in('property_name', workspace.identity.properties)
      .order('date', { ascending: false })
      .limit(50)

    if (!data) return []

    return data.map(row => ({
    id: String(row.id),
    title: row.description ?? row.subcategory ?? 'Maintenance item',
    propertyName: row.property_name ?? '',
    supplier: null,
    ownerImpact: null,
    status: 'completed' as const,
    nextAction: null,
    openedAt: row.date ?? '',
    resolvedAt: row.date ?? null,
    evidenceRefs: [],
    estimatedCostEur: null,
      actualCostEur: row.amount_eur != null ? String(row.amount_eur) : null,
    }))
  } catch (err) {
    console.error('[ownerWorkspaceService] getOwnerMaintenance: transactions.renovation failed', err instanceof Error ? err.message : String(err))
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

export async function getOwnerAudit(slug: string): Promise<OwnerAuditDTO> {
  // Evidence links from finance schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let evidenceData: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('finance').from('evidence_links')
      .select('*')
      .eq('entity_id', slug)
      .eq('validity_status', 'active')
      .limit(50)
    evidenceData = _r.data
  } catch {
    evidenceData = null
  }

  // Statement versions from statements schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statementsData: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('statements').from('sent_statement_snapshots').select('*').limit(20)
    statementsData = _r.data
  } catch {
    statementsData = null
  }

  return {
    evidenceItems: (evidenceData ?? []).map((e: Record<string, unknown>) => ({
      id: String(e.id),
      type: String(e.source_type ?? ''),
      strength: String(e.strength ?? 'supporting') as 'primary' | 'secondary' | 'supporting' | 'attestation',
      description: String(e.description ?? ''),
      date: e.period_start ? String(e.period_start) : null,
      source: String(e.source_ref ?? ''),
      verifiedAt: String(e.verified_at ?? ''),
      validityStatus: String(e.validity_status ?? 'active') as 'active' | 'needs_renewal' | 'expired',
    })),
    statementVersions: (statementsData ?? []).map((s: Record<string, unknown>) => ({
      id: String(s.id),
      version: Number(s.version ?? 1),
      period: String(s.period_label ?? ''),
      sentAt: s.sent_at ? String(s.sent_at) : null,
      status: 'sent' as const,
      channel: s.delivery_channel ? String(s.delivery_channel) : null,
      replacedBy: null,
      replacedFrom: null,
    })),
    correctionCases: [],
    decisionHistory: [],
    verificationHistory: [],
  }
}

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

export async function getHostawayPortfolio(
  startDate: string,
  endDate: string
): Promise<HostawayPortfolioSummaryDTO> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let properties: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('pms').from('raw_properties').select('*')
    properties = _r.data
  } catch {
    properties = null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mappings: any[] | null = null
  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _r = await (sb as any).schema('pms').from('pms_property_mappings').select('*')
    mappings = _r.data
  } catch {
    mappings = null
  }

  const propList = (properties ?? []) as Record<string, unknown>[]
  const mappingList = (mappings ?? []) as Record<string, unknown>[]

  const mappingByHostawayId = new Map(
    mappingList.map(m => [String(m.hostaway_property_id ?? ''), m])
  )

  return {
    period: { startDate, endDate },
    sourceMode: 'jj',
    properties: propList.map(p => {
      const hostawayId = String(p.hostaway_id ?? p.id ?? '')
      const mapping = mappingByHostawayId.get(hostawayId)
      return {
        propertyName: String(p.name ?? p.property_name ?? hostawayId),
        canonicalName: mapping ? String(mapping.canonical_property_name ?? '') : null,
        mappingStatus: mapping ? 'mapped' as const : 'unmapped' as const,
        reservations: 0,
        platformIncomeEur: null,
        platformFeesEur: null,
        cleaningIncomeEur: null,
        cleaningExpenseEur: null,
        operationalExpensesEur: null,
        managementFeeEur: null,
        ownerDueEur: null,
        reconciliationStatus: 'missing_jj' as const,
      }
    }),
    totals: {
      reservations: 0,
      revenueEur: null,
      feesEur: null,
      cleaningEur: null,
      ownerDueEur: null,
    },
    reconciliation: {
      matchedCount: 0,
      missingInJJ: 0,
      missingInHostaway: 0,
      amountDifferenceEur: null,
      hasDifferences: false,
    },
    propertiesNeedingAttention: [],
  }
}
