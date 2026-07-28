/**
 * @module owners/EntityContextBridge
 * @description RC-003 — Bridge server-resolved owner identity into GlobalContext.
 *
 * This is the canonical pattern for workspace-to-frame entity communication.
 * The server page resolves the canonical owner identity from the identity
 * authority (identityResolverService), then passes it to this client component
 * which sets GlobalContext.entityContext on mount and clears it on unmount.
 *
 * Stability: STABLE after RC-003 merge.
 *
 * Responsibilities:
 *   ECB-R1: Set entityContext on mount with exact provided identity.
 *   ECB-R2: Update entityContext when owner identity changes.
 *   ECB-R3: Clear entityContext to null on unmount.
 *
 * Guarantees:
 *   G1: Sets exact provided context — no transformation.
 *   G2: Clears on unmount — deterministic cleanup.
 *   G3: Updates when identity prop changes.
 *   G4: No data access — pure context bridge.
 *   G5: No identity resolution — receives resolved identity only.
 *
 * Forbidden:
 *   ECB-F1: No Supabase imports.
 *   ECB-F2: No fetch / data access.
 *   ECB-F3: No DB access.
 *   ECB-F4: No route ownership / navigation.
 *   ECB-F5: No history.back().
 *   ECB-F6: No business calculations.
 *   ECB-F7: No rendering business UI (renders null).
 *   ECB-F8: No modifying GlobalContext shape.
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract C.2 (EntityContext)
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract D (GlobalContext)
 */

'use client'

import { useEffect } from 'react'
import { useUpdateEntityContext } from '@/components/nav/GlobalContextProvider'
import type { EntityContext } from '@/lib/nav/types'

// ─── Types ──────────────────────────────────────────────────────────────

export interface EntityContextBridgeProps {
  /** The resolved entity context to set in GlobalContext. */
  entityContext: EntityContext
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * Bridge component: sets GlobalContext.entityContext from server-resolved identity.
 *
 * Renders nothing — exists solely for the side effect of managing entity context.
 *
 * Usage (in server page):
 *   <EntityContextBridge entityContext={{ label: owner.name, type: 'owner' }} />
 */
export function EntityContextBridge({ entityContext }: EntityContextBridgeProps) {
  const updateEntityContext = useUpdateEntityContext()

  // ECB-R1: Set on mount. ECB-R2: Update when identity changes.
  useEffect(() => {
    updateEntityContext(entityContext)

    // ECB-R3: Clear on unmount (G2).
    return () => {
      updateEntityContext(null)
    }
    // Depend on serializable identity fields to detect changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityContext.label, entityContext.type, entityContext.parentLabel, updateEntityContext])

  // ECB-F7: Renders nothing — pure context bridge.
  return null
}
