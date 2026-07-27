/**
 * @module nav/types
 * @description NAV-1 Architecture — Core type contracts.
 *
 * Implements:
 *   - Contract D (Global Context shape)
 *   - Contract B (Workspace Registration)
 *   - Contract C (Entity Context, Attention Items)
 *
 * Constitutional chain:
 *   Navigation Principles → Navigation Contract → Component Contracts → this file
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract D
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — Component Contracts
 */

import type { ComponentType } from 'react'

// ─── Frame User (OperatingFrame input) ──────────────────────────────────

/**
 * Authenticated user identity for the Operating Frame.
 * Resolved server-side from auth middleware + user_roles.
 * Role determines workspace visibility (Contract E).
 */
export interface FrameUser {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: 'ceo' | 'finance' | 'operations' | 'staff'
}

// ─── Workspace Registration (Contract B) ────────────────────────────────

/**
 * A registered workspace in the Operating Frame.
 * Every workspace MUST provide all required slots (Contract B.1).
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract B
 */
export interface WorkspaceRegistration {
  /** Immutable identifier. Never changes after registration. */
  readonly id: string
  /** User-facing name displayed in navigation. */
  readonly label: string
  /** Lucide icon component for navigation display. */
  readonly icon: ComponentType<{ className?: string }>
  /** Route loaded when nav item is clicked. */
  readonly landingRoute: string
  /** URL prefix for active-workspace detection. */
  readonly routePrefix: string
  /** Returns current attention count. null = unknown (P-ARCH-1). */
  readonly attentionProvider: () => Promise<number | null>
}

// ─── Entity Context (Contract C.2) ──────────────────────────────────────

/**
 * The entity being viewed within a workspace.
 * Set by workspace when user drills into an entity.
 * Cleared to null on workspace change (G4).
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract C.2
 */
export interface EntityContext {
  readonly label: string
  readonly type: 'owner' | 'property' | 'partner' | 'reservation' | 'decision'
  readonly parentLabel?: string
}

// ─── Attention (Contract C.2 / C.4) ────────────────────────────────────

/**
 * An item needing attention within a workspace.
 * Produced by business modules (Contract C.4).
 */
export interface AttentionItem {
  readonly id: string
  readonly label: string
  readonly severity: 'urgent' | 'normal' | 'info'
  readonly workspaceId: string
  readonly route: string
}

/**
 * Attention state for a single workspace.
 * count: null = unknown (show nothing, not "0").
 * items: empty until explicitly requested.
 */
export interface WorkspaceAttention {
  readonly count: number | null
  readonly items: readonly AttentionItem[]
}

// ─── Global Context (Contract D) ────────────────────────────────────────

/**
 * The shared state maintained by the Operating Frame.
 * Shape matches Contract D.1 exactly.
 * Workspaces read via useGlobalContext() — never mutate directly.
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract D
 */
export interface GlobalContextShape {
  /** Authenticated user identity */
  readonly user: FrameUser

  /** Currently active workspace (from currentPath matching routePrefix) */
  readonly activeWorkspaceId: string | null
  readonly activeWorkspaceLabel: string | null

  /** Entity being viewed (set by workspace, cleared on workspace change) */
  readonly entityContext: EntityContext | null

  /** Per-workspace attention counts (aggregated from providers) */
  readonly attention: ReadonlyMap<string, WorkspaceAttention>

  /** Whether the frame has completed initialization */
  readonly frameReady: boolean

  /** Mobile sidebar drawer state */
  readonly mobileMenuOpen: boolean
}
