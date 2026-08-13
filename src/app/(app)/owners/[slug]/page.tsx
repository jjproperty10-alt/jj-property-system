/**
 * /owners/[slug] — Owner Workspace
 *
 * 8-tab workspace for a single owner relationship.
 * Tab state is driven by ?tab= search param (URL-first navigation).
 *
 * Architecture:
 * - Server component owns data fetching and tab routing
 * - WorkspaceShell provides sticky header + tabpanel ARIA structure
 * - OwnerIdentityHeader renders identity + status (contains client TabNav)
 * - EntityContextBridge sets GlobalContext.entityContext for frame-level display
 * - Each tab component receives a DTO — no accounting logic in UI
 *
 * VS1: Page-level authentication added. authenticateStatementUser() is called
 * ONCE before any tab data is fetched. Fail closed — redirect to /login or 404
 * before rendering any content. This closes security gap E8 from Phase 0.
 *
 * Entity Context (RC-003):
 *   Server resolves canonical owner identity from the identity authority.
 *   EntityContextBridge (client) sets entityContext in GlobalContext on mount,
 *   clears it on unmount. OperatingFrame reads entityContext exclusively
 *   through GlobalContext — no prop drilling.
 *
 * PR #3 — JJ Workspace Navigation + Owner Workspace Design System
 * RC-003 — Owner Entity Context bridge
 * VS1 — Page-level authentication
 */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { WorkspaceShell } from '@/components/ds'
import { OwnerIdentityHeader } from '@/components/owners/OwnerIdentityHeader'
import { EntityContextBridge } from '@/components/owners/EntityContextBridge'
import { OverviewTab } from '@/components/owners/tabs/OverviewTab'
import { FinancialTab } from '@/components/owners/tabs/FinancialTab'
import { ReservationsTab } from '@/components/owners/tabs/ReservationsTab'
import { StrKpiRow } from '@/components/owners/StrKpiRow'
import { StrNeedsAttention } from '@/components/owners/StrNeedsAttention'
import { StrPropertyBreakdown } from '@/components/owners/StrPropertyBreakdown'
import { StrReconciliationTable } from '@/components/owners/StrReconciliationTable'
import { ReservationsPeriodNav } from '@/components/owners/ReservationsPeriodNav'
import { selectStrProperties } from '@/lib/owners/selectStrProperties'
import { buildOwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'
import { DocumentsTab } from '@/components/owners/tabs/DocumentsTab'
import { MaintenanceTab } from '@/components/owners/tabs/MaintenanceTab'
import { RelationshipTab } from '@/components/owners/tabs/RelationshipTab'
import { AuditTab } from '@/components/owners/tabs/AuditTab'
import { ServicesTab } from '@/components/owners/tabs/ServicesTab'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import {
  getOwnerWorkspace,
  getOwnerOverview,
  getOwnerFinancial,
  getOwnerReservations,
  getOwnerReservationActivity,
  getOwnerDocuments,
  getOwnerMaintenance,
  getOwnerRelationship,
  getOwnerAudit,
  getOwnerServiceEngagements,
  getOwnerEntityProperties,
  getOwnerRentalContracts,
} from '@/lib/owners/ownerWorkspaceService'
import {
  fetchPropertyRentPosition,
  fetchRentObligations,
  fetchRentTermHistory,
} from '@/lib/owners/rentPositionAdapter'
import type { RentPositionDTO, RentObligationRowDTO, RentTermDTO } from '@/lib/owners/ownerWorkspaceTypes'
import type { TabDef } from '@/components/ds'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────
// Tab definitions (fixed — order is part of the product contract)
// ─────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'financial', label: 'Financial' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'documents', label: 'Documents' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'relationship', label: 'Relationship' },
  { id: 'audit', label: 'Audit' },
  { id: 'services', label: 'Services' },
]

const VALID_TABS = new Set(TABS.map(t => t.id))
const DEFAULT_TAB = 'overview'

// ── Reservations month navigation helpers (URL-driven) ────────────────────────
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
function isValidMonth(m: string | undefined): m is string { return !!m && MONTH_RE.test(m) }
function addMonths(ym: string, delta: number): string {
  const [y, mo] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function monthBounds(ym: string): { start: string; end: string; label: string } {
  const [y, mo] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const last = new Date(Date.UTC(y, mo, 0))
  const end = `${ym}-${String(last.getUTCDate()).padStart(2, '0')}`
  const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { start, end, label }
}
function monthLabel(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function resHref(ym: string): string { return `?tab=reservations&resMonth=${ym}` }

// ─────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const { slug } = params
  return {
    title: `JJ — ${slug.replace(/-/g, ' ')}`,
  }
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default async function OwnerWorkspacePage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { tab?: string; period?: string; resMonth?: string }
}) {
  const { slug } = params
  const { tab: tabParam, period: periodParam, resMonth: resMonthParam } = searchParams

  // ── VS1: Page-level authentication (fail closed) ──────────────────────────
  // Authenticate ONCE before any data access. This closes security gap E8.
  // The same auth chain used by the statement route (HB5/HB6).
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    // NOT_STAFF, STAFF_INACTIVE, AUTH_ERROR → 404
    notFound()
  }

  const activeTab = VALID_TABS.has(tabParam ?? '') ? (tabParam as string) : DEFAULT_TAB

  // Fetch workspace identity (404 if owner not found)
  const workspace = await getOwnerWorkspace(slug)
  if (!workspace) {
    notFound()
  }

  // Period selection: period=all -> all-time view; otherwise current month
  const isAllHistory = periodParam === 'all'
  const { startDate, endDate, label: currentMonthLabel } = workspace.currentPeriod
  const periodLabel = isAllHistory ? 'All History' : currentMonthLabel

  // ── Reservations month selection (independent of the financial period) ──────
  // Probe which months have Hostaway activity, then choose the displayed month:
  //  1) explicit ?resMonth= wins
  //  2) else current month if it has activity
  //  3) else auto-default to the latest active month (surfaced explicitly to the user)
  const resActivity = await getOwnerReservationActivity(slug)
  const currentMonth = startDate.slice(0, 7)
  let resMonth = isValidMonth(resMonthParam) ? resMonthParam : currentMonth
  let resAutoDefaulted: string | null = null
  if (!isValidMonth(resMonthParam)
      && !resActivity.activeMonths.includes(currentMonth)
      && resActivity.latestActiveMonth
      && resActivity.latestActiveMonth !== currentMonth) {
    resMonth = resActivity.latestActiveMonth
    resAutoDefaulted = monthLabel(resActivity.latestActiveMonth)
  }
  const resBounds = monthBounds(resMonth)
  const resSelectedHasActivity = resActivity.activeMonths.includes(resMonth)

  // Fetch tab data — parallel where possible
  const [overview, financial, reservations, documents, maintenance, relationship, audit, services, entityProperties] =
    await Promise.all([
      getOwnerOverview(slug),
      isAllHistory
        ? getOwnerFinancial(slug)
        : getOwnerFinancial(slug, startDate, endDate),
      getOwnerReservations(slug, resBounds.start, resBounds.end),
      getOwnerDocuments(slug),
      getOwnerMaintenance(slug),
      getOwnerRelationship(slug),
      getOwnerAudit(slug),
      getOwnerServiceEngagements(slug),
      getOwnerEntityProperties(slug),
    ])

  // Fetch rental contracts for management_ltr engagements (depends on services result)
  const rentalContracts = await getOwnerRentalContracts(services)

  // Fetch P1 rent data (positions, obligations, terms) per rental contract
  // Collect all contracts + unique property IDs for position queries
  const allContracts: { id: string; propertyId: string }[] = []
  const uniquePropertyIds = new Set<string>()
  for (const contracts of Object.values(rentalContracts)) {
    for (const c of contracts) {
      allContracts.push({ id: c.id, propertyId: c.propertyId })
      uniquePropertyIds.add(c.propertyId)
    }
  }

  const rentPositions: Record<string, RentPositionDTO> = {}
  const rentObligations: Record<string, readonly RentObligationRowDTO[]> = {}
  const rentTerms: Record<string, readonly RentTermDTO[]> = {}

  if (allContracts.length > 0) {
    // Fetch positions per property (returns all contracts on that property)
    const positionFetches = Array.from(uniquePropertyIds).map(async (propId) => {
      const positions = await fetchPropertyRentPosition(propId)
      return positions
    })
    // Fetch obligations + terms per contract
    const contractFetches = allContracts.map(async ({ id }) => {
      const [obligations, terms] = await Promise.all([
        fetchRentObligations(id),
        fetchRentTermHistory(id),
      ])
      return { contractId: id, obligations, terms }
    })

    const [positionResults, contractResults] = await Promise.all([
      Promise.all(positionFetches),
      Promise.all(contractFetches),
    ])

    // Index positions by contract ID
    for (const positions of positionResults) {
      for (const pos of positions) {
        rentPositions[pos.rentalContractId] = pos
      }
    }
    // Index obligations + terms by contract ID
    for (const { contractId, obligations, terms } of contractResults) {
      rentObligations[contractId] = obligations
      rentTerms[contractId] = terms
    }
  }

  // Inject correction counts into tab labels
  const tabs: TabDef[] = TABS.map(tab => {
    if (tab.id === 'audit' && workspace.openCorrectionCount > 0) {
      return { ...tab, badgeCount: workspace.openCorrectionCount }
    }
    return tab
  })

  const tabBaseUrl = `/owners/${slug}`

  // STR reconciliation renders once per CANONICAL property that has an airbnb_str engagement.
  // This excludes legacy/duplicate managed-property names that are not STR properties
  // (e.g. the "Tamir Kiti" variants), so we never render empty "no engagement" panels for them.
  const strProperties = selectStrProperties(services)
  const strCockpit = activeTab === 'reservations' && strProperties.length > 0
    ? await buildOwnerStrCockpit({ properties: strProperties, startDate: resBounds.start, endDate: resBounds.end })
    : null

  return (
    <WorkspaceShell
      header={
        <OwnerIdentityHeader
          identity={workspace.identity}
          statementStatus={workspace.statementStatus}
          periodLabel={periodLabel}
          openCorrectionCount={workspace.openCorrectionCount}
          tabs={tabs}
          activeTab={activeTab}
          tabBaseUrl={tabBaseUrl}
        />
      }
      tabs={tabs}
      activeTab={activeTab}
    >
      {/* RC-003: Bridge server-resolved owner identity into GlobalContext.
       * EntityContextBridge sets entityContext on mount, clears on unmount.
       * The Frame reads entity identity exclusively through GlobalContext. */}
      <EntityContextBridge
        entityContext={{
          label: workspace.identity.name,
          type: 'owner',
        }}
      />

      {/* Tab 1 — Overview */}
      {activeTab === 'overview' && (
        <OverviewTab dto={overview} ownerName={workspace.identity.name} />
      )}

      {/* Tab 2 — Financial */}
      {activeTab === 'financial' && (
        <FinancialTab dto={financial} periodLabel={periodLabel} />
      )}

      {/* Tab 3 — Reservations */}
      {activeTab === 'reservations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Owner Statement</div>
              <div className="text-xs text-gray-500">Printable STR statement (PDF) for {resBounds.label}.</div>
            </div>
            <a
              href={`/owners/${slug}/statement/pdf?period=${resMonth}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="download-statement-link"
              className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            >
              Generate / Download Statement
            </a>
          </div>
          <ReservationsPeriodNav
            selectedLabel={resBounds.label}
            prevHref={resHref(addMonths(resMonth, -1))}
            nextHref={resHref(addMonths(resMonth, 1))}
            autoDefaultedLabel={resAutoDefaulted}
            latestActiveLabel={
              !resSelectedHasActivity && resActivity.latestActiveMonth && resActivity.latestActiveMonth !== resMonth
                ? monthLabel(resActivity.latestActiveMonth)
                : null
            }
            latestActiveHref={
              !resSelectedHasActivity && resActivity.latestActiveMonth && resActivity.latestActiveMonth !== resMonth
                ? resHref(resActivity.latestActiveMonth)
                : null
            }
          />
          {strCockpit ? <StrKpiRow cockpit={strCockpit} /> : null}
          <p className="text-xs text-gray-400">
            Figures reflect Hostaway reservation evidence for the selected month — not JJ ledger balances or owner payout.
          </p>
          {strCockpit ? <StrNeedsAttention cockpit={strCockpit} periodLabel={resBounds.label} financialHref={`/owners/${slug}?tab=financial`} /> : null}
          {strCockpit ? <StrPropertyBreakdown cockpit={strCockpit} /> : null}
          <ReservationsTab dto={reservations} hideKpis />
          {/* Compact STR reconciliation — one row per canonical property (read-only, lower priority). */}
          {strProperties.length === 0 ? (
            <p className="text-xs text-gray-400">No Airbnb/STR properties under active management for this owner.</p>
          ) : strCockpit ? (
            <StrReconciliationTable cockpit={strCockpit} periodLabel={resBounds.label} />
          ) : null}
        </div>
      )}

      {/* Tab 4 — Documents */}
      {activeTab === 'documents' && (
        <DocumentsTab documents={documents} />
      )}

      {/* Tab 5 — Maintenance */}
      {activeTab === 'maintenance' && (
        <MaintenanceTab items={maintenance} />
      )}

      {/* Tab 6 — Relationship */}
      {activeTab === 'relationship' && (
        <RelationshipTab events={relationship} />
      )}

      {/* Tab 7 — Audit */}
      {activeTab === 'audit' && (
        <AuditTab result={audit} />
      )}

      {/* Tab 8 — Services */}
      {activeTab === 'services' && (
        <ServicesTab dto={services} entityProperties={[...entityProperties]} rentalContracts={rentalContracts} rentPositions={rentPositions} rentObligations={rentObligations} rentTerms={rentTerms} />
      )}
    </WorkspaceShell>
  )
}
