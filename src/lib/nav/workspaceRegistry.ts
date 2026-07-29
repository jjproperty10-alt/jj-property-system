/**
 * @module nav/workspaceRegistry
 * @description NAV-1 — Workspace Registry.
 *
 * The single canonical list of all workspaces in the system.
 * Implements Contract B (Workspace Registration) and Contract E (Role Visibility).
 *
 * Navigation items are derived from this registry — never hardcoded (G2).
 * Role filtering omits unauthorized workspaces entirely — no disabled items (G7, EX-1).
 *
 * Registry governance (Phase 2 Appendix):
 *   - Adding a new workspace requires Nav Principle 9 (ADR/amendment + Yossi approval)
 *   - Changing an id is FORBIDDEN (immutable)
 *   - Changing canonicalLabel requires Yossi approval
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract B, Contract E, Appendix
 */

import { Home, Users, BarChart3, Building2 } from 'lucide-react'
import type { WorkspaceRegistration, FrameUser } from './types'

// ─── Workspace Definitions ──────────────────────────────────────────────

/**
 * All registered workspaces.
 * Only 'active' maturity workspaces with real routes are included.
 *
 * Registry entries (Phase 2 Appendix):
 *   home    — active — homeService — R9+R16
 *   ceo     — active — CEO Workspace (RC-004) — Option D
 *   owners  — active — identityResolverService — R11
 *   finance — active — Finance KG — R5+R6
 *
 * Not registered yet:
 *   properties  — future
 *   operations  — future
 *   admin       — foundation
 */
const WORKSPACES: readonly WorkspaceRegistration[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    landingRoute: '/home',
    routePrefix: '/home',
    attentionProvider: async () => null, // v1: Home attention not yet wired
  },
  {
    id: 'ceo',
    label: 'Company',
    icon: Building2,
    landingRoute: '/ceo',
    routePrefix: '/ceo',
    attentionProvider: async () => null, // RC-004: attention not yet wired
  },
  {
    id: 'owners',
    label: 'Owners',
    icon: Users,
    landingRoute: '/owners',
    routePrefix: '/owners',
    attentionProvider: async () => null, // v1: Owner attention not yet wired
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: BarChart3,
    landingRoute: '/finance',
    routePrefix: '/finance',
    attentionProvider: async () => null, // v1: Finance attention not yet wired
  },
]

// ─── Role Visibility (Contract E.1) ─────────────────────────────────────

/**
 * Per-workspace, per-role visibility matrix.
 * Derived from Contract E.1 Visibility Matrix.
 *
 * 'visible'  = Full access
 * 'readonly' = Read-only (workspace enforces internally per E-R6)
 * 'hidden'   = Omitted from navigation (E-R1: never disabled)
 */
const ROLE_VISIBILITY: Record<string, Record<FrameUser['role'], 'visible' | 'readonly' | 'hidden'>> = {
  home: {
    ceo: 'visible',
    finance: 'visible',
    operations: 'visible',
    staff: 'visible',
  },
  ceo: {
    ceo: 'visible',
    finance: 'hidden',
    operations: 'hidden',
    staff: 'hidden',
  },
  owners: {
    ceo: 'visible',
    finance: 'readonly',
    operations: 'hidden',
    staff: 'hidden',
  },
  finance: {
    ceo: 'visible',
    finance: 'visible',
    operations: 'hidden',
    staff: 'hidden',
  },
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Returns workspaces visible to the given role.
 * Omits unauthorized workspaces entirely (G7, E-R1).
 * Returns empty array if role is undefined (fail-closed).
 */
export function getRegisteredWorkspaces(
  role: FrameUser['role'] | undefined
): WorkspaceRegistration[] {
  if (!role) return []

  return WORKSPACES.filter((ws) => {
    const visibility = ROLE_VISIBILITY[ws.id]?.[role]
    return visibility === 'visible' || visibility === 'readonly'
  })
}

/**
 * Returns ALL registered workspaces regardless of role.
 * Used only for testing and registry validation — never for navigation rendering.
 */
export function getAllWorkspaces(): readonly WorkspaceRegistration[] {
  return WORKSPACES
}
