/**
 * TabNav — DS primitive for workspace tab navigation.
 *
 * Rules (DS_2035_PRODUCT_PRINCIPLES.md):
 * - Keyboard navigable (arrow keys + Enter)
 * - Visible focus states
 * - Status not communicated by color alone
 * - motion-reduce safe
 * - RTL isolated (tab labels may be Hebrew)
 */

'use client'

import { useCallback } from 'react'

export interface TabDef {
  id: string
  label: string
  /** Short badge count for open items (e.g. corrections, alerts) */
  badgeCount?: number
}

export interface TabNavProps {
  tabs: TabDef[]
  activeTab: string
  onTabChange: (tabId: string) => void
  /** Additional class names */
  className?: string
}

/**
 * Horizontal tab navigation bar for workspaces.
 *
 * Usage:
 *   <TabNav tabs={TABS} activeTab="financial" onTabChange={setTab} />
 */
export function TabNav({ tabs, activeTab, onTabChange, className = '' }: TabNavProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const direction = e.key === 'ArrowRight' ? 1 : -1
        const next = (currentIndex + direction + tabs.length) % tabs.length
        onTabChange(tabs[next].id)
      }
    },
    [tabs, onTabChange]
  )

  return (
    <nav
      role="tablist"
      aria-label="Workspace tabs"
      className={`flex items-center gap-0 border-b border-gray-200 bg-white ${className}`}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={e => handleKeyDown(e, i)}
            className={[
              'relative px-4 py-3 text-sm font-medium transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
              'motion-reduce:transition-none',
              isActive
                ? 'text-gray-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gray-900'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.badgeCount != null && tab.badgeCount > 0 && (
                <span
                  aria-label={`${tab.badgeCount} open items`}
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-1"
                >
                  {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
