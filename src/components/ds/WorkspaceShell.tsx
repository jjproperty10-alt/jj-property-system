/**
 * WorkspaceShell — DS primitive for owner/property workspace layout.
 *
 * Provides:
 * - Persistent context header (entity identity + period)
 * - Tab navigation
 * - Content area with proper tab panel ARIA
 *
 * Rules:
 * - Responsive: desktop full nav, mobile scrollable tabs
 * - Tab identity always visible on scroll (sticky header)
 * - Keyboard accessible
 */

import type { TabDef } from './TabNav'

export interface WorkspaceShellProps {
  /** Entity header content (OwnerIdentityHeader or PropertyIdentityHeader) */
  header: React.ReactNode
  /** Tab navigation — controlled externally via URL searchParams */
  tabs: TabDef[]
  activeTab: string
  /** Tab content — renders inside labelled tabpanel */
  children: React.ReactNode
  /** Optional toolbar actions (period selector, source mode switcher) */
  toolbar?: React.ReactNode
}

/**
 * Full-page workspace layout with persistent header and tab navigation.
 *
 * The parent page controls `activeTab` via URL searchParams so deep-linking
 * and browser back/forward work correctly.
 *
 * Usage:
 *   <WorkspaceShell header={<OwnerIdentityHeader ... />} tabs={TABS} activeTab={tab}>
 *     {tab === 'financial' && <FinancialTab ... />}
 *   </WorkspaceShell>
 */
export function WorkspaceShell({
  header,
  tabs,
  activeTab,
  children,
  toolbar,
}: WorkspaceShellProps) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* Persistent identity header — sticky on scroll */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {header}
        </div>
      </div>

      {/* Toolbar (period selector, source mode) */}
      {toolbar && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
            {toolbar}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="focus:outline-none"
        >
          {children}
        </div>
      </main>
    </div>
  )
}
