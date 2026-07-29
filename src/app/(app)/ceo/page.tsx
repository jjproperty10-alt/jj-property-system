import type { Metadata } from 'next'
import { WorkspaceShell } from '@/components/ds'
import { CeoWorkspaceHeader } from '@/components/ceo/CeoWorkspaceHeader'
import { getAuthorizedExecutiveBrief } from '@/lib/executive/executiveBriefService'
import { ExecutiveBrief } from '@/components/executive'
import type { TabDef } from '@/components/ds'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Company',
}

/**
 * CEO Workspace — the operational command center.
 *
 * RC-004 — First CEO Workspace vertical slice.
 *
 * Home answers "Am I okay?" CEO Workspace answers "What's the state of the business?"
 * This is not a Dashboard — it's a Workspace (DS v1.0, Option D).
 *
 * Two tabs (product contract — order fixed):
 *   Tab 1: Company — operational overview (placeholder for Gate 0)
 *   Tab 2: Brief — Executive Brief (reuses existing DAL-protected service)
 *
 * NAV-1 Composition (Tree A — Tabbed Workspace):
 *   OperatingFrame → WorkspaceShell → header (CeoWorkspaceHeader + TabNav) → tab content
 *
 * Authority Map:
 *   Executive Brief → ExecutiveBriefDTO (DAL-protected via getAuthorizedExecutiveBrief())
 *   Company tab → placeholder (future: cashboxes, P&L, company health, staff)
 *
 * @see RC004_GATE0_CEO_WORKSPACE.md — Gate 0 package
 * @see JJ_DESIGN_SYSTEM_V1.0.md — Part 6, Option D
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract B (Workspace)
 */

// ─────────────────────────────────────────────────────────────
// Tab definitions (fixed — order is part of the product contract)
// ─────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { id: 'company', label: 'Company' },
  { id: 'brief', label: 'Brief' },
]

const VALID_TABS = new Set(TABS.map(t => t.id))
const DEFAULT_TAB = 'company'

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default async function CeoWorkspacePage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const { tab: tabParam } = searchParams
  const activeTab = VALID_TABS.has(tabParam ?? '') ? (tabParam as string) : DEFAULT_TAB

  // Brief tab data — DAL-protected
  const briefResult = activeTab === 'brief'
    ? await getAuthorizedExecutiveBrief()
    : null

  const tabBaseUrl = '/ceo'

  return (
    <WorkspaceShell
      header={
        <CeoWorkspaceHeader
          tabs={TABS}
          activeTab={activeTab}
          tabBaseUrl={tabBaseUrl}
        />
      }
      tabs={TABS}
      activeTab={activeTab}
    >
      {/* Tab 1 — Company (placeholder for Gate 0) */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              Company overview coming soon.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Cashboxes, P&L, company health, and staff — all in one place.
            </p>
          </div>
        </div>
      )}

      {/* Tab 2 — Brief (Executive Brief — reuses existing DAL-protected service) */}
      {activeTab === 'brief' && briefResult !== null && briefResult.ok && (
        <ExecutiveBrief dto={briefResult.dto} />
      )}
      {activeTab === 'brief' && briefResult !== null && !briefResult.ok && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            Executive brief is not available right now.
          </p>
        </div>
      )}
      {activeTab === 'brief' && briefResult === null && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-400">
            Loading...
          </p>
        </div>
      )}
    </WorkspaceShell>
  )
}
