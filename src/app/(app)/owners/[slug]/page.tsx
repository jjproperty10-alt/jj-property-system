/**
 * /owners/[slug] — Owner Workspace
 *
 * 7-tab workspace for a single owner relationship.
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
import { DocumentsTab } from '@/components/owners/tabs/DocumentsTab'
import { MaintenanceTab } from '@/components/owners/tabs/MaintenanceTab'
import { RelationshipTab } from '@/components/owners/tabs/RelationshipTab'
import { AuditTab } from '@/components/owners/tabs/AuditTab'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import {
  getOwnerWorkspace,
  getOwnerOverview,
  getOwnerFinancial,
  getOwnerReservations,
  getOwnerDocuments,
  getOwnerMaintenance,
  getOwnerRelationship,
  getOwnerAudit,
} from '@/lib/owners/ownerWorkspaceService'
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
]

const VALID_TABS = new Set(TABS.map(t => t.id))
const DEFAULT_TAB = 'overview'

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
  searchParams: { tab?: string }
}) {
  const { slug } = params
  const { tab: tabParam } = searchParams

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

  // Current period for API calls
  const { startDate, endDate, label: periodLabel } = workspace.currentPeriod

  // Fetch tab data — parallel where possible
  const [overview, financial, reservations, documents, maintenance, relationship, audit] =
    await Promise.all([
      getOwnerOverview(slug),
      getOwnerFinancial(slug, startDate, endDate),
      getOwnerReservations(slug, startDate, endDate),
      getOwnerDocuments(slug),
      getOwnerMaintenance(slug),
      getOwnerRelationship(slug),
      getOwnerAudit(slug),
    ])

  // Inject correction counts into tab labels
  const tabs: TabDef[] = TABS.map(tab => {
    if (tab.id === 'audit' && workspace.openCorrectionCount > 0) {
      return { ...tab, badgeCount: workspace.openCorrectionCount }
    }
    return tab
  })

  const tabBaseUrl = `/owners/${slug}`

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
        <FinancialTab dto={financial} ownerSlug={slug} />
      )}

      {/* Tab 3 — Reservations */}
      {activeTab === 'reservations' && (
        <ReservationsTab dto={reservations} />
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
    </WorkspaceShell>
  )
}
