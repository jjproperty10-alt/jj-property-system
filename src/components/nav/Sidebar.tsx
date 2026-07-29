/**
 * @module nav/Sidebar
 * @description NAV-1 — Sidebar navigation rendered by the Operating Frame.
 *
 * Not a separate component contract — rendered by Frame, not by workspaces.
 * (Phase 3 Containment Map: "Sidebar Navigation (rendered by Frame)")
 *
 * Behavior:
 *   - Desktop: fixed left sidebar, always visible
 *   - Mobile: hidden by default, drawer overlay (TC-OF-8)
 *   - Navigation items derived from workspaces (G2)
 *   - Active workspace highlighted (G3)
 *   - Attention badges: null → nothing, 0 → nothing, >0 → count (G5, G6, EX-2)
 *   - Role filtering already applied by workspaceRegistry (G7)
 *
 * RSC boundary:
 *   Receives WorkspaceNavItem[] (serializable DTO) — no React components in props.
 *   Icon resolution: iconId string → Lucide component via WORKSPACE_ICONS map.
 *
 * DS v1.0 compliance:
 *   - Navy background: JJ_COLORS.navy.DEFAULT (#0f172a)
 *   - Typography: jj-body-sm (14px/1.5) for nav items
 *   - Radius: rounded-lg (DS radius.md)
 *   - No one-off UI — all tokens from DS v1.0
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — OperatingFrame, Cross-Component Containment Map
 * @see JJ_DESIGN_SYSTEM_V1.0.md — Part 2 Foundations
 */

'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import { Menu, X, LogOut, Home, Users, BarChart3, Building2 } from 'lucide-react'
import type { FrameUser, WorkspaceNavItem, WorkspaceIconId, WorkspaceAttention } from '@/lib/nav/types'
import { useGlobalContext, useSetMobileMenu } from './GlobalContextProvider'

// ─── Icon Resolution ────────────────────────────────────────────────────

/**
 * Maps WorkspaceIconId to Lucide icon components.
 * This is the client-side resolution point for the RSC serialization boundary.
 * WorkspaceNavItem carries iconId (closed union); this map resolves to the actual component.
 *
 * Both the key type (WorkspaceIconId) and the map in workspaceRegistry.ts
 * (WORKSPACE_ICON_IDS) must stay in sync. TypeScript enforces completeness.
 */
const WORKSPACE_ICONS: Record<WorkspaceIconId, ComponentType<{ className?: string }>> = {
  home: Home,
  ceo: Building2,
  owners: Users,
  finance: BarChart3,
}

// ─── Types ──────────────────────────────────────────────────────────────

interface SidebarProps {
  workspaces: readonly WorkspaceNavItem[]
  activeWorkspaceId: string | null
  user: FrameUser
}

// ─── Component ──────────────────────────────────────────────────────────

export function Sidebar({ workspaces, activeWorkspaceId, user }: SidebarProps) {
  const { attention, mobileMenuOpen } = useGlobalContext()
  const setMobileMenu = useSetMobileMenu()

  // Close mobile menu on workspace navigation
  const prevActiveRef = useRef(activeWorkspaceId)
  useEffect(() => {
    if (prevActiveRef.current !== activeWorkspaceId) {
      setMobileMenu(false)
      prevActiveRef.current = activeWorkspaceId
    }
  }, [activeWorkspaceId, setMobileMenu])

  // Shared nav content for desktop and mobile
  const navContent = (
    <>
      {/* Brand */}
      <div className="px-4 py-5 border-b border-white/10">
        <span className="text-lg font-semibold text-white tracking-tight">
          JJ Property
        </span>
      </div>

      {/* Navigation items */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-1">
        {workspaces.map((ws) => (
          <NavItem
            key={ws.id}
            workspace={ws}
            isActive={ws.id === activeWorkspaceId}
            attention={attention.get(ws.id) ?? null}
          />
        ))}
      </nav>

      {/* User identity + sign-out (A-R3) */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="text-sm font-medium text-white truncate">
          {user.name}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {user.email}
        </div>
        <form action="/api/auth/logout" method="POST" className="mt-2">
          <button
            type="submit"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </form>
      </div>
    </>
  )

  return (
    <>
      {/* ── Mobile hamburger button ──────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setMobileMenu(true)}
        className="fixed top-4 left-4 z-40 rounded-lg bg-white p-2 shadow-md md:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {/* ── Desktop sidebar (fixed) ──────────────────────────────────── */}
      <div
        className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-60"
        style={{ backgroundColor: '#0f172a' }}
      >
        {navContent}
      </div>

      {/* ── Desktop spacer (pushes main content right) ───────────────── */}
      <div className="hidden md:block md:w-60 md:flex-shrink-0" aria-hidden="true" />

      {/* ── Mobile overlay backdrop ──────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenu(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-60 flex flex-col md:hidden
          transform transition-transform duration-200 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ backgroundColor: '#0f172a' }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => setMobileMenu(false)}
          className="absolute top-4 right-4 rounded-md p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
        {navContent}
      </div>
    </>
  )
}

// ─── NavItem ────────────────────────────────────────────────────────────

interface NavItemProps {
  workspace: WorkspaceNavItem
  isActive: boolean
  attention: WorkspaceAttention | null
}

function NavItem({ workspace, isActive, attention }: NavItemProps) {
  const Icon = WORKSPACE_ICONS[workspace.iconId]
  const count = attention?.count ?? null

  // G6: null attention → no badge (P-ARCH-1)
  // EX-2: 0 → no badge (silence > noise)
  const showBadge = count !== null && count > 0

  return (
    <Link
      href={workspace.landingRoute}
      className={`
        flex items-center gap-3 rounded-lg px-3 py-2.5
        text-sm font-medium transition-colors
        ${isActive
          ? 'bg-white/10 text-white'
          : 'text-gray-300 hover:bg-white/5 hover:text-white'
        }
      `}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <span className="flex-1">{workspace.label}</span>
      {showBadge && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white"
          aria-label={`${count} item${count !== 1 ? 's' : ''} need attention`}
        >
          {count}
        </span>
      )}
    </Link>
  )
}
