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
 * - Each tab component receives a DTO — no accounting logic in UI
 *
 * PR #3 — JJ Workspace Navigation + Owner Workspace Design System
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WorkspaceShell } from '@/components/ds'
import { OwnerIdentityHeader } from '@/components/owners/OwnerIdentityHeader'
import { OverviewTab } from '@/components/owners/tabs/OverviewTab'
import { FinancialTab } from '@/components/owners/tabs/FinancialTab'
import { ReservationsTab } from '@/components/owners/tabs/ReservationsTab'
import { DocumentsTab } from '@/components/owners/tabs/DocumentsTab'
import { MaintenanceTab } from '@/components/owners/tabs/MaintenanceTab'
import { RelationshipTab } from '@/components/owners/tabs/RelationshipTab'
import { AuditTab } from '@/components/owners/tabs/AuditTab'
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
      {/* Tab 1 — Overview */}
      {activeTab === 'overview' && (
        <OverviewTab dto={overview} ownerName={workspace.identity.name} />
      )}

      {/* Tab 2 — Financial */}
      {activeTab === 'financial' && (
        <FinancialTab dto={financial} />
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
        <AuditTab dto={audit} />
      )}
    </WorkspaceShell>
  )
}
