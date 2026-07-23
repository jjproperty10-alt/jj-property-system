'use client'

/**
 * OwnerTabNavClient — URL-driven tab navigation for Owner Workspace.
 *
 * Client component: uses useRouter to push ?tab= search params.
 * Must be separate from OwnerIdentityHeader (server component).
 */

import { useRouter } from 'next/navigation'
import { TabNav } from '@/components/ds'
import type { TabDef } from '@/components/ds'

export interface OwnerTabNavClientProps {
  tabs: TabDef[]
  activeTab: string
  /** Base URL — tab id is appended as ?tab=<id> */
  tabBaseUrl: string
}

export function OwnerTabNavClient({ tabs, activeTab, tabBaseUrl }: OwnerTabNavClientProps) {
  const router = useRouter()

  function handleTabChange(tabId: string) {
    router.push(`${tabBaseUrl}?tab=${tabId}`)
  }

  return (
    <TabNav
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    />
  )
}
