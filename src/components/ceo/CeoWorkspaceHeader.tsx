/**
 * CeoWorkspaceHeader — persistent header for CEO Workspace.
 *
 * SERVER COMPONENT — no 'use client' directive.
 * Tab interactivity is delegated to <CeoTabNavClient>.
 *
 * Shows:
 * - Workspace title ("Company")
 * - Tab navigation (client sub-component)
 *
 * RC-004 — CEO Workspace.
 * Pattern: same as OwnerIdentityHeader, simplified (no entity identity).
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — WorkspaceHeader contract
 */

import { CeoTabNavClient } from './CeoTabNavClient'
import type { TabDef } from '@/components/ds'

export interface CeoWorkspaceHeaderProps {
  tabs: TabDef[]
  activeTab: string
  tabBaseUrl: string
}

export function CeoWorkspaceHeader({ tabs, activeTab, tabBaseUrl }: CeoWorkspaceHeaderProps) {
  return (
    <div>
      {/* Identity row */}
      <div className="flex items-center gap-3 py-4">
        <h1 className="text-lg font-bold text-gray-900">Company</h1>
      </div>

      {/* Tab navigation — client component handles URL routing */}
      <CeoTabNavClient
        tabs={tabs}
        activeTab={activeTab}
        tabBaseUrl={tabBaseUrl}
      />
    </div>
  )
}
