'use client'

/**
 * CeoTabNavClient — URL-driven tab navigation for CEO Workspace.
 *
 * Client component: uses useRouter to push ?tab= search params.
 * Same pattern as OwnerTabNavClient (proven in Reference Case #1).
 *
 * RC-004 — CEO Workspace.
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract B
 */

import { useRouter } from 'next/navigation'
import { TabNav } from '@/components/ds'
import type { TabDef } from '@/components/ds'

export interface CeoTabNavClientProps {
  tabs: TabDef[]
  activeTab: string
  tabBaseUrl: string
}

export function CeoTabNavClient({ tabs, activeTab, tabBaseUrl }: CeoTabNavClientProps) {
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
